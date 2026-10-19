import type { APIRoute } from 'astro';
import { backendOrigin } from '../../lib/server';
export const prerender = false;
const tooLarge = () =>
  Response.json(
    {
      error: {
        code: 'payload_too_large',
        message: 'El archivo o la información supera el límite permitido.',
      },
    },
    { status: 413, headers: { 'Cache-Control': 'no-store' } },
  );
const proxy: APIRoute = async ({ request, params, clientAddress }) => {
  const path = (params.path ?? '').replace(/\/+$/, '');
  if (
    !/^v1(?:\/|$)/.test(path) ||
    path.split('/').some((part) => part === '.' || part === '..')
  )
    return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const target = `${backendOrigin()}/api/${path}${url.search}`;
  const headers = new Headers();
  for (const name of [
    'content-type',
    'cookie',
    'origin',
    'x-csrf-token',
    'accept',
    'range',
    'idempotency-key',
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('X-Forwarded-For', clientAddress);
  try {
    let body: Uint8Array | undefined;
    if (!['GET', 'HEAD'].includes(request.method)) {
      const limit = request.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('multipart/form-data')
        ? 13 * 1024 * 1024
        : 64 * 1024;
      const declared = Number(request.headers.get('content-length') ?? 0);
      if (!Number.isFinite(declared) || declared < 0 || declared > limit)
        return tooLarge();
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = request.body?.getReader();
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > limit) {
              await reader.cancel();
              return tooLarge();
            }
            chunks.push(value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      body = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
    }
    const response = await fetch(target, {
      method: request.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(60000)]),
      body: body as BodyInit | undefined,
    });
    const resultHeaders = new Headers();
    for (const name of [
      'content-type',
      'cache-control',
      'retry-after',
      'content-length',
      'content-disposition',
      'content-range',
      'accept-ranges',
      'x-accel-buffering',
    ]) {
      const value = response.headers.get(name);
      if (value) resultHeaders.set(name, value);
    }
    for (const cookie of response.headers.getSetCookie())
      resultHeaders.append('set-cookie', cookie);
    resultHeaders.set('X-Content-Type-Options', 'nosniff');
    return new Response(response.body, {
      status: response.status,
      headers: resultHeaders,
    });
  } catch {
    return Response.json(
      {
        error: {
          code: 'service_unavailable',
          message:
            'El servicio está temporalmente fuera de línea. Volvé a intentar en unos minutos.',
        },
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
};
export const ALL = proxy;
