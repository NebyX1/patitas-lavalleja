import type { Pet, Species, Stage } from '../../types/pet';
export interface Filters {
  species: Species | 'all';
  location: string;
  age: Stage | 'all';
  size: string;
  energy: 'all' | 'calm' | 'medium' | 'active';
  query: string;
  sort: 'default' | 'name' | 'age' | 'senior' | 'recent';
  department: string;
  sex: string;
  organization_id: string;
  compatibility_category: string;
  compatibility_status: string;
  trait: string;
  special_care: string;
  secure_outdoor: string;
  availability: string;
}
export const defaultFilters: Filters = {
  species: 'all',
  location: 'all',
  age: 'all',
  size: 'all',
  energy: 'all',
  query: '',
  sort: 'default',
  department: 'all',
  sex: 'all',
  organization_id: 'all',
  compatibility_category: 'all',
  compatibility_status: 'all',
  trait: 'all',
  special_care: 'all',
  secure_outdoor: 'all',
  availability: 'available',
};
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
export function filterParams(filters: Filters, page = 1) {
  const params = new URLSearchParams({ page: String(page), page_size: '12' });
  for (const [key, value] of Object.entries(filters)) {
    if (
      !value ||
      (value === 'all' && key !== 'availability') ||
      value === 'default'
    )
      continue;
    params.set(
      key === 'age'
        ? 'stage'
        : key === 'compatibility_category' && value.includes(',')
          ? 'compatibility_categories'
          : key,
      key === 'energy'
        ? ((
            { calm: 'low', medium: 'medium', active: 'high' } as Record<
              string,
              string
            >
          )[value] ?? value)
        : value,
    );
  }
  return params;
}
export function selectPets(
  pets: Pet[],
  filters: Filters,
  favorites?: string[],
) {
  const query = normalize(filters.query.trim());
  const list = pets.filter(
    (p) =>
      (filters.species === 'all' || p.species === filters.species) &&
      (filters.location === 'all' || p.location === filters.location) &&
      (filters.age === 'all' || p.stage === filters.age) &&
      (filters.size === 'all' || p.size === filters.size) &&
      (filters.energy === 'all' ||
        (p.energy !== null &&
          (filters.energy === 'calm'
            ? p.energy <= 2
            : filters.energy === 'medium'
              ? p.energy === 3
              : p.energy >= 4))) &&
      (!favorites || favorites.includes(p.id)) &&
      (!query ||
        normalize(
          [p.name, p.quote, p.location, p.tag, ...p.traits].join(' '),
        ).includes(query)),
  );
  if (filters.sort === 'name')
    list.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  if (filters.sort === 'age') list.sort((a, b) => a.months - b.months);
  if (filters.sort === 'senior') list.sort((a, b) => b.months - a.months);
  return list;
}
