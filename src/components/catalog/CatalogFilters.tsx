import type { CSSProperties } from 'react';
import type { Filters } from '../../features/catalog/selectors';
import { locations } from '../../data/pets';
import Icon from '../ui/Icon';
import SelectMenu, { type SelectOption } from '../ui/SelectMenu';

const locationOptions: SelectOption<string>[] = [
  { value: 'all', label: 'Todo Lavalleja' },
  ...locations.map((place) => ({ value: place, label: place })),
];

const ageOptions: SelectOption<Filters['age']>[] = [
  { value: 'all', label: 'Todas las edades' },
  { value: 'young', label: 'Joven' },
  { value: 'adult', label: 'Adulto' },
  { value: 'senior', label: 'Mayor' },
];

const sizeOptions: SelectOption<string>[] = [
  { value: 'all', label: 'Todos los tamaños' },
  { value: 'Pequeño', label: 'Pequeño' },
  { value: 'Mediano', label: 'Mediano' },
  { value: 'Grande', label: 'Grande' },
];

const energyOptions: SelectOption<Filters['energy']>[] = [
  { value: 'all', label: 'Todas las energías' },
  { value: 'calm', label: 'Más tranquila' },
  { value: 'active', label: 'Más activa' },
];

interface Props {
  filters: Filters;
  expanded: boolean;
  onExpand: () => void;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onReset: () => void;
}
export default function CatalogFilters({
  filters: f,
  expanded,
  onExpand,
  onChange,
  onReset,
}: Props) {
  const activeFilters = [f.age, f.size, f.energy].filter(
    (value) => value !== 'all',
  ).length;
  return (
    <>
      <div className="catalog-toolbar">
        <div className="species-tabs" role="group" aria-label="Tipo de mascota">
          {(
            [
              ['all', 'paw', 'Todas las patitas'],
              ['dog', 'dog', 'Perros'],
              ['cat', 'cat', 'Gatos'],
            ] as const
          ).map(([value, icon, label]) => (
            <button
              key={value}
              className={`species-tab ${f.species === value ? 'active' : ''}`}
              aria-pressed={f.species === value}
              onClick={() => onChange('species', value)}
            >
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Icon name="search" />
          <span className="sr-only">Buscar por nombre o personalidad</span>
          <input
            type="search"
            value={f.query}
            onChange={(e) => onChange('query', e.target.value)}
            autoComplete="off"
            placeholder="Un nombre, una personalidad…"
          />
          {f.query && (
            <button
              type="button"
              className="search-clear"
              aria-label="Borrar búsqueda"
              onClick={() => onChange('query', '')}
            >
              <Icon name="close" />
            </button>
          )}
        </label>
        <SelectMenu
          className="location-select"
          variant="pill"
          align="end"
          icon="pin"
          label="Localidad"
          value={f.location}
          options={locationOptions}
          onChange={(value) => onChange('location', value)}
        />
        <button
          className="filter-button"
          aria-expanded={expanded}
          aria-controls="filter-panel"
          onClick={onExpand}
        >
          <Icon name="filter" />
          Filtros
          {activeFilters > 0 && (
            <span key={activeFilters} className="filter-count">
              {activeFilters}
            </span>
          )}
        </button>
      </div>
      <div
        className={`filter-drawer ${expanded ? 'open' : ''}`}
        id="filter-panel"
        inert={!expanded}
      >
        <div className="filter-panel">
          <div className="filter-field" style={{ '--i': 0 } as CSSProperties}>
            <SelectMenu
              variant="field"
              align="end"
              label="Etapa de vida"
              value={f.age}
              options={ageOptions}
              onChange={(value) => onChange('age', value)}
            />
          </div>
          <div className="filter-field" style={{ '--i': 1 } as CSSProperties}>
            <SelectMenu
              variant="field"
              align="end"
              label="Tamaño"
              value={f.size}
              options={sizeOptions}
              onChange={(value) => onChange('size', value)}
            />
          </div>
          <div className="filter-field" style={{ '--i': 2 } as CSSProperties}>
            <SelectMenu
              variant="field"
              align="end"
              label="Personalidad"
              value={f.energy}
              options={energyOptions}
              onChange={(value) => onChange('energy', value)}
            />
          </div>
          <button
            className="text-link filter-reset"
            style={{ '--i': 3 } as CSSProperties}
            onClick={onReset}
          >
            Limpiar filtros <Icon name="close" className="icon-sm" />
          </button>
        </div>
      </div>
    </>
  );
}
