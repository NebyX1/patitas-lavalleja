import { validPet, type Pet } from '../../types/pet';
export interface AdopterProfile {
  species: string[];
  sizes: string[];
  stages: string[];
  activity_level: number | null;
  activity_minutes: number | null;
  hours_away: number | null;
  experience: 'none' | 'some' | 'experienced' | null;
  training_commitment: number | null;
  housing_type: string | null;
  secure_outdoor: boolean | null;
  household_animals: string[];
  household_confirmed: boolean | null;
  children_age_groups: string[];
  special_care_capacity: boolean | null;
  preferred_traits: string[];
  location: string;
  department: string;
  flexibility: number | null;
  preferences_text: string;
}
export const emptyProfile: AdopterProfile = {
  species: [],
  sizes: [],
  stages: [],
  activity_level: null,
  activity_minutes: null,
  hours_away: null,
  experience: null,
  training_commitment: null,
  housing_type: null,
  secure_outdoor: null,
  household_animals: [],
  household_confirmed: null,
  children_age_groups: [],
  special_care_capacity: null,
  preferred_traits: [],
  location: '',
  department: 'Lavalleja',
  flexibility: null,
  preferences_text: '',
};
export interface MatchAssessment {
  eligibility: 'eligible' | 'needs_review' | 'blocked' | 'unavailable';
  home_score: number | null;
  preference_score: number | null;
  structured_score: number | null;
  confidence: number;
  positive: string[];
  attention: string[];
  unknown: string[];
  hard_rules: {
    id: string;
    reason: string;
    blocking: boolean;
    observation?: string;
  }[];
  rules_version: string;
  completeness: number;
}
export interface MatchResults {
  results: { pet: Pet; match: MatchAssessment }[];
  total?: number;
  excluded?: { blocked: number; unavailable: number };
  meta: {
    degraded: boolean;
    warnings: string[];
    components: Record<string, string>;
    duration_ms?: number;
  };
}
export function validMatchResults(value: unknown): value is MatchResults {
  if (!value || typeof value !== 'object') return false;
  const result = value as MatchResults;
  const strings = (items: unknown) =>
    Array.isArray(items) && items.every((item) => typeof item === 'string');
  const score = (n: unknown) =>
    n === null || (typeof n === 'number' && n >= 0 && n <= 100);
  return (
    Array.isArray(result.results) &&
    result.results.every(
      (item) =>
        validPet(item.pet) &&
        !!item.match &&
        ['eligible', 'needs_review', 'blocked', 'unavailable'].includes(
          item.match.eligibility,
        ) &&
        score(item.match.home_score) &&
        score(item.match.preference_score) &&
        score(item.match.structured_score) &&
        typeof item.match.completeness === 'number' &&
        typeof item.match.confidence === 'number' &&
        strings(item.match.positive) &&
        strings(item.match.attention) &&
        strings(item.match.unknown) &&
        Array.isArray(item.match.hard_rules),
    ) &&
    !!result.meta &&
    typeof result.meta.degraded === 'boolean' &&
    strings(result.meta.warnings) &&
    !!result.meta.components
  );
}
