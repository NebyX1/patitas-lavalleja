export type Species = 'dog' | 'cat' | 'rabbit' | 'bird' | 'other';
export type Stage = 'young' | 'adult' | 'senior';
export interface Pet {
  id: string;
  name: string;
  species: Species;
  age: string;
  months: number;
  stage: Stage;
  size: 'Pequeño' | 'Mediano' | 'Grande';
  sex: 'Macho' | 'Hembra' | 'A confirmar';
  location: string;
  tag: string;
  tagIcon: string;
  tagColor: string;
  energy: number | null;
  pos: string;
  quote: string;
  traits: string[];
  story: string;
  needs: string;
  dogs: string;
  cats: string;
  children: string;
  smallSpace: boolean | null;
  care: string[];
  alt: string;
  is_demo?: boolean;
  publication_status?: string;
  adoption_status?: string;
  profile_version?: number;
  organization_id?: string | null;
  department?: string;
  organization?: { id: string; name: string } | null;
  personality?: Record<string, unknown>;
  requirements?: Record<string, unknown>;
  compatibilities?: Compatibility[];
  photos?: PetPhoto[];
}
export interface Compatibility {
  category: string;
  status:
    | 'compatible'
    | 'incompatible'
    | 'conditional'
    | 'unknown'
    | 'not_applicable';
  observation?: string;
  recommendation?: string;
  recommendations?: string;
  responsible?: string;
  evaluated_at?: string;
  confidence?: number;
  assessed_at?: string;
  context?: string;
}
export interface PetPhoto {
  id: string;
  url?: string;
  url_480?: string;
  url_960?: string;
  url_1600?: string;
  alt?: string;
  variants?: Record<
    string,
    string | { url: string; width: number; height: number }
  >;
}
export interface PetPage {
  items: Pet[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
export const validPet = (value: unknown): value is Pet => {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    ['id', 'name', 'species', 'age', 'location', 'story', 'needs', 'alt'].every(
      (key) => typeof p[key] === 'string',
    ) &&
    Array.isArray(p.traits) &&
    Array.isArray(p.care) &&
    (p.energy === null || typeof p.energy === 'number')
  );
};
export const validPetPage = (value: unknown): value is PetPage => {
  if (!value || typeof value !== 'object') return false;
  const p = value as PetPage;
  return (
    Array.isArray(p.items) &&
    p.items.every(validPet) &&
    ['total', 'page', 'page_size', 'pages'].every(
      (key) =>
        typeof (p as unknown as Record<string, unknown>)[key] === 'number',
    )
  );
};
