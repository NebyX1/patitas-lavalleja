import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../features/auth/store';
import type { AdopterProfile } from '../../features/match/profile';
import type { PersonalAssessment } from '../../features/auth/profile';
import { api, ApiError, errorMessage, getSession } from '../../lib/api';
import {
  confirmedCompatibilityStages,
  type CompatibilityProcessing,
} from '../../features/match/compatibility-processing';
import { presentationPause } from '../../features/match/processing';
import MatchProcessingDialog from '../match/MatchProcessingDialog';
import CompatibilityReport from '../profile/CompatibilityReport';
import Icon from '../ui/Icon';
import '../../styles/pet-compatibility.css';

export default function PetCompatibility({
  petId,
  name,
}: {
  petId: string;
  name: string;
}) {
  const session = useSession();
  if (!session?.authenticated || !session.user) return null;
  return (
    <PersonalPetMatch
      key={`${session.user.id}:${petId}`}
      petId={petId}
      name={name}
    />
  );
}

function PersonalPetMatch({ petId, name }: { petId: string; name: string }) {
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);
  const [assessment, setAssessment] = useState<PersonalAssessment | null>(null);
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<CompatibilityProcessing | null>(
    null,
  );
  const analysis = useRef<AbortController | null>(null);
  const reportHeading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    void api<{ profile: AdopterProfile | null }>('/me/profile', {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setHasProfile(!!value.profile);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => {
      controller.abort();
      analysis.current?.abort();
    };
  }, []);
  function cancelAnalysis() {
    analysis.current?.abort();
    setProcessing(null);
    setBusy(false);
  }
  async function evaluate() {
    analysis.current?.abort();
    const controller = new AbortController();
    analysis.current = controller;
    setBusy(true);
    setError('');
    setAssessment(null);
    const startedAt = performance.now();
    const initial: CompatibilityProcessing = {
      kind: 'compatibility',
      animalName: name,
      phase: 'working',
      stages: {},
      startedAt,
    };
    setProcessing(initial);
    try {
      const value = await api<PersonalAssessment>(
        `/me/pets/${encodeURIComponent(petId)}/compatibility`,
        {
          method: 'POST',
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      const confirmed: CompatibilityProcessing = {
        ...initial,
        result: value,
        stages: confirmedCompatibilityStages(
          value.meta,
          performance.now() - startedAt,
        ),
      };
      setProcessing(confirmed);
      // Run inference immediately; hold only the presentation so even cached
      // and structured-only reports have a brief, cancellable animation.
      await presentationPause(
        Math.max(0, 2200 - (performance.now() - startedAt)),
        controller.signal,
      );
      setProcessing({ ...confirmed, phase: 'complete' });
      await presentationPause(800, controller.signal);
      if (controller.signal.aborted) return;
      setProcessing(null);
      setAssessment(value);
      setVisible(true);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 401) {
        setProcessing(null);
        await getSession(true);
      } else {
        const message = errorMessage(reason);
        setProcessing((current) => ({
          ...(current ?? initial),
          phase: 'error',
          error: message,
        }));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    if (assessment && visible)
      reportHeading.current?.focus({ preventScroll: true });
  }, [assessment, visible]);
  return (
    <>
      <section
        className="pet-compatibility"
        aria-label="Tu compatibilidad con este animal"
      >
        <div className="pet-compatibility-intro">
          <span className="profile-kicker">
            <Icon name="spark" /> Una mirada de ambos lados
          </span>
          <h2>Tu hogar y {name}</h2>
          <p>
            Conocé cómo se relacionan tu hogar guardado, tus preferencias y las
            necesidades de {name}.
          </p>
        </div>
        {error && (
          <p className="api-notice" role="alert">
            {error}
          </p>
        )}
        {hasProfile === false ? (
          <div className="pet-compatibility-start">
            <p>
              Primero completá y guardá tu perfil de hogar para contar con
              información sobre tu rutina.
            </p>
            <a className="btn btn-orange" href="/tu-match/">
              Completar mi hogar <Icon name="arrow-up" />
            </a>
          </div>
        ) : (
          <div className="pet-compatibility-actions" aria-busy={busy}>
            <button
              type="button"
              className="btn btn-dark"
              disabled={busy || hasProfile !== true}
              onClick={() => void evaluate()}
            >
              {busy
                ? 'Analizando compatibilidad…'
                : assessment
                  ? 'Actualizar análisis'
                  : 'Analizar compatibilidad'}{' '}
              <Icon name="spark" />
            </button>
            {assessment && (
              <button
                type="button"
                className="text-link"
                aria-expanded={visible}
                onClick={() => setVisible(!visible)}
              >
                {visible ? 'Ocultar análisis' : 'Ver análisis'}
              </button>
            )}
          </div>
        )}
        {assessment && visible && (
          <div
            ref={reportHeading}
            tabIndex={-1}
            className="pet-compatibility-result"
          >
            {assessment.availability.adoption_status !== 'available' && (
              <p className="api-notice">
                Esta ficha no está disponible para nuevas solicitudes en este
                momento. El análisis describe afinidades y condiciones de
                convivencia.
              </p>
            )}
            <CompatibilityReport assessment={assessment} />
          </div>
        )}
      </section>
      {processing && (
        <MatchProcessingDialog
          processing={processing}
          onCancel={cancelAnalysis}
          onRetry={() => void evaluate()}
        />
      )}
    </>
  );
}
