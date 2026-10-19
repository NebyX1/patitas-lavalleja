import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, errorMessage, setSession } from '../../src/lib/api';
import { photoFor } from '../../src/config/site';
import { pets } from '../../src/data/pets';
import { validPet } from '../../src/types/pet';
afterEach(() => {
  vi.unstubAllGlobals();
  setSession(null);
});
describe('typed API boundary', () => {
  it('keeps diagnostic errors out of UI while preserving actionable account messages', () => {
    const fallback =
      'No pudimos completar la operación. Volvé a intentar en unos minutos.';
    for (const error of [
      new Error('Unexpected failure in a private component'),
      new ApiError(503, 'unavailable', 'Bekko OpenVINO ONNX inference failed'),
      new ApiError(
        500,
        'unknown',
        'FuturePrivateLibrary: stack trace and configuration',
      ),
      new ApiError(409, 'conflict', 'LanceDB SQLite vector unavailable'),
      new ApiError(400, 'configuration', 'Horizon: reranking desactivado'),
    ])
      expect(errorMessage(error)).toBe(fallback);
    expect(
      errorMessage(
        new ApiError(409, 'conflict', 'Ya existe una cuenta con ese correo.'),
      ),
    ).toBe('Ya existe una cuenta con ese correo.');
    expect(
      errorMessage(
        new ApiError(401, 'expired', 'Ingresá a tu cuenta para continuar.'),
      ),
    ).toBe('Ingresá a tu cuenta para continuar.');
    expect(
      errorMessage(new ApiError(403, 'csrf', 'CSRF token inválido')),
    ).toContain('Recargá la página');
    expect(
      errorMessage(
        new ApiError(
          429,
          'limit',
          'Demasiadas solicitudes. Esperá antes de volver a intentar.',
        ),
      ),
    ).toContain('Esperá');
  });
  it('sends same-origin credentials and CSRF without duplicating the API prefix', async () => {
    setSession({ authenticated: false, user: null, csrf_token: 'test-csrf' });
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetcher);
    await api('/matches/search', { method: 'POST', body: { profile: {} } });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe('/api/v1/matches/search');
    expect(init.credentials).toBe('include');
    expect(init.headers.get('X-CSRF-Token')).toBe('test-csrf');
    expect(JSON.parse(init.body)).toEqual({ profile: {} });
  });
  it('exposes uniform backend errors and refuses invalid response contracts', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json(
            {
              error: {
                code: 'unavailable',
                message: 'Servicio temporalmente fuera de línea',
              },
            },
            { status: 503 },
          ),
        )
        .mockResolvedValueOnce(Response.json({ unexpected: true })),
    );
    await expect(api('/pets')).rejects.toMatchObject({
      status: 503,
      code: 'unavailable',
      message: 'Servicio temporalmente fuera de línea',
    });
    await expect(
      api('/pets', { validate: () => false }),
    ).rejects.toBeInstanceOf(ApiError);
  });
  it('keeps cancelled requests distinguishable from network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
    );
    await expect(api('/pets')).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('accepts unknown observations and uses backend media variants', () => {
    const pet = {
      ...pets[0],
      energy: null,
      smallSpace: null,
      sex: 'A confirmar' as const,
      photos: [
        {
          id: 'new-photo',
          variants: {
            card: {
              url: '/api/v1/media/new-photo/card',
              width: 480,
              height: 480,
            },
            detail: {
              url: '/api/v1/media/new-photo/detail',
              width: 960,
              height: 960,
            },
          },
        },
      ],
    };
    expect(validPet(pet)).toBe(true);
    expect(photoFor(pet, 480)).toBe('/api/v1/media/new-photo/card');
    expect(photoFor(pet)).toBe('/api/v1/media/new-photo/detail');
  });
});
