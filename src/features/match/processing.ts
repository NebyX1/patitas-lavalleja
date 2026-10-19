import type { MatchResults } from './profile';

export const processingStages = [
  {
    id: 'structured',
    name: 'Conocemos tu mundo',
    detail: 'Hogar, rutinas y condiciones de convivencia',
    icon: 'home',
  },
  {
    id: 'embedding',
    name: 'Entendemos lo que buscás',
    detail: 'Afinidad entre tu historia y sus necesidades',
    icon: 'spark',
  },
  {
    id: 'retrieval',
    name: 'Buscamos historias afines',
    detail: 'Exploración del catálogo de animales disponibles',
    icon: 'search',
  },
  {
    id: 'reranker',
    name: 'Afinamos los encuentros',
    detail: 'Revisión de los candidatos más relevantes',
    icon: 'heart',
  },
  {
    id: 'ranking',
    name: 'Preparamos tus matches',
    detail: 'Orden y explicación de las compatibilidades',
    icon: 'paw',
  },
] as const;
export type ProcessingStage = (typeof processingStages)[number]['id'];
export type StageState =
  'running' | 'complete' | 'unavailable' | 'disabled' | 'not_used';
export interface ProcessingEvent {
  type: 'progress';
  stage: ProcessingStage;
  state: StageState;
  elapsed_ms: number;
  profiles?: number;
  eligible?: number;
  excluded?: number;
  candidates?: number;
  matches?: number;
}
export interface ProcessingState {
  phase: 'working' | 'complete' | 'error';
  stages: Partial<Record<ProcessingStage, ProcessingEvent>>;
  startedAt: number;
  error?: string;
}
export interface SearchProcessing extends ProcessingState {
  kind?: 'search';
  result?: MatchResults;
}
export function validProcessingEvent(value: unknown): value is ProcessingEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as ProcessingEvent;
  return (
    event.type === 'progress' &&
    processingStages.some((stage) => stage.id === event.stage) &&
    ['running', 'complete', 'unavailable', 'disabled', 'not_used'].includes(
      event.state,
    ) &&
    Number.isFinite(event.elapsed_ms) &&
    event.elapsed_ms >= 0 &&
    ['profiles', 'eligible', 'excluded', 'candidates', 'matches'].every(
      (key) => {
        const count = (event as unknown as Record<string, unknown>)[key];
        return (
          count === undefined ||
          (typeof count === 'number' && Number.isInteger(count) && count >= 0)
        );
      },
    )
  );
}

export function presentationPause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
