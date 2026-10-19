import type { PersonalAssessment } from '../auth/profile';
import {
  processingStages,
  type ProcessingState,
  type StageState,
} from './processing';

export const compatibilityStages = [
  { ...processingStages[0], name: 'Conocemos sus dos mundos' },
  { ...processingStages[1], name: 'Interpretamos sus afinidades' },
  {
    ...processingStages[3],
    name: 'Afinamos la compatibilidad',
    detail: 'Coincidencias, cuidados y condiciones por conversar',
  },
  {
    ...processingStages[4],
    name: 'Preparamos tu análisis',
    detail: 'Una explicación para acompañar tu decisión',
  },
] as const;

export interface CompatibilityProcessing extends ProcessingState {
  kind: 'compatibility';
  animalName: string;
  result?: PersonalAssessment;
}

// The pair endpoint returns confirmed component states, not a live stage stream.
// Only show model completion after receiving that report, including skipped AI.
export function confirmedCompatibilityStages(
  meta: PersonalAssessment['meta'],
  elapsed: number,
): ProcessingState['stages'] {
  const states: Record<string, StageState> = {
    ready: 'complete',
    unavailable: 'unavailable',
    disabled: 'disabled',
    not_used: 'not_used',
  };
  return Object.fromEntries(
    compatibilityStages.map(({ id }) => [
      id,
      {
        type: 'progress',
        stage: id,
        state:
          id === 'ranking'
            ? 'complete'
            : (states[meta.components[id]] ?? 'unavailable'),
        elapsed_ms: elapsed,
      },
    ]),
  );
}
