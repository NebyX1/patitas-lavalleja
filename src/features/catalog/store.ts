import { atom } from 'nanostores';
import { defaultFilters, type Filters } from './selectors';
export const $catalogFilters = atom<Filters>({ ...defaultFilters });
