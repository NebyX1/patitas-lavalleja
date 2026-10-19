import type { AdopterProfile } from '../../features/match/profile';
import { profileLabels } from '../../features/auth/profile';

export default function HouseholdSummary({
  profile,
}: {
  profile: AdopterProfile | null;
}) {
  const values = (items: string[] | undefined) =>
    items?.length
      ? items.map((item) => profileLabels[item] ?? item).join(' · ')
      : 'Por confirmar';
  const yes = (value: boolean | null | undefined) =>
    value === true ? 'Sí' : value === false ? 'No' : 'Por confirmar';
  return (
    <div className="household-summary">
      <dl className="household-facts">
        {[
          ['Localidad', profile?.location || 'Por confirmar'],
          [
            'Vivienda',
            profile?.housing_type
              ? (profileLabels[profile.housing_type] ?? profile.housing_type)
              : 'Por confirmar',
          ],
          [
            'Actividad disponible',
            profile?.activity_minutes != null
              ? `${profile.activity_minutes} min al día`
              : 'Por confirmar',
          ],
          [
            'Tiempo fuera de casa',
            profile?.hours_away != null
              ? `${profile.hours_away} h al día`
              : 'Por confirmar',
          ],
          [
            'Experiencia',
            profile?.experience
              ? profileLabels[profile.experience]
              : 'Por confirmar',
          ],
          ['Espacio exterior seguro', yes(profile?.secure_outdoor)],
          [
            'Otros animales',
            profile?.household_confirmed && !profile.household_animals.length
              ? 'Sin otros animales, confirmado'
              : values(profile?.household_animals),
          ],
          [
            'Niños y adolescentes',
            profile?.household_confirmed && !profile.children_age_groups.length
              ? 'Sin menores, confirmado'
              : values(profile?.children_age_groups),
          ],
          ['Cuidados especiales', yes(profile?.special_care_capacity)],
          [
            'Composición del hogar',
            profile?.household_confirmed === true
              ? 'Confirmada por la persona'
              : 'Todavía por confirmar',
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {profile?.preferences_text && (
        <blockquote className="profile-quote">
          {profile.preferences_text}
        </blockquote>
      )}
      {!!profile?.preferred_traits?.length && (
        <div className="profile-chips">
          {profile.preferred_traits.map((trait) => (
            <span key={trait}>{trait}</span>
          ))}
        </div>
      )}
    </div>
  );
}
