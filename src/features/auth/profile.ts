import type { Pet } from '../../types/pet';
import type { AdopterProfile, MatchAssessment } from '../match/profile';

export type Identity = {
  id: string;
  display_name: string;
  headline: string;
  biography: string;
  location: string;
  avatar_color: 'peach' | 'lime' | 'lilac' | 'blue';
  role: 'adopter' | 'responsible' | 'admin';
  is_demo: boolean;
  member_since: string;
};
export type CompatibilityResult = {
  decision:
    | 'favorable'
    | 'incompatible'
    | 'review_required'
    | 'insufficient_information';
  label: string;
  summary: string;
  notice: string;
  conversation_points: string[];
  match: MatchAssessment & {
    dimensions?: {
      home: Record<string, number | null>;
      preferences: Record<string, number | null>;
    };
  };
  meta: {
    degraded: boolean;
    warnings: string[];
    components: Record<string, string>;
  };
  availability: { publication_status: string; adoption_status: string };
};
export type Assessment = CompatibilityResult & {
  id: string;
  created_at: string;
  evaluated_by: string;
  stale: boolean;
  pet_version: number;
};
export type PersonalAssessment = CompatibilityResult & {
  pet_id: string;
  pet_version: number;
  created_at: string;
  profile_updated_at: string;
};
export type PersonalApplication = {
  id: string;
  pet_id: string;
  pet_name: string;
  status: string;
  created_at: string;
  is_demo: boolean;
  history: { status: string; note: string; created_at: string }[];
  assessment: Assessment | null;
};
export type Dashboard = {
  identity: Identity;
  household: AdopterProfile | null;
  household_updated_at: string | null;
  completion: number;
  favorites: Pet[];
  applications: PersonalApplication[];
  organizations: {
    id: string;
    name: string;
    locality: string;
    description: string;
    pets: number;
    applications: number;
    is_demo: boolean;
  }[];
};
export const applicationStates: Record<string, string> = {
  received: 'Recibida',
  under_review: 'En evaluación',
  information_requested: 'Información solicitada',
  meeting_scheduled: 'Encuentro coordinado',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  closed: 'Cerrada',
  completed: 'Adopción concretada',
};
// SQLite timestamps are UTC; older API fields omit the timezone suffix.
export function formatProfileDate(
  value: string,
  options: Intl.DateTimeFormatOptions,
) {
  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  return new Date(timestamp).toLocaleString('es-UY', options);
}
export const displayName = (name: string) => name.split('·')[0].trim();
export const initials = (name: string) =>
  displayName(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
export const profileLabels: Record<string, string> = {
  dog: 'Perros',
  cat: 'Gatos',
  other: 'Otras especies',
  rabbit: 'Conejos',
  bird: 'Aves',
  dogs: 'Perros',
  cats: 'Gatos',
  rabbits: 'Conejos',
  birds: 'Aves',
  young_children: 'Niños menores de 6',
  school_children: 'Niños de 6 a 12',
  teenagers: 'Adolescentes',
  apartment: 'Apartamento',
  house: 'Casa',
  young: 'Joven',
  adult: 'Adulto',
  senior: 'Senior',
  none: 'Primera adopción',
  some: 'Experiencia previa',
  experienced: 'Con experiencia',
};
