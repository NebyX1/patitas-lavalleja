export interface FilterOptions {
  species: string[];
  locations: string[];
  departments: string[];
  organizations: { id: string; name: string }[];
  compatibility_categories: string[];
}
export const emptyOptions: FilterOptions = {
  species: ['dog', 'cat'],
  locations: [],
  departments: [],
  organizations: [],
  compatibility_categories: [],
};
export const validFilterOptions = (value: unknown): value is FilterOptions => {
  if (!value || typeof value !== 'object') return false;
  const options = value as FilterOptions;
  return (
    [
      options.species,
      options.locations,
      options.departments,
      options.compatibility_categories,
    ].every(
      (items) =>
        Array.isArray(items) && items.every((item) => typeof item === 'string'),
    ) &&
    Array.isArray(options.organizations) &&
    options.organizations.every(
      (item) =>
        !!item && typeof item.id === 'string' && typeof item.name === 'string',
    )
  );
};
export const categoryLabels: Record<string, string> = {
  dogs: 'Otros perros',
  cats: 'Otros gatos',
  other_pets: 'Otras mascotas',
  birds: 'Aves',
  rabbits: 'Conejos',
  small_mammals: 'Animales pequeños',
  young_children: 'Niños pequeños',
  school_children: 'Niños en edad escolar',
  teenagers: 'Adolescentes',
  adults: 'Adultos',
  frequent_visitors: 'Visitas frecuentes',
  active_home: 'Hogar activo',
  quiet_home: 'Hogar tranquilo',
};
export const compatibilityLabels: Record<string, string> = {
  compatible: 'Compatible según observaciones',
  incompatible: 'Incompatible según observaciones',
  conditional: 'Con condiciones o supervisión',
  unknown: 'Pendiente de evaluación',
  not_applicable: 'No corresponde',
};
