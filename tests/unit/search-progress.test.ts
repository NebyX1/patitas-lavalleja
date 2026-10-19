import { describe, expect, it, vi } from 'vitest';
import { readNDJSON } from '../../src/lib/ndjson';
import { ApiError } from '../../src/lib/api';
import {
  presentationPause,
  validProcessingEvent,
} from '../../src/features/match/processing';
import { confirmedCompatibilityStages } from '../../src/features/match/compatibility-processing';

const stream = (lines: string, bytewise = false) => {
  const encoded = new TextEncoder().encode(lines);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (bytewise)
        for (const byte of encoded) controller.enqueue(new Uint8Array([byte]));
      else controller.enqueue(encoded);
      controller.close();
    },
  });
};
describe('live matching protocol', () => {
  it('handles partial UTF-8 records and only publishes the final result', async () => {
    const progress = {
      type: 'progress',
      stage: 'embedding',
      state: 'running',
      elapsed_ms: 12,
    };
    const callback = vi.fn();
    const value = await readNDJSON(
      stream(
        `${JSON.stringify(progress)}\n{"type":"heartbeat"}\n{"type":"result","data":{"name":"Compañía"}}\n`,
        true,
      ),
      callback,
    );
    expect(value).toEqual({ name: 'Compañía' });
    expect(callback).toHaveBeenCalledWith(progress);
    expect(validProcessingEvent(progress)).toBe(true);
    expect(validProcessingEvent({ ...progress, stage: 'invented' })).toBe(
      false,
    );
    expect(validProcessingEvent({ ...progress, eligible: -1 })).toBe(false);
  });
  it('rejects incomplete, malformed and failed streams instead of inventing completion', async () => {
    await expect(
      readNDJSON(stream('{"type":"heartbeat"}\n')),
    ).rejects.toMatchObject({ code: 'interrupted_stream' });
    await expect(readNDJSON(stream('not json\n'))).rejects.toMatchObject({
      code: 'invalid_stream',
    });
    await expect(
      readNDJSON(
        stream(
          '{"type":"error","code":"http_401","message":"Ingresá de nuevo"}\n',
        ),
      ),
    ).rejects.toMatchObject({ status: 401, message: 'Ingresá de nuevo' });
    expect(new ApiError(503, 'unavailable', 'error')).toBeInstanceOf(Error);
  });
  it('allows cancelling the presentation interval before results appear', async () => {
    const controller = new AbortController();
    const waiting = presentationPause(5000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('only reports neural completion when the pair assessment confirms it', () => {
    const stages = confirmedCompatibilityStages(
      {
        degraded: true,
        warnings: [],
        components: {
          structured: 'ready',
          embedding: 'unavailable',
          reranker: 'disabled',
        },
      },
      125,
    );
    expect(stages.structured?.state).toBe('complete');
    expect(stages.embedding?.state).toBe('unavailable');
    expect(stages.reranker?.state).toBe('disabled');
    expect(stages.ranking?.state).toBe('complete');
    const skipped = confirmedCompatibilityStages(
      {
        degraded: false,
        warnings: [],
        components: {
          structured: 'ready',
          embedding: 'not_used',
          reranker: 'not_used',
        },
      },
      1,
    );
    expect(skipped.embedding?.state).toBe('not_used');
    expect(skipped.reranker?.state).toBe('not_used');
    expect(
      confirmedCompatibilityStages(
        { degraded: true, warnings: [], components: {} },
        0,
      ).embedding?.state,
    ).toBe('unavailable');
  });
});
