import { describe, expect, it } from 'vitest';
import { pets } from '../../src/data/pets';
import {
  defaultFilters,
  selectPets,
} from '../../src/features/catalog/selectors';
import { readFavorites } from '../../src/features/preferences/store';
import { matchPets } from '../../src/features/match/rules';

describe('catalog and preferences', () => {
  it('combines species, place, age and energy without changing source data', () => {
    const original = pets.map((p) => p.id);
    expect(
      selectPets(pets, {
        ...defaultFilters,
        species: 'cat',
        location: 'Minas',
        age: 'adult',
        energy: 'calm',
      }).map((p) => p.id),
    ).toEqual(['olivia']);
    selectPets(pets, { ...defaultFilters, sort: 'name' });
    expect(pets.map((p) => p.id)).toEqual(original);
  });
  it('finds names and localities independently of case and accents', () => {
    expect(
      selectPets(pets, { ...defaultFilters, query: ' SIMON ' }).map(
        (p) => p.id,
      ),
    ).toEqual(['simon']);
    expect(
      selectPets(pets, { ...defaultFilters, query: 'solis' }).map((p) => p.id),
    ).toEqual(['mora', 'pipa']);
  });
  it('intersects favorites with active filters and handles no matches', () => {
    expect(
      selectPets(pets, { ...defaultFilters, species: 'dog' }, [
        'milo',
        'mora',
      ]).map((p) => p.id),
    ).toEqual(['milo']);
    expect(
      selectPets(pets, { ...defaultFilters, query: 'inexistente' }),
    ).toEqual([]);
  });
  it('rejects corrupt, duplicate and unknown persisted favorite IDs', () => {
    expect(readFavorites('broken')).toEqual([]);
    expect(readFavorites('{"milo":true}')).toEqual([]);
    expect(readFavorites('["milo","milo","unknown",null,123,"mora"]')).toEqual([
      'milo',
      'mora',
    ]);
  });
  it('prioritizes a calm senior while respecting the species choice', () => {
    const results = matchPets(pets, ['dog', 'calm', 'senior']);
    expect(results[0].id).toBe('coco');
    expect(results.every((p) => p.species === 'dog')).toBe(true);
    expect(matchPets(pets, ['cat', 'active', 'small'])[0].id).toBe('simon');
  });
});
