import type { AdopterProfile } from '../../features/match/profile';
import Icon from '../ui/Icon';

const fieldIcons: Partial<Record<keyof AdopterProfile, string>> = {
  stages: 'heart',
  sizes: 'size',
  activity_level: 'sun',
  housing_type: 'home',
  secure_outdoor: 'shield',
  household_animals: 'paw',
  children_age_groups: 'people',
  experience: 'star',
  training_commitment: 'clock',
  special_care_capacity: 'heart',
  preferred_traits: 'spark',
  flexibility: 'pin',
};

export default function MatchChoices({
  field,
  values,
  value,
  multi,
  disabled,
  onSelect,
  label,
}: {
  field: keyof AdopterProfile;
  values: [string, string, string][];
  value: AdopterProfile[keyof AdopterProfile];
  multi: boolean;
  disabled: boolean;
  onSelect: (value: string) => void;
  label: string;
}) {
  return (
    <div
      className="quiz-options"
      data-field={field}
      role="group"
      aria-label={label}
    >
      {values.map(([id, name, description]) => {
        const selected = multi
          ? Array.isArray(value) && value.includes(id)
          : String(value) === id;
        const photo =
          field === 'species'
            ? ({ dog: 'milo', cat: 'mora' } as Record<string, string>)[id]
            : null;
        return (
          <button
            type="button"
            disabled={disabled}
            key={id}
            className={`quiz-option${selected ? ' selected' : ''}${description ? '' : ' is-compact'}`}
            aria-pressed={selected}
            onClick={() => onSelect(id)}
          >
            <span
              className={`match-choice-visual${photo ? ' has-photo' : ''}`}
              aria-hidden="true"
            >
              {photo ? (
                <img
                  src={`/images/pets/${photo}-480.webp`}
                  alt=""
                  width="120"
                  height="120"
                />
              ) : (
                <Icon name={fieldIcons[field] ?? 'paw'} />
              )}
            </span>
            <span className="match-choice-text">
              <b>{name}</b>
              {description && <small>{description}</small>}
            </span>
            <span className="choice-dot" aria-hidden="true">
              {selected && <Icon name="check" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
