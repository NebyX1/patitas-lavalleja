/** Keep post-login navigation inside the site and avoid returning to login. */
export function safeReturnPath(value: string | null): string {
  if (
    !value?.startsWith('/') ||
    /^\/\//.test(value) ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return '/cuenta/';
  const origin = 'https://patitas.lavalleja.uy';
  const url = new URL(value, origin);
  if (url.origin !== origin || /^\/(login|api)(\/|$)/.test(url.pathname))
    return '/cuenta/';
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginHref(next: string): string {
  return `/login/?next=${encodeURIComponent(safeReturnPath(next))}`;
}

/** Recovery tokens belong in memory, never in the next destination or history. */
export function consumePasswordResetToken(): string | null {
  const url = new URL(window.location.href);
  const token =
    new URLSearchParams(url.hash.slice(1)).get('reset_token') ??
    url.searchParams.get('reset_token') ??
    url.searchParams.get('token');
  if (token) {
    url.searchParams.delete('reset_token');
    url.searchParams.delete('token');
    url.hash = '';
    history.replaceState(history.state, '', url);
  }
  return token;
}
