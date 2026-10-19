import { useState } from 'react';
import {
  formatProfileDate,
  type Assessment,
  type CompatibilityResult,
} from '../../features/auth/profile';
import Icon from '../ui/Icon';
import { limitedAnalysisNotice } from '../../features/match/presentation';
import '../../styles/profile-account.css';

export default function CompatibilityReport({
  assessment,
}: {
  assessment: CompatibilityResult &
    Partial<
      Pick<Assessment, 'created_at' | 'evaluated_by' | 'stale' | 'pet_version'>
    >;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = (value: number | null) =>
    value == null ? 'Por confirmar' : `${Math.round(value)}/100`;
  return (
    <section
      className={`compatibility-report verdict-${assessment.decision}`}
      aria-label="Informe de compatibilidad"
    >
      <div className="compatibility-report-heading">
        <span className="profile-kicker">
          <Icon name="spark" /> Compatibilidad en dos sentidos
        </span>
        <span className="profile-pill">Orientación inicial</span>
      </div>
      <h3>{assessment.label}</h3>
      <p>{assessment.summary}</p>
      {assessment.stale && (
        <p className="assessment-stale" role="status">
          Los datos cambiaron después de esta evaluación. Hace falta
          actualizarla antes de usarla para orientar la solicitud.
        </p>
      )}
      <div className="compatibility-directions">
        <div>
          <span>Hogar → Animal</span>
          <strong>{score(assessment.match.home_score)}</strong>
          <small>Capacidad para acompañar sus necesidades</small>
        </div>
        <div>
          <span>Animal → Persona</span>
          <strong>{score(assessment.match.preference_score)}</strong>
          <small>Afinidad con preferencias y rutina</small>
        </div>
      </div>
      <div className="assessment-confidence">
        <span>Información disponible</span>
        <strong>{Math.round(assessment.match.completeness * 100)}%</strong>
        <progress max="100" value={assessment.match.completeness * 100}>
          Información disponible
        </progress>
      </div>
      <button
        type="button"
        className="text-link"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? 'Ocultar explicación'
          : 'Ver explicación y puntos a conversar'}{' '}
        <Icon name="arrow" />
      </button>
      {expanded && (
        <div className="assessment-explanation">
          {(
            [
              ['Afinidades observadas', assessment.match.positive],
              ['Puntos para conversar', assessment.conversation_points],
              [
                'Condiciones confirmadas que bloquean',
                assessment.match.hard_rules
                  .filter((rule) => rule.blocking)
                  .map((rule) => rule.reason),
              ],
            ] as [string, string[]][]
          ).map(
            ([title, items]) =>
              items.length > 0 && (
                <div key={title}>
                  <h4>{title}</h4>
                  <ul>
                    {items.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {assessment.meta.degraded && (
            <p className="profile-note">{limitedAnalysisNotice}</p>
          )}
        </div>
      )}
      <p className="profile-note">{assessment.notice}</p>
      {assessment.created_at && (
        <small className="assessment-date">
          Evaluado el{' '}
          {formatProfileDate(assessment.created_at, {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
          {assessment.evaluated_by && ` · ${assessment.evaluated_by}`}
        </small>
      )}
    </section>
  );
}
