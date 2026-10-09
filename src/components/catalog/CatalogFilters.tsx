import type { Filters } from '../../features/catalog/selectors';
import { locations } from '../../data/pets';
import Icon from '../ui/Icon';
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
        </label>
        <label className="location-select">
          <Icon name="pin" />
          <span className="sr-only">Localidad</span>
          <select
            value={f.location}
            onChange={(e) => onChange('location', e.target.value)}
          >
            <option value="all">Todo Lavalleja</option>
            {locations.map((place) => (
              <option key={place}>{place}</option>
            ))}
          </select>
        </label>
        <button
          className="filter-button"
          aria-expanded={expanded}
          aria-controls="filter-panel"
          onClick={onExpand}
        >
          <Icon name="filter" />
          Filtros
        </button>
      </div>
      <div className="filter-panel" id="filter-panel" hidden={!expanded}>
        <label>
          Etapa de vida
          <select
            value={f.age}
            onChange={(e) => onChange('age', e.target.value as Filters['age'])}
          >
            <option value="all">Todas las edades</option>
            <option value="young">Joven</option>
            <option value="adult">Adulto</option>
            <option value="senior">Mayor</option>
          </select>
        </label>
        <label>
          Tamaño
          <select
            value={f.size}
            onChange={(e) => onChange('size', e.target.value)}
          >
            <option value="all">Todos los tamaños</option>
            <option>Pequeño</option>
            <option>Mediano</option>
            <option>Grande</option>
          </select>
        </label>
        <label>
          Personalidad
          <select
            value={f.energy}
            onChange={(e) =>
              onChange('energy', e.target.value as Filters['energy'])
            }
          >
            <option value="all">Todas las energías</option>
            <option value="calm">Más tranquila</option>
            <option value="active">Más activa</option>
          </select>
        </label>
        <button className="text-link" onClick={onReset}>
          Limpiar filtros <Icon name="close" className="icon-sm" />
        </button>
      </div>
    </>
  );
}
