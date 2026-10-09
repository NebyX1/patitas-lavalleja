import { atom } from 'nanostores';
import { pets } from '../../data/pets';

export const $favorites = atom<string[]>([]);
export const $theme = atom<'light' | 'dark'>('light');
export const $motionPaused = atom(false);
export const $feedback = atom('');
let initialized = false;
let feedbackTimer: ReturnType<typeof setTimeout>;
const ids = new Set(pets.map((p) => p.id));

export function readFavorites(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed)
      ? [
          ...new Set(
            parsed.filter(
              (id): id is string => typeof id === 'string' && ids.has(id),
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
  } catch {
    /* Memory fallback. */
  }
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
        $favorites.set(
          readFavorites(localStorage.getItem('patitas-favorites-v1')),
        );
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

export function toggleFavorite(id: string) {
  if (!ids.has(id)) return;
  const saved = $favorites.get().includes(id);
  const next = saved
    ? $favorites.get().filter((value) => value !== id)
    : [...$favorites.get(), id];
  $favorites.set(next);
  let persistent = true;
  try {
    localStorage.setItem('patitas-favorites-v1', JSON.stringify(next));
  } catch {
    persistent = false;
  }
  const name = pets.find((p) => p.id === id)?.name;
  notify(
    `${saved ? `Quitaste a ${name} de tus favoritos.` : `${name} ya tiene un lugar en tus favoritos.`}${persistent ? '' : ' El navegador solo permite guardarlos durante esta visita.'}`,
  );
}

export function clearFavorites() {
  $favorites.set([]);
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
