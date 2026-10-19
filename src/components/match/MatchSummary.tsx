import { useEffect, useState } from 'react';
import type { AdopterProfile } from '../../features/match/profile';
import { profileLabels } from '../../features/auth/profile';
import Icon from '../ui/Icon';

const extraLabels: Record<string, string> = {
  tranquilo: 'Tranquilidad',
  jugueton: 'Juegos',
  carinoso: 'Afecto',
  independiente: 'Independencia',
  curioso: 'Curiosidad',
  rural: 'Entorno rural',
};

export default function MatchSummary({ profile }: { profile: AdopterProfile }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = matchMedia('(min-width: 1100px)');
    setOpen(media.matches);
    const update = () => setOpen(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const labels = (values: string[], fallback: string) =>
    values.length
      ? values
          .map((value) => extraLabels[value] ?? profileLabels[value] ?? value)
          .join(' · ')
      : fallback;
  const summary = [
    ['paw', 'Tu compañero', labels(profile.species, 'Todas las especies')],
    [
      'heart',
      'Etapa y tamaño',
      [...profile.stages, ...profile.sizes].length
        ? labels([...profile.stages, ...profile.sizes], '')
        : 'Sin preferencias todavía',
    ],
    [
      'sun',
      'Tu ritmo',
      profile.activity_minutes != null
        ? `${profile.activity_minutes} min de actividad al día`
        : 'Por descubrir',
    ],
    [
      'home',
      'Tu hogar',
      profile.housing_type
        ? (extraLabels[profile.housing_type] ??
          profileLabels[profile.housing_type] ??
          profile.housing_type)
        : 'Por conocer',
    ],
    [
      'spark',
      'Lo que los conecta',
      labels(profile.preferred_traits, 'Tu historia toma forma acá'),
    ],
  ];
  return (
    <aside className="match-sidebar">
      <details
        className="match-summary"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>
          <span>
            <Icon name="spark" />
            Tu búsqueda, hasta ahora
          </span>
          <Icon name="down" />
        </summary>
        <div className="match-summary-body">
          <p>Una compañía que encaje con tu mundo.</p>
          <dl>
            {summary.map(([icon, label, value]) => (
              <div key={label}>
                <dt>
                  <Icon name={icon} />
                  {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <span className="match-summary-note">
            <Icon name="shield" />
            Solo se guarda si vos lo elegís.
          </span>
        </div>
      </details>
      <div className="match-friendly-note">
        <Icon name="heart" />
        <p>
          El match es el comienzo.
          <br />
          <strong>Lo más lindo es conocerse.</strong>
        </p>
      </div>
    </aside>
  );
}
