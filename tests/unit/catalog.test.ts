import { describe, expect, it } from 'vitest';
import { pets } from '../../src/data/pets';
import {
  defaultFilters,
  filterParams,
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
  it('rejects corrupt and duplicate favorite IDs while accepting dynamically created pets', () => {
    expect(readFavorites('broken')).toEqual([]);
    expect(readFavorites('{"milo":true}')).toEqual([]);
    expect(
      readFavorites(
        '["milo","milo","new-pet-001",null,123,"../private","mora"]',
      ),
    ).toEqual(['milo', 'new-pet-001', 'mora']);
  });
  it('serializes combined filters for the server without inventing compatibility', () => {
    const params = filterParams(
      {
        ...defaultFilters,
        age: 'adult',
        energy: 'calm',
        compatibility_category: 'cats',
        compatibility_status: 'unknown',
      },
      2,
    );
    expect(params.get('stage')).toBe('adult');
    expect(params.get('energy')).toBe('low');
    expect(params.get('compatibility_status')).toBe('unknown');
    expect(params.get('page')).toBe('2');
    expect(params.has('location')).toBe(false);
    const combined = filterParams({
      ...defaultFilters,
      compatibility_category: 'cats,young_children',
      compatibility_status: 'compatible',
    });
    expect(combined.get('compatibility_categories')).toBe(
      'cats,young_children',
    );
    expect(combined.has('compatibility_category')).toBe(false);
  });
  it('prioritizes a calm senior while respecting the species choice', () => {
    const results = matchPets(pets, ['dog', 'calm', 'senior']);
    expect(results[0].id).toBe('coco');
    expect(results.every((p) => p.species === 'dog')).toBe(true);
    expect(matchPets(pets, ['cat', 'active', 'small'])[0].id).toBe('simon');
  });
});
