import { photoFor, petUrl } from '../../config/site';
import type { MatchResults as Results } from '../../features/match/profile';
import Icon from '../ui/Icon';
import { limitedAnalysisNotice } from '../../features/match/presentation';

export default function MatchResults({ result }: { result: Results }) {
  return (
    <>
      {result.meta.degraded && (
        <div className="api-notice" role="status">
          <b>Orientación parcial</b>
          <p>{limitedAnalysisNotice}</p>
        </div>
      )}
      {!result.results.length && (
        <div className="empty-state">
          <Icon name="search" />
          <h3>No encontramos candidatos elegibles con estas condiciones.</h3>
          <p>
            Podés revisar preferencias opcionales. Las incompatibilidades
            confirmadas no se omiten para producir resultados.
          </p>
        </div>
      )}
      <div className="match-results-grid">
        {result.results.map(({ pet, match }) => (
          <article
            key={pet.id}
            className="match-result"
            data-species={pet.species}
          >
            <a className="quiz-result-card" href={petUrl(pet.id)}>
              <div className="match-result-photo">
                <img
                  src={photoFor(pet, 480)}
                  alt={pet.alt}
                  width="480"
                  height="480"
                  loading="lazy"
                />
                <span className="match-result-status">
                  {match.eligibility === 'needs_review'
                    ? 'Condiciones por confirmar'
                    : 'Afinidades para explorar'}
                </span>
              </div>
              <div className="match-result-name">
                <div>
                  <h3>{pet.name}</h3>
                  <p>
                    {pet.age} · {pet.location}
                  </p>
                </div>
                <span className="match-result-arrow">
                  <Icon name="arrow-up" />
                </span>
              </div>
            </a>
            <div className="match-explanation">
              <p className="match-result-index">
                <Icon name="spark" />
                <b>
                  {match.structured_score === null
                    ? 'Faltan datos para calcular un índice'
                    : `Índice orientativo: ${Math.round(match.structured_score)}/100`}
                </b>
              </p>
              <dl className="match-dimensions">
                {[
                  ['Adecuación del hogar', match.home_score],
                  ['Afinidad con tus preferencias', match.preference_score],
                ].map(([label, score]) => (
                  <div key={String(label)}>
                    <dt>{label}</dt>
                    <dd>
                      {score === null
                        ? 'Por confirmar'
                        : `${Math.round(Number(score))}/100`}
                    </dd>
                  </div>
                ))}
              </dl>
              <details className="match-result-details">
                <summary>
                  Ver detalles de compatibilidad <Icon name="down" />
                </summary>
                {(
                  [
                    ['Coincidencias', match.positive],
                    ['Para conversar', match.attention],
                    ['Pendiente de evaluar', match.unknown],
                  ] as [string, string[]][]
                ).map(
                  ([label, items]) =>
                    items.length > 0 && (
                      <div key={label}>
                        <h4>{label}</h4>
                        <ul>
                          {items.map((item, index) => (
                            <li key={index}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ),
                )}
                <p className="quiz-footnote">
                  Información{' '}
                  {match.completeness >= 0.75 ? 'amplia' : 'parcial'}
                  {pet.is_demo && ' · Perfil ficticio de demostración'}
                </p>
              </details>
              {pet.is_demo && (
                <small className="match-demo-label">
                  Perfil ficticio de demostración
                </small>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
