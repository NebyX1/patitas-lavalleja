import { useEffect, useId, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { api, errorMessage, type User } from '../../lib/api';
import {
  displayName,
  formatProfileDate,
  initials,
  profileLabels,
  type Dashboard,
} from '../../features/auth/profile';
import Icon from '../ui/Icon';
import PetCard from '../cards/PetCard';
import HouseholdSummary from './HouseholdSummary';
import IdentityEditor from './IdentityEditor';
import ProfileApplications from './ProfileApplications';
import '../../styles/profile-account.css';
import { useClientState } from '../../features/preferences/useClientState';
import { $favorites } from '../../features/preferences/store';

type Section =
  'overview' | 'home' | 'applications' | 'favorites' | 'organizations';
export default function ProfileDashboard({
  user,
  onLogout,
  busy,
}: {
  user: User;
  onLogout: () => void;
  busy: boolean;
}) {
  const ready = useClientState();
  const savedIds = useStore($favorites, { ssr: 'initial' });
  const [data, setData] = useState<Dashboard | null>(null);
  const [tab, setTab] = useState<Section>('overview');
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const editorId = useId();
  const editorCard = useRef<HTMLElement>(null);
  const editorTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError('');
    setTab('overview');
    setEditing(false);
    void api<Dashboard>('/me/dashboard', { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [user.id]);
  const role =
    user.role === 'admin'
      ? 'Administración'
      : user.role === 'responsible'
        ? 'Responsable de adopciones'
        : 'Buscando un compañero';
  const tabs: [Section, string][] = [
    ['overview', 'Resumen'],
    ['home', 'Mi hogar'],
    ['applications', 'Solicitudes'],
    ['favorites', 'Favoritos'],
    ...(user.role !== 'adopter'
      ? [['organizations', 'Mi organización'] as [Section, string]]
      : []),
  ];
  const identity = data?.identity;
  const hasPresentation = !!(
    identity?.headline.trim() || identity?.biography.trim()
  );
  function openEditor(trigger: HTMLButtonElement) {
    editorTrigger.current = trigger;
    setTab('overview');
    setMessage('');
    setEditing(true);
    requestAnimationFrame(() => {
      const card = editorCard.current;
      card
        ?.querySelector<HTMLHeadingElement>('h2')
        ?.focus({ preventScroll: true });
      card?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  function finishEditing() {
    setEditing(false);
    requestAnimationFrame(() => {
      const trigger = editorTrigger.current;
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
        trigger.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
    });
  }
  const favorites =
    data?.favorites.filter((pet) => savedIds.includes(pet.id)) ?? [];
  const organizationStats = data?.organizations.reduce(
    (total, org) => ({
      pets: total.pets + org.pets,
      applications: total.applications + org.applications,
    }),
    { pets: 0, applications: 0 },
  );
  return (
    <div className="profile-dashboard" aria-busy={!data && !error}>
      <header className="person-hero">
        <div className="person-cover">
          <span>HISTORIAS QUE NOS ENCUENTRAN.</span>
          <Icon name="paw" />
        </div>
        <div className="person-hero-body">
          <div
            className={`person-avatar avatar-${identity?.avatar_color ?? 'peach'}`}
            aria-label={`Avatar de ${displayName(user.display_name)}`}
          >
            {initials(user.display_name)}
          </div>
          <div className="person-identity">
            <div className="person-role">
              <span className="profile-kicker">{role}</span>
              {user.is_demo && (
                <span className="profile-pill">Perfil de prueba</span>
              )}
            </div>
            <h1>{displayName(user.display_name)}</h1>
            <p>{identity?.headline || 'Un hogar, muchas posibilidades.'}</p>
            <div className="person-meta">
              <span>
                <Icon name="pin" />
                {identity?.location ||
                  data?.household?.location ||
                  'Localidad por completar'}
              </span>
              {identity?.member_since && (
                <span>
                  En Patitas desde{' '}
                  {formatProfileDate(identity.member_since, {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>
          <div className="person-actions">
            <button
              className="btn btn-outline"
              disabled={!data}
              aria-expanded={editing}
              aria-controls={editing ? editorId : undefined}
              onClick={(event) => openEditor(event.currentTarget)}
            >
              {hasPresentation
                ? 'Editar presentación'
                : 'Crear mi presentación'}
            </button>
            <button className="text-link" onClick={onLogout} disabled={busy}>
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>
      {error && (
        <p className="api-notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="profile-feedback" role="status">
          {message}
        </p>
      )}
      <nav className="person-tabs" aria-label="Secciones de mi perfil">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setEditing(false);
              setMessage('');
            }}
          >
            {label}
            {key === 'applications' && !!data?.applications.length && (
              <span>{data.applications.length}</span>
            )}
          </button>
        ))}
      </nav>
      {!data && !error && (
        <div className="profile-card">
          <p role="status">Estamos preparando tu perfil…</p>
        </div>
      )}
      {data && (
        <div className="person-layout">
          <aside className="person-sidebar">
            <section className="profile-card profile-about">
              <span className="profile-kicker">Acerca de mí</span>
              <h2>Una historia propia</h2>
              <p>
                {identity?.biography ||
                  'Todavía no agregaste una presentación. Contanos un poco de vos y de lo que te gustaría compartir con un nuevo compañero.'}
              </p>
              <button
                type="button"
                className="btn btn-outline profile-about-edit"
                aria-expanded={editing}
                aria-controls={editing ? editorId : undefined}
                onClick={(event) => openEditor(event.currentTarget)}
              >
                {hasPresentation
                  ? 'Editar mi información'
                  : 'Completar mi información'}
                <Icon name="arrow-up" />
              </button>
              <span className="profile-private">
                <Icon name="user" /> Tu información es privada
              </span>
            </section>
            <section className="profile-card profile-completion">
              <div className="profile-section-heading">
                <h2>Tu hogar en Patitas</h2>
                <strong>{data.completion}%</strong>
              </div>
              <progress value={data.completion} max="100">
                Perfil del hogar completado
              </progress>
              <p>
                {data.completion === 100
                  ? 'Tu información está completa. Podés revisarla cuando cambie tu rutina.'
                  : 'Completar tus condiciones ayuda a encontrar afinidades con más información.'}
              </p>
              <a className="text-link" href="/tu-match/">
                {data.household ? 'Editar mi perfil' : 'Completar mi perfil'}{' '}
                <Icon name="arrow-up" />
              </a>
            </section>
            <div className="profile-stat-grid">
              <div>
                <strong>{favorites.length}</strong>
                <span>Historias guardadas</span>
              </div>
              <div>
                <strong>{data.applications.length}</strong>
                <span>Encuentros en camino</span>
              </div>
              {user.role !== 'adopter' && (
                <>
                  <div>
                    <strong>{organizationStats?.pets}</strong>
                    <span>Animales acompañados</span>
                  </div>
                  <div>
                    <strong>{organizationStats?.applications}</strong>
                    <span>Solicitudes por revisar</span>
                  </div>
                </>
              )}
            </div>
          </aside>
          <div className="person-content">
            {editing && identity ? (
              <section
                id={editorId}
                ref={editorCard}
                className="profile-card profile-edit-card"
              >
                <IdentityEditor
                  identity={identity}
                  creating={!hasPresentation}
                  onCancel={finishEditing}
                  onSaved={async () => {
                    const updated = await api<Dashboard>('/me/dashboard');
                    setData(updated);
                    finishEditing();
                    setMessage(
                      'Guardamos tu presentación. Tu perfil ya está actualizado.',
                    );
                  }}
                />
              </section>
            ) : (
              <>
                {tab === 'overview' && (
                  <>
                    <section className="profile-welcome">
                      <div>
                        <span className="profile-kicker">
                          Tu próxima gran historia
                        </span>
                        <h2>
                          {user.role === 'adopter'
                            ? 'Un compañero que vaya con tu mundo.'
                            : 'Cada adopción merece una buena conversación.'}
                        </h2>
                        <p>
                          {user.role === 'adopter'
                            ? 'Conectamos lo que podés ofrecer con las necesidades observadas de cada animal. Conocer sus afinidades es un primer paso para encontrarse.'
                            : 'Conocé a las personas que se acercan a tu organización y revisá las afinidades y necesidades de cada solicitud.'}
                        </p>
                        <a
                          className="btn btn-dark"
                          href={
                            user.role === 'adopter'
                              ? '/tu-match/'
                              : '/admin/#solicitudes'
                          }
                        >
                          {user.role === 'adopter'
                            ? 'Descubrir mis afinidades'
                            : 'Revisar solicitudes con IA'}{' '}
                          <Icon name="spark" />
                        </a>
                      </div>
                      <Icon name={user.role === 'adopter' ? 'paw' : 'heart'} />
                    </section>
                    <section className="profile-card">
                      <div className="profile-section-heading">
                        <div>
                          <span className="profile-kicker">
                            Lo que te gustaría compartir
                          </span>
                          <h2>Tu manera de acompañar</h2>
                        </div>
                        <button
                          className="text-link"
                          onClick={() => setTab('home')}
                        >
                          Ver mi hogar <Icon name="arrow" />
                        </button>
                      </div>
                      <p>
                        {data.household?.preferences_text ||
                          'Contanos sobre tu rutina y el compañero que imaginás. No hace falta tener todas las respuestas para empezar.'}
                      </p>
                      <div className="profile-chips">
                        {data.household?.species.map((species) => (
                          <span key={species}>
                            {profileLabels[species] ?? species}
                          </span>
                        ))}
                        {data.household?.preferred_traits.map((trait) => (
                          <span key={trait}>{trait}</span>
                        ))}
                      </div>
                    </section>
                    <ProfileApplications
                      items={data.applications.slice(0, 2)}
                    />
                  </>
                )}
                {tab === 'home' && (
                  <section className="profile-card">
                    <span className="profile-kicker">
                      Condiciones para una buena convivencia
                    </span>
                    <h2>Tu hogar y tu rutina</h2>
                    <p>
                      Estos datos alimentan las recomendaciones y, cuando enviás
                      una solicitud, ayudan al equipo a evaluar la convivencia.
                    </p>
                    <HouseholdSummary profile={data.household} />
                    <div className="account-profile-actions">
                      <a className="btn btn-orange" href="/tu-match/">
                        {data.household
                          ? 'Editar mi perfil'
                          : 'Completar mi perfil'}{' '}
                        <Icon name="arrow-up" />
                      </a>
                      {data.household && (
                        <button
                          className="text-link management-danger"
                          onClick={async () => {
                            try {
                              await api('/me/profile', { method: 'DELETE' });
                              setData(await api<Dashboard>('/me/dashboard'));
                              setMessage(
                                'Eliminamos tu perfil de compatibilidad guardado.',
                              );
                            } catch (reason) {
                              setError(errorMessage(reason));
                            }
                          }}
                        >
                          Eliminar mi perfil de compatibilidad
                        </button>
                      )}
                    </div>
                  </section>
                )}
                {tab === 'applications' && (
                  <ProfileApplications items={data.applications} />
                )}
                {tab === 'favorites' && (
                  <section className="profile-section">
                    <div className="profile-section-heading">
                      <div>
                        <span className="profile-kicker">
                          Historias para volver a mirar
                        </span>
                        <h2>Tus favoritos</h2>
                      </div>
                      <a className="text-link" href="/favoritos/">
                        Ver todos <Icon name="arrow" />
                      </a>
                    </div>
                    {favorites.length ? (
                      <div className="profile-pet-grid">
                        {favorites.map((pet) => (
                          <PetCard pet={pet} key={pet.id} ready={ready} />
                        ))}
                      </div>
                    ) : (
                      <div className="profile-empty">
                        <Icon name="heart" />
                        <p>Las historias que guardes van a encontrarse acá.</p>
                        <a className="btn btn-outline" href="/adopcion/">
                          Conocer animales
                        </a>
                      </div>
                    )}
                  </section>
                )}
                {tab === 'organizations' && (
                  <section className="profile-section">
                    <span className="profile-kicker">
                      Personas que hacen lugar
                    </span>
                    <h2>Tu trabajo en comunidad</h2>
                    <p>
                      Desde tu organización podés acompañar animales, conocer a
                      sus solicitantes y revisar compatibilidad en ambos
                      sentidos.
                    </p>
                    <div className="profile-organization-list">
                      {data.organizations.map((org) => (
                        <article key={org.id} className="profile-card">
                          <Icon name="home" />
                          <h3>{org.name}</h3>
                          <span className="profile-kicker">{org.locality}</span>
                          <p>{org.description}</p>
                          <div className="profile-chips">
                            <span>{org.pets} animales</span>
                            <span>{org.applications} solicitudes</span>
                          </div>
                          <a
                            className="btn btn-dark"
                            href="/admin/#solicitudes"
                          >
                            Abrir el panel de gestión <Icon name="arrow-up" />
                          </a>
                        </article>
                      ))}
                    </div>
                    {!data.organizations.length && (
                      <div className="profile-empty">
                        <p>
                          El equipo puede asignarte a una organización para
                          comenzar a acompañar adopciones.
                        </p>
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
