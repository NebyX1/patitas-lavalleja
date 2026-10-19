import {
  applicationStates,
  formatProfileDate,
  type PersonalApplication,
} from '../../features/auth/profile';
import CompatibilityReport from './CompatibilityReport';
import Icon from '../ui/Icon';

export default function ProfileApplications({
  items,
}: {
  items: PersonalApplication[];
}) {
  return (
    <section
      className="profile-section"
      aria-labelledby="my-applications-heading"
    >
      <div className="profile-section-heading">
        <div>
          <span className="profile-kicker">Cada paso cuenta</span>
          <h2 id="my-applications-heading">Tus solicitudes de adopción</h2>
        </div>
        <span className="profile-count">{items.length}</span>
      </div>
      <p>
        Un espacio para seguir cada encuentro y conocer la orientación del
        equipo responsable.
      </p>
      {!items.length && (
        <div className="profile-empty">
          <Icon name="paw" />
          <h3>Tu próximo encuentro empieza por una historia.</h3>
          <p>Explorá el catálogo y conocé a quienes podrían acompañarte.</p>
          <a className="btn btn-orange" href="/adopcion/">
            Explorar historias <Icon name="arrow-up" />
          </a>
        </div>
      )}
      <div className="profile-application-list">
        {items.map((item) => (
          <article key={item.id} className="profile-application">
            <div className="profile-section-heading">
              <div>
                <small>
                  {formatProfileDate(item.created_at, { dateStyle: 'short' })}
                  {item.is_demo ? ' · Solicitud de prueba' : ''}
                </small>
                <h3>
                  <a href={`/mascotas/${encodeURIComponent(item.pet_id)}/`}>
                    Tu encuentro con {item.pet_name}
                  </a>
                </h3>
              </div>
              <span className="profile-pill">
                {applicationStates[item.status] ?? item.status}
              </span>
            </div>
            {item.assessment ? (
              <CompatibilityReport assessment={item.assessment} />
            ) : (
              <div className="profile-review-pending">
                <Icon name="spark" />
                <div>
                  <strong>Una mirada de ambos lados</strong>
                  <p>
                    El equipo puede evaluar cómo se relacionan tu hogar, tus
                    preferencias y las necesidades del animal. La orientación
                    aparecerá acá cuando la realice.
                  </p>
                </div>
              </div>
            )}
            <details className="profile-timeline">
              <summary>Ver el seguimiento</summary>
              <ol>
                {item.history.map((entry, index) => (
                  <li key={index}>
                    <span className="profile-timeline-dot" />
                    <div>
                      <strong>
                        {applicationStates[entry.status] ?? entry.status}
                      </strong>
                      <small>
                        {formatProfileDate(entry.created_at, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </small>
                      {entry.note && <p>{entry.note}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
