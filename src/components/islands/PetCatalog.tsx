import { useEffect, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import { pets } from '../../data/pets';
import {
  defaultFilters,
  selectPets,
  type Filters,
} from '../../features/catalog/selectors';
import { $catalogFilters } from '../../features/catalog/store';
import { $favorites, $motionPaused } from '../../features/preferences/store';
import { useClientState } from '../../features/preferences/useClientState';
import PetCard from '../cards/PetCard';
import CatalogFilters from '../catalog/CatalogFilters';
import Icon from '../ui/Icon';
import SelectMenu, { type SelectOption } from '../ui/SelectMenu';

const sortOptions: SelectOption<Filters['sort']>[] = [
  { value: 'default', label: 'Para descubrir' },
  { value: 'name', label: 'Nombre: A a Z' },
  { value: 'age', label: 'Más jóvenes primero' },
  { value: 'senior', label: 'Mayores primero' },
];

export default function PetCatalog({
  favoritesOnly = false,
}: {
  favoritesOnly?: boolean;
}) {
  const ready = useClientState();
  const sharedFilters = useStore($catalogFilters, { ssr: 'initial' });
  const favorites = useStore($favorites, { ssr: 'initial' });
  const paused = useStore($motionPaused, { ssr: 'initial' });
  const [expanded, setExpanded] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  // Static HTML always includes every profile. Client-only preferences are applied after hydration.
  const filters = ready ? sharedFilters : defaultFilters;
  const list = selectPets(pets, filters, favoritesOnly ? favorites : undefined);
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
  }, [filters, favoritesOnly, paused, ready]);
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    $catalogFilters.set({ ...sharedFilters, [key]: value });
  const reset = () => $catalogFilters.set({ ...defaultFilters });
  return (
    <div className="catalog-content">
      <fieldset className="catalog-controls" disabled={!ready}>
        <legend className="sr-only">Buscar y filtrar mascotas</legend>
        <CatalogFilters
          filters={filters}
          expanded={expanded}
          onExpand={() => setExpanded(!expanded)}
          onChange={update}
          onReset={reset}
        />
        <div className="catalog-meta">
          <div className="result-count" role="status" aria-live="polite">
            <strong>{list.length}</strong>{' '}
            {favoritesOnly ? 'historias guardadas' : 'historias por conocer'}
            {JSON.stringify(filters) !== JSON.stringify(defaultFilters) && (
              <button className="reset-chip" onClick={reset}>
                Limpiar búsqueda ×
              </button>
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
      <div className="pet-grid" ref={grid}>
        {list.length ? (
          list.map((p) => <PetCard key={p.id} pet={p} ready={ready} />)
        ) : (
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
                : 'No encontramos perfiles con estos filtros. Podés ampliar tu búsqueda.'}
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
      <div className="catalog-bottom">
        <Icon name="info" />
        <span>
          Perfiles de muestra. Las fotografías son ilustrativas; no representan
          adopciones disponibles.
        </span>
      </div>
    </div>
  );
}
