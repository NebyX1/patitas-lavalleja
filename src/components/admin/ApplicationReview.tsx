import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import {
  displayName,
  initials,
  type Assessment,
  type Identity,
} from '../../features/auth/profile';
import type { AdopterProfile } from '../../features/match/profile';
import CompatibilityReport from '../profile/CompatibilityReport';
import HouseholdSummary from '../profile/HouseholdSummary';
import Icon from '../ui/Icon';

type Review = {
  applicant: Identity;
  household: AdopterProfile | null;
  assessment: Assessment | null;
};
export default function ApplicationReview({
  applicationId,
  initial,
}: {
  applicationId: string;
  initial: Assessment | null;
}) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const assessmentRevision = useRef(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const revision = assessmentRevision.current;
    void api<Review>(`/admin/applications/${applicationId}/review`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) {
          setReview(value);
          if (assessmentRevision.current === revision)
            setAssessment(value.assessment);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [open, applicationId]);
  async function evaluate() {
    assessmentRevision.current++;
    setBusy(true);
    setError('');
    setOpen(true);
    try {
      const updated = await api<Assessment>(
        `/admin/applications/${applicationId}/compatibility`,
        { method: 'POST' },
      );
      assessmentRevision.current++;
      setAssessment(updated);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="application-review" aria-busy={busy}>
      <div className="application-review-intro">
        <div>
          <span className="profile-kicker">
            <Icon name="spark" /> Una mirada de ambos lados
          </span>
          <h4>¿Podrían construir una buena convivencia?</h4>
          <p>
            Revisá el hogar de la persona y contrastalo con las necesidades de
            este animal.
          </p>
        </div>
        <div className="profile-actions">
          <button
            type="button"
            className="btn btn-dark"
            disabled={busy}
            onClick={() => void evaluate()}
          >
            {busy
              ? 'Evaluando compatibilidad…'
              : assessment
                ? 'Actualizar evaluación'
                : 'Evaluar compatibilidad con IA'}{' '}
            <Icon name="spark" />
          </button>
          <button
            type="button"
            className="text-link"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open
              ? 'Ocultar perfil del solicitante'
              : 'Ver perfil del solicitante'}
          </button>
        </div>
      </div>
      {error && (
        <p className="api-notice" role="alert">
          {error}
        </p>
      )}
      {open && (
        <div className="applicant-profile">
          {review ? (
            <>
              <div className="applicant-profile-heading">
                <div
                  className={`person-avatar person-avatar-small avatar-${review.applicant.avatar_color}`}
                >
                  {initials(review.applicant.display_name)}
                </div>
                <div>
                  <span className="profile-kicker">
                    Perfil de la persona solicitante
                  </span>
                  <h4>{displayName(review.applicant.display_name)}</h4>
                  <p>{review.applicant.headline}</p>
                </div>
              </div>
              {review.applicant.biography && (
                <p>{review.applicant.biography}</p>
              )}
              {!review.household && (
                <p className="api-notice">
                  La persona todavía no completó su perfil de hogar. La
                  evaluación indicará la información pendiente.
                </p>
              )}
              <details className="applicant-home">
                <summary>Conocer su hogar y sus preferencias</summary>
                <HouseholdSummary profile={review.household} />
              </details>
            </>
          ) : (
            <p role="status">Cargando el perfil del solicitante…</p>
          )}
        </div>
      )}
      {assessment && <CompatibilityReport assessment={assessment} />}
    </div>
  );
}
