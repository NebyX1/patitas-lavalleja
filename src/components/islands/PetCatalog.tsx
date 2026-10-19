import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  defaultFilters,
  filterParams,
  type Filters,
} from '../../features/catalog/selectors';
import {
  $catalogFilters,
  $favoriteCatalogFilters,
  defaultFavoriteFilters,
} from '../../features/catalog/store';
import {
  emptyOptions,
  validFilterOptions,
  categoryLabels,
  compatibilityLabels,
  type FilterOptions,
} from '../../features/catalog/api';
import { $favorites, $motionPaused } from '../../features/preferences/store';
import { useClientState } from '../../features/preferences/useClientState';
import { api, errorMessage } from '../../lib/api';
import { validPetPage, type PetPage } from '../../types/pet';
import PetCard from '../cards/PetCard';
import CatalogFilters from '../catalog/CatalogFilters';
import Icon from '../ui/Icon';
import SelectMenu, { type SelectOption } from '../ui/SelectMenu';
import SmartSearchLink from './SmartSearchLink';
const sortOptions: SelectOption<Filters['sort']>[] = [
  { value: 'default', label: 'Para descubrir' },
  { value: 'recent', label: 'Más recientes' },
  { value: 'name', label: 'Nombre: A a Z' },
  { value: 'age', label: 'Más jóvenes primero' },
  { value: 'senior', label: 'Mayores primero' },
];
const emptyPage: PetPage = {
  items: [],
  total: 0,
  page: 1,
  page_size: 12,
  pages: 0,
};
const filterLabels: Record<string, string> = {
  species: 'Especie',
  location: 'Localidad',
  age: 'Edad',
  size: 'Tamaño',
  energy: 'Energía',
  query: 'Búsqueda',
  department: 'Departamento',
  sex: 'Sexo',
  organization_id: 'Organización',
  compatibility_category: 'Convivencia',
  compatibility_status: 'Evaluación',
  trait: 'Personalidad',
  special_care: 'Cuidados especiales',
  secure_outdoor: 'Exterior seguro',
  availability: 'Disponibilidad',
};
export default function PetCatalog({
  favoritesOnly = false,
  initialPage = null,
  initialError = '',
}: {
  favoritesOnly?: boolean;
  initialPage?: PetPage | null;
  initialError?: string;
}) {
  const ready = useClientState();
  const filterStore = favoritesOnly ? $favoriteCatalogFilters : $catalogFilters;
  const defaults = favoritesOnly ? defaultFavoriteFilters : defaultFilters;
  const shared = useStore(filterStore, { ssr: 'initial' });
  const favorites = useStore($favorites, { ssr: 'initial' });
  const paused = useStore($motionPaused, { ssr: 'initial' });
  const filters = ready ? shared : defaults;
  const [data, setData] = useState(initialPage ?? emptyPage);
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [options, setOptions] = useState<FilterOptions>(emptyOptions);
  const [optionsError, setOptionsError] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const paginationTarget = useRef<number | null>(null);
  const favoriteKey = favorites.join(',');
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    void api<Partial<FilterOptions>>('/filters', {
      signal: controller.signal,
      validate: validFilterOptions,
    })
      .then((value) => setOptions({ ...emptyOptions, ...value }))
      .catch((failure) => {
        if (!controller.signal.aborted) setOptionsError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        if (favoritesOnly && !favorites.length) {
          setData(emptyPage);
          setError('');
          setLoading(false);
          return;
        }
        setLoading(true);
        setError('');
        const params = filterParams(filters, page);
        if (favoritesOnly) params.set('ids', favoriteKey);
        try {
          const result = await api<PetPage>(`/pets?${params}`, {
            signal: controller.signal,
            validate: validPetPage,
          });
          if (!controller.signal.aborted) setData(result);
        } catch (failure) {
          if (!controller.signal.aborted) {
            setError(errorMessage(failure));
            setData(emptyPage);
          }
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      filters.query ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, ready, retry, favoritesOnly, favoriteKey]);
  useLayoutEffect(() => {
    if (paginationTarget.current !== data.page || !grid.current) return;
    paginationTarget.current = null;
    grid.current.focus({ preventScroll: true });
    grid.current.scrollIntoView({
      block: 'start',
      behavior: paused ? 'instant' : 'smooth',
    });
  }, [data, paused]);
  useEffect(() => {
    if (paused || !ready) return;
    const animations = [...(grid.current?.children ?? [])].map((node, i) =>
      node.animate(
        [
          { opacity: 0.5, transform: 'translateY(12px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        {
          duration: 320,
          delay: Math.min(i, 7) * 25,
          easing: 'cubic-bezier(.22,1,.36,1)',
        },
      ),
    );
    return () => animations.forEach((animation) => animation.cancel());
  }, [data, paused, ready]);
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    paginationTarget.current = null;
    setPage(1);
    filterStore.set({ ...shared, [key]: value });
  };
  const reset = () => {
    paginationTarget.current = null;
    setPage(1);
    filterStore.set({ ...defaults });
  };
  const changePage = (next: number) => {
    paginationTarget.current = next;
    setLoading(true);
    setPage(next);
  };
  const active = Object.entries(filters)
    .filter(
      ([key, value]) =>
        key !== 'sort' && value !== defaults[key as keyof Filters],
    )
    .flatMap(([key, value]) =>
      key === 'compatibility_category'
        ? value.split(',').map((category: string) => [key, category] as const)
        : [[key, value] as const],
    );
  const chipValue = (key: string, value: string) =>
    key === 'compatibility_category'
      ? (categoryLabels[value] ?? value)
      : key === 'compatibility_status'
        ? (compatibilityLabels[value] ?? value)
        : ((
            {
              dog: 'Perro',
              cat: 'Gato',
              other: 'Otras especies',
              young: 'Joven',
              adult: 'Adulto',
              senior: 'Mayor',
              calm: 'Tranquila',
              active: 'Activa',
              medium: 'Intermedia',
              available: 'Disponible',
              under_review: 'En evaluación',
              reserved: 'Encuentro en proceso',
              adopted: 'Adoptado',
              all: 'Todos',
              true: 'Sí',
              false: 'No',
            } as Record<string, string>
          )[value] ?? value);
  return (
    <div className="catalog-content" aria-busy={loading}>
      <SmartSearchLink variant="catalog" />
      <fieldset className="catalog-controls" disabled={!ready}>
        <legend className="sr-only">Buscar y filtrar mascotas</legend>
        <CatalogFilters
          filters={filters}
          options={options}
          expanded={expanded}
          onExpand={() => setExpanded(!expanded)}
          onChange={update}
          onReset={reset}
          defaults={defaults}
        />
        {optionsError && (
          <p className="api-notice" role="status">
            No pudimos actualizar todas las opciones de filtros. {optionsError}
          </p>
        )}
        {active.length > 0 && (
          <div className="active-filters" aria-label="Filtros activos">
            {active.map(([key, value]) => (
              <button
                key={`${key}:${value}`}
                className="reset-chip"
                aria-label={`Quitar filtro ${filterLabels[key] ?? key}: ${chipValue(key, value)}`}
                onClick={() =>
                  update(
                    key as keyof Filters,
                    (key === 'compatibility_category'
                      ? filters.compatibility_category
                          .split(',')
                          .filter((category) => category !== value)
                          .join(',') || 'all'
                      : defaults[key as keyof Filters]) as never,
                  )
                }
              >
                {filterLabels[key] ?? key}: {chipValue(key, value)} ×
              </button>
            ))}
            <button className="text-link" onClick={reset}>
              Limpiar todo
            </button>
          </div>
        )}
        <div className="catalog-meta">
          <div className="result-count" role="status" aria-live="polite">
            {loading ? (
              'Buscando historias…'
            ) : (
              <>
                <strong>{data.total}</strong>{' '}
                {favoritesOnly
                  ? 'historias guardadas'
                  : 'historias por conocer'}
              </>
            )}
          </div>
          <div className="sort-label">
            <span>Ordenar:</span>
            <SelectMenu
              variant="inline"
              align="end"
              label="Ordenar"
              value={filters.sort}
              options={sortOptions}
              onChange={(value) => update('sort', value)}
            />
          </div>
        </div>
      </fieldset>
      {error ? (
        <div className="empty-state" role="alert">
          <Icon name="info" />
          <h3>Necesitamos un momento.</h3>
          <p>{error}</p>
          <button
            className="btn btn-dark btn-small"
            onClick={() => setRetry(retry + 1)}
          >
            Volver a intentar
          </button>
        </div>
      ) : (
        <div
          className="pet-grid"
          ref={grid}
          role="region"
          aria-label={`Animales del catálogo, página ${data.page}`}
          tabIndex={-1}
        >
          {data.items.length
            ? data.items.map((pet) => (
                <PetCard key={pet.id} pet={pet} ready={ready} />
              ))
            : !loading && (
                <div className="empty-state">
                  <Icon name={favoritesOnly ? 'heart' : 'search'} />
                  <h3>
                    {favoritesOnly && !favorites.length
                      ? 'Todavía hay mucho por querer.'
                      : 'Probemos por otro camino.'}
                  </h3>
                  <p>
                    {favoritesOnly && !favorites.length
                      ? 'Guardá una patita con el corazón de su tarjeta y encontrala después acá.'
                      : 'No encontramos perfiles publicados con estos filtros. Podés ampliar tu búsqueda.'}
                  </p>
                  {favoritesOnly && !favorites.length ? (
                    <a href="/adopcion/" className="btn btn-dark btn-small">
                      Ver todas las patitas <Icon name="arrow-up" />
                    </a>
                  ) : (
                    <button className="btn btn-dark btn-small" onClick={reset}>
                      Limpiar filtros <Icon name="arrow-up" />
                    </button>
                  )}
                </div>
              )}
        </div>
      )}
      {data.pages > 1 && (
        <nav className="catalog-pagination" aria-label="Páginas del catálogo">
          <button
            className="btn btn-outline btn-small"
            disabled={page <= 1 || loading}
            onClick={() => changePage(page - 1)}
          >
            Anterior
          </button>
          <span>
            Página {data.page} de {data.pages}
          </span>
          <button
            className="btn btn-outline btn-small"
            disabled={page >= data.pages || loading}
            onClick={() => changePage(page + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
      <div className="catalog-bottom">
        <Icon name="info" />
        <span>
          La disponibilidad se confirma con la organización responsable. Las
          fichas marcadas «Demostración» son ficticias y no aceptan solicitudes
          reales.
        </span>
      </div>
    </div>
  );
}
