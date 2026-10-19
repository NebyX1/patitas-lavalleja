import { useRef, useState } from 'react';
import type { Pet } from '../../types/pet';
import Icon from '../ui/Icon';
import { useClientState } from '../../features/preferences/useClientState';
import {
  categoryLabels,
  compatibilityLabels,
} from '../../features/catalog/api';
const tabs = [
  ['story', 'Mi historia'],
  ['personality', 'Así soy'],
  ['care', 'Mis cuidados'],
] as const;
export default function ProfileTabs({ pet: p }: { pet: Pet }) {
  const ready = useClientState();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <>
      <div
        className="profile-tabs"
        role="tablist"
        aria-label={`Información de ${p.name}`}
      >
        {tabs.map(([id, label], i) => (
          <button
            disabled={!ready}
            key={id}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            type="button"
            className={`profile-tab ${selected === i ? 'active' : ''}`}
            id={`tab-${id}`}
            role="tab"
            aria-selected={selected === i}
            aria-controls={`panel-${id}`}
            tabIndex={selected === i ? 0 : -1}
            onClick={() => setSelected(i)}
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? 2
                    : (i + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3;
              setSelected(next);
              buttons.current[next]?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="profile-panel"
        id="panel-story"
        role="tabpanel"
        aria-labelledby="tab-story"
        tabIndex={0}
        hidden={selected !== 0}
      >
        <p>{p.story}</p>
        <p>{p.needs}</p>
      </div>
      <div
        className="profile-panel"
        id="panel-personality"
        role="tabpanel"
        aria-labelledby="tab-personality"
        tabIndex={0}
        hidden={selected !== 1}
      >
        <div className="compat-list">
          {!!p.compatibilities?.length &&
            p.compatibilities.map((item) => (
              <div
                key={item.category}
                className="compat-item compatibility-observation"
              >
                <span>{categoryLabels[item.category] ?? item.category}</span>
                <b>
                  {compatibilityLabels[item.status] ??
                    'Pendiente de evaluación'}
                </b>
                {item.observation && <p>{item.observation}</p>}
                {(item.recommendations || item.recommendation) && (
                  <small>{item.recommendations || item.recommendation}</small>
                )}
                {item.evaluated_at && (
                  <small>
                    Observación registrada:{' '}
                    {new Date(item.evaluated_at).toLocaleDateString('es-UY')}
                  </small>
                )}
              </div>
            ))}
          {!p.compatibilities?.length && (
            <p className="care-note">
              La convivencia todavía no fue evaluada. Consultá al equipo
              responsable.
            </p>
          )}
          {p.is_demo &&
            [
              ['dog', 'Con otros perros', p.dogs],
              ['cat', 'Con otros gatos', p.cats],
              ['people', 'Con niños', p.children],
            ].map(([icon, label, value]) => (
              <div key={label} className="compat-item">
                <span>
                  <Icon name={icon} />
                  {label}
                </span>
                <b>{value}</b>
              </div>
            ))}
        </div>
        <div className="energy">
          <span>
            {p.energy === null
              ? 'Mi energía · pendiente de evaluar'
              : `Mi energía · ${p.energy}/5`}
          </span>
          <span className="energy-bars" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <i
                key={i}
                className={p.energy !== null && i < p.energy ? 'on' : ''}
              />
            ))}
          </span>
        </div>
        <div className="personality-chips">
          {p.traits.map((trait) => (
            <span key={trait}>{trait}</span>
          ))}
        </div>
      </div>
      <div
        className="profile-panel"
        id="panel-care"
        role="tabpanel"
        aria-labelledby="tab-care"
        tabIndex={0}
        hidden={selected !== 2}
      >
        <div className="care-list">
          {p.care.map((care) => (
            <span key={care}>
              <Icon name="info" />
              {care}
            </span>
          ))}
        </div>
        <p className="care-note">
          {p.is_demo ? 'Datos ficticios de demostración. ' : ''}Los antecedentes
          y cuidados deben confirmarse con sus responsables.
        </p>
      </div>
    </>
  );
}
