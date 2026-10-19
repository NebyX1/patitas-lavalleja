import { defaultFilters, type Filters } from '../../features/catalog/selectors';
import {
  categoryLabels,
  compatibilityLabels,
  type FilterOptions,
} from '../../features/catalog/api';
import Icon from '../ui/Icon';
import SelectMenu from '../ui/SelectMenu';
interface Props {
  filters: Filters;
  options: FilterOptions;
  expanded: boolean;
  onExpand: () => void;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onReset: () => void;
  defaults?: Filters;
}
const opts = (values: string[], all: string) => [
  { value: 'all', label: all },
  ...values.map((value) => ({ value, label: value })),
];
export default function CatalogFilters({
  filters: f,
  options,
  expanded,
  onExpand,
  onChange,
  onReset,
  defaults = defaultFilters,
}: Props) {
  const active = Object.entries(f).filter(
    ([key, value]) =>
      !['query', 'sort', 'species', 'location'].includes(key) &&
      value !== defaults[key as keyof Filters],
  ).length;
  const field = (
    key: keyof Filters,
    label: string,
    values: { value: string; label: string }[],
  ) => (
    <SelectMenu
      key={key}
      variant="field"
      align="end"
      label={label}
      multiple={key === 'compatibility_category'}
      value={f[key]}
      options={values}
      onChange={(value) => onChange(key, value as never)}
    />
  );
  return (
    <>
      <div className="catalog-toolbar">
        <div className="species-tabs" role="group" aria-label="Tipo de mascota">
          {[
            ['all', 'paw', 'Todas las patitas'],
            ['dog', 'dog', 'Perros'],
            ['cat', 'cat', 'Gatos'],
            ...(options.species.some((value) => !['dog', 'cat'].includes(value))
              ? [['other', 'paw', 'Otras especies']]
              : []),
          ].map(([value, icon, label]) => (
            <button
              key={value}
              className={`species-tab ${f.species === value ? 'active' : ''}`}
              aria-pressed={f.species === value}
              onClick={() => onChange('species', value as Filters['species'])}
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
            onChange={(event) => onChange('query', event.target.value)}
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
          options={opts(options.locations, 'Todas las localidades')}
          onChange={(value) => onChange('location', value)}
        />
        <button
          className="filter-button"
          aria-expanded={expanded}
          aria-controls="filter-panel"
          onClick={onExpand}
        >
          <Icon name="filter" />
          Filtros {active > 0 && <span className="filter-count">{active}</span>}
        </button>
      </div>
      <div
        className={`filter-drawer ${expanded ? 'open' : ''}`}
        id="filter-panel"
        inert={!expanded}
      >
        <div className="filter-panel advanced-filters">
          {field('age', 'Etapa de vida', [
            { value: 'all', label: 'Todas las edades' },
            { value: 'young', label: 'Joven' },
            { value: 'adult', label: 'Adulto' },
            { value: 'senior', label: 'Mayor' },
          ])}
          {field(
            'size',
            'Tamaño',
            opts(['Pequeño', 'Mediano', 'Grande'], 'Todos los tamaños'),
          )}
          {field('sex', 'Sexo', opts(['Macho', 'Hembra'], 'Todos'))}
          {field('availability', 'Disponibilidad', [
            { value: 'available', label: 'Disponible para conocer' },
            { value: 'under_review', label: 'En evaluación' },
            { value: 'reserved', label: 'Encuentro en proceso' },
            { value: 'adopted', label: 'Ya encontró hogar' },
            { value: 'all', label: 'Todos los estados publicados' },
          ])}
          {field('energy', 'Energía', [
            { value: 'all', label: 'Todas las energías' },
            { value: 'calm', label: 'Más tranquila' },
            { value: 'medium', label: 'Intermedia' },
            { value: 'active', label: 'Más activa' },
          ])}
          {field(
            'department',
            'Departamento',
            opts(options.departments, 'Todos los departamentos'),
          )}
          {field('organization_id', 'Organización', [
            { value: 'all', label: 'Todas las organizaciones' },
            ...options.organizations.map((value) => ({
              value: value.id,
              label: value.name,
            })),
          ])}
          {field('compatibility_category', 'Convivencia', [
            { value: 'all', label: 'Cualquier convivencia' },
            ...Object.entries(categoryLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ])}
          {field('compatibility_status', 'Evaluación de convivencia', [
            { value: 'all', label: 'Cualquier evaluación' },
            ...Object.entries(compatibilityLabels).map(([value, label]) => ({
              value,
              label,
            })),
          ])}
          {field(
            'trait',
            'Personalidad',
            opts(
              [
                'Tranquilo',
                'Juguetón',
                'Sociable',
                'Independiente',
                'Cariñoso',
                'Explorador',
              ],
              'Cualquier personalidad',
            ),
          )}
          {field('special_care', 'Cuidados', [
            { value: 'all', label: 'Cualquier cuidado' },
            { value: 'true', label: 'Con cuidados especiales' },
            { value: 'false', label: 'Sin cuidados especiales registrados' },
          ])}
          {field('secure_outdoor', 'Espacio exterior', [
            { value: 'all', label: 'Cualquier requisito' },
            { value: 'true', label: 'Requiere exterior seguro' },
            { value: 'false', label: 'Sin requisito exterior registrado' },
          ])}
          <button className="text-link filter-reset" onClick={onReset}>
            Limpiar filtros <Icon name="close" className="icon-sm" />
          </button>
          <p className="filter-context">
            Podés combinar varias convivencias. Se deben cumplir todas las
            categorías seleccionadas con la evaluación elegida. Las condiciones
            de convivencia se basan en observaciones. «Pendiente de evaluación»
            no garantiza compatibilidad.
          </p>
        </div>
      </div>
    </>
  );
}
