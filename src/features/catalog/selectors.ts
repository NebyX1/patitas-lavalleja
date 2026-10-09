import type { Pet, Species, Stage } from '../../types/pet';
export interface Filters {
  species: Species | 'all';
  location: string;
  age: Stage | 'all';
  size: string;
  energy: 'all' | 'calm' | 'active';
  query: string;
  sort: 'default' | 'name' | 'age' | 'senior';
}
export const defaultFilters: Filters = {
  species: 'all',
  location: 'all',
  age: 'all',
  size: 'all',
  energy: 'all',
  query: '',
  sort: 'default',
};
export const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
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
        (filters.energy === 'calm' ? p.energy <= 2 : p.energy >= 4)) &&
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
