import { describe, expect, it } from 'vitest';
import { loginHref, safeReturnPath } from '../../src/features/auth/navigation';

describe('post-login destinations', () => {
  it('preserves local paths, filters and fragments', () => {
    expect(safeReturnPath('/admin/?tab=applications#solicitudes')).toBe(
      '/admin/?tab=applications#solicitudes',
    );
    expect(loginHref('/tu-match/')).toBe('/login/?next=%2Ftu-match%2F');
  });
  it.each([
    null,
    '',
    'https://example.org/',
    '//example.org/',
    '/\\example.org/',
    '/\n/evil',
    '/login/',
    '/login?next=/login/',
    '/api/v1/auth/session',
    '/foo/../login/',
  ])('rejects external destinations and login loops: %s', (value) =>
    expect(safeReturnPath(value)).toBe('/cuenta/'),
  );
});
