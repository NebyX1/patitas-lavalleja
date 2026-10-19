import { atom } from 'nanostores';
import { defaultFilters, type Filters } from './selectors';
export const $catalogFilters = atom<Filters>({ ...defaultFilters });
export const defaultFavoriteFilters: Filters = {
  ...defaultFilters,
  availability: 'all',
};
export const $favoriteCatalogFilters = atom<Filters>({
  ...defaultFavoriteFilters,
});
