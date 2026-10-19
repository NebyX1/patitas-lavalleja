import { ApiError } from './api-error';

/** Decode arbitrary UTF-8/network chunks without buffering the whole response. */
export async function readNDJSON(
  body: ReadableStream<Uint8Array>,
  onEvent?: (event: unknown) => void,
): Promise<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let ended = false;
  let hasResult = false;
  let result: unknown;
  function parse(line: string): { done: boolean; value?: unknown } {
    if (!line.trim()) return { done: false };
    const event = JSON.parse(line);
    if (event?.type === 'error')
      throw new ApiError(
        /^http_\d+$/.test(event.code) ? Number(event.code.slice(5)) : 503,
        typeof event.code === 'string' ? event.code : 'search_unavailable',
        typeof event.message === 'string'
          ? event.message
          : 'No pudimos completar la búsqueda.',
      );
    if (event?.type === 'result') return { done: true, value: event.data };
    onEvent?.(event);
    return { done: false };
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      ended = done;
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2 * 1024 * 1024)
        throw new ApiError(
          502,
          'invalid_stream',
          'La respuesta de búsqueda superó el tamaño esperado.',
        );
      let boundary: number;
      while ((boundary = buffer.indexOf('\n')) >= 0) {
        const item = parse(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 1);
        if (item.done) {
          hasResult = true;
          result = item.value;
        }
      }
      if (done) {
        if (buffer.trim()) {
          const item = parse(buffer);
          if (item.done) {
            hasResult = true;
            result = item.value;
          }
        }
        if (hasResult) return result;
        throw new ApiError(
          502,
          'interrupted_stream',
          'La búsqueda se interrumpió antes de terminar. Podés volver a intentar.',
        );
      }
    }
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ApiError(
        502,
        'invalid_stream',
        'El servicio devolvió un progreso inesperado. Volvé a intentar.',
      );
    throw error;
  } finally {
    if (!ended) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
