import { atom } from 'nanostores';
import { $session, api, getSession, errorMessage } from '../../lib/api';

export const $favorites = atom<string[]>([]);
export const $theme = atom<'light' | 'dark'>('light');
export const $motionPaused = atom(false);
export const $feedback = atom('');
let initialized = false;
let feedbackTimer: ReturnType<typeof setTimeout>;
const validId = (id: string) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
let visitorFavorites: string[] = [];
let favoriteIdentity = '';
const pendingFavorites = new Set<string>();
export function favoriteIds(value: unknown): string[] {
  const data = value as {
    items?: unknown[];
    pet_ids?: string[];
    ids?: string[];
  };
  const list = Array.isArray(value)
    ? value
    : (data?.pet_ids ?? data?.ids ?? data?.items ?? []);
  return [
    ...new Set(
      list
        .map((entry) =>
          typeof entry === 'string'
            ? entry
            : ((
                entry as { pet_id?: string; id?: string; pet?: { id?: string } }
              )?.pet_id ??
              (entry as { id?: string })?.id ??
              (entry as { pet?: { id?: string } })?.pet?.id),
        )
        .filter((id): id is string => typeof id === 'string' && validId(id)),
    ),
  ];
}
export async function refreshFavorites() {
  const identity = $session.get()?.user?.id;
  if (!$session.get()?.authenticated) return;
  const value = favoriteIds(await api('/me/favorites'));
  if ($session.get()?.user?.id === identity) $favorites.set(value);
}

export function readFavorites(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter(
              (id): id is string => typeof id === 'string' && validId(id),
            ),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

export function notify(message: string) {
  clearTimeout(feedbackTimer);
  $feedback.set(message);
  feedbackTimer = setTimeout(() => $feedback.set(''), 4000);
}

export function initializeClientState() {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;
  $theme.set(
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  try {
    $favorites.set(readFavorites(localStorage.getItem('patitas-favorites-v1')));
    visitorFavorites = $favorites.get();
  } catch {
    /* Memory fallback. */
  }
  $session.subscribe((session) => {
    const identity = session?.authenticated ? (session.user?.id ?? '') : '';
    if (identity === favoriteIdentity) return;
    favoriteIdentity = identity;
    if (identity)
      void refreshFavorites().catch((error) => notify(errorMessage(error)));
    else $favorites.set(visitorFavorites);
  });
  void getSession().catch(() => {});
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const themeMedia = matchMedia('(prefers-color-scheme: dark)');
  let motion: string | null = null;
  try {
    motion = localStorage.getItem('patitas-motion');
  } catch {
    /* System preference. */
  }
  $motionPaused.set(motion ? motion === 'paused' : media.matches);
  $motionPaused.subscribe((paused) => {
    document.documentElement.dataset.motion = paused ? 'paused' : 'active';
    window.dispatchEvent(new Event('patitas:motion'));
  });
  window.addEventListener('storage', (event) => {
    if (event.key === 'patitas-favorites-v1' || event.key === null) {
      try {
        visitorFavorites = readFavorites(
          localStorage.getItem('patitas-favorites-v1'),
        );
        if (!$session.get()?.authenticated) $favorites.set(visitorFavorites);
      } catch {
        /* Keep memory. */
      }
    }
    if (event.key === 'patitas-theme' || event.key === null) {
      const theme =
        event.newValue === 'dark' ||
        (event.newValue !== 'light' && themeMedia.matches)
          ? 'dark'
          : 'light';
      $theme.set(theme);
      document.documentElement.dataset.theme = theme;
    }
    if (event.key === 'patitas-motion' || event.key === null)
      $motionPaused.set(
        event.newValue ? event.newValue === 'paused' : media.matches,
      );
  });
  media.addEventListener('change', (event) => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('patitas-motion');
    } catch {
      /* Follow system. */
    }
    if (!saved) $motionPaused.set(event.matches);
  });
  themeMedia.addEventListener('change', (event) => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('patitas-theme');
    } catch {
      /* Follow system. */
    }
    if (!saved) {
      $theme.set(event.matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = $theme.get();
    }
  });
}

export async function toggleFavorite(id: string) {
  if (!validId(id) || pendingFavorites.has(id)) return;
  const saved = $favorites.get().includes(id);
  if (!saved && $favorites.get().length >= 100) {
    notify(
      'Podés guardar hasta 100 historias. Quitá alguna para dar lugar a una nueva.',
    );
    return;
  }
  const next = saved
    ? $favorites.get().filter((value) => value !== id)
    : [...$favorites.get(), id];
  $favorites.set(next);
  if ($session.get()?.authenticated) {
    pendingFavorites.add(id);
    const identity = $session.get()?.user?.id;
    try {
      await api(
        saved ? `/me/favorites/${encodeURIComponent(id)}` : '/me/favorites',
        {
          method: saved ? 'DELETE' : 'POST',
          ...(saved ? {} : { body: { pet_id: id } }),
        },
      );
      notify(
        saved
          ? 'Quitaste esta historia de tus favoritos.'
          : 'Historia guardada en tu cuenta.',
      );
    } catch (error) {
      if ($session.get()?.user?.id === identity)
        $favorites.set(
          saved
            ? [...new Set([...$favorites.get(), id])]
            : $favorites.get().filter((value) => value !== id),
        );
      notify(errorMessage(error));
    } finally {
      pendingFavorites.delete(id);
    }
    return;
  }
  visitorFavorites = next;
  let persistent = true;
  try {
    localStorage.setItem('patitas-favorites-v1', JSON.stringify(next));
  } catch {
    persistent = false;
  }
  notify(
    `${saved ? 'Quitaste esta historia de tus favoritos.' : 'Guardaste esta historia en este navegador.'}${persistent ? '' : ' El navegador solo permite guardarlos durante esta visita.'}`,
  );
}

export async function clearFavorites() {
  if ($session.get()?.authenticated) {
    try {
      for (const id of $favorites.get())
        await api(`/me/favorites/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
    } catch (error) {
      notify(errorMessage(error));
      await refreshFavorites();
      return;
    }
  }
  $favorites.set([]);
  visitorFavorites = [];
  try {
    localStorage.removeItem('patitas-favorites-v1');
  } catch {
    /* Memory already cleared. */
  }
  notify('Borramos los favoritos de este navegador.');
}

export function toggleTheme() {
  const next = $theme.get() === 'dark' ? 'light' : 'dark';
  $theme.set(next);
  document.documentElement.dataset.theme = next;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'dark' ? '#101218' : '#f7f5ef');
  try {
    localStorage.setItem('patitas-theme', next);
  } catch {
    /* Memory fallback. */
  }
}

export function toggleMotion() {
  const next = !$motionPaused.get();
  $motionPaused.set(next);
  try {
    localStorage.setItem('patitas-motion', next ? 'paused' : 'active');
  } catch {
    /* Memory fallback. */
  }
}
