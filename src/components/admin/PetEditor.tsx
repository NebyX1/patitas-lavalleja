import { useState, type SyntheticEvent } from 'react';
import type { Pet } from '../../types/pet';
import { api, errorMessage } from '../../lib/api';
import FormField from '../forms/FormField';
import CompatibilityEditor, { type Observation } from './CompatibilityEditor';
import PhotoManager from './PhotoManager';

export interface Organization {
  id: string;
  name: string;
  description: string;
  locality: string;
  department: string;
  active: boolean;
  is_demo: boolean;
}
const personalityFields: Record<string, string> = {
  sociability: 'Sociabilidad',
  independence: 'Independencia',
  companionship: 'Necesidad de compañía',
  playfulness: 'Interés en juegos',
  affection: 'Contacto físico',
  curiosity: 'Curiosidad',
  exploration: 'Tendencia a explorar',
  noise_sensitivity: 'Sensibilidad a ruidos',
  adaptability: 'Adaptación a cambios',
  interaction: 'Preferencia por interacción',
};
const publicationNames: Record<string, string> = {
  draft: 'Borrador',
  pending: 'Pendiente de revisión',
  published: 'Publicada',
  rejected: 'Requiere correcciones',
  archived: 'Archivada',
};
const availabilityNames: Record<string, string> = {
  available: 'Disponible',
  under_review: 'En evaluación',
  reserved: 'Encuentro en curso',
  adopted: 'Adoptado',
  withdrawn: 'Retirado',
};
const triState = [
  { value: '', label: 'No evaluado' },
  { value: 'true', label: 'Sí, según observaciones' },
  { value: 'false', label: 'No, según observaciones' },
];
const lines = (value: FormDataEntryValue | null) =>
  String(value ?? '')
    .split('\n')
    .map((text) => text.trim())
    .filter(Boolean);

export default function PetEditor({
  pet,
  organizations,
  isAdmin,
  onSaved,
}: {
  pet: Pet | null;
  organizations: Organization[];
  isAdmin: boolean;
  onSaved: (pet: Pet) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [observations, setObservations] = useState<Observation[]>(
    (pet?.compatibilities ?? []).map((item) => ({
      ...item,
      observation: item.observation ?? '',
    })),
  );
  const [organizationId, setOrganizationId] = useState(
    pet?.organization_id ?? organizations.find((item) => item.active)?.id ?? '',
  );
  const personality = pet?.personality ?? {};
  const requirements = pet?.requirements ?? {};
  const organization = organizations.find((item) => item.id === organizationId);
  const unknownNumber = (value: FormDataEntryValue | null) =>
    value === null || value === '' ? null : Number(value);
  const unknownBoolean = (value: FormDataEntryValue | null) =>
    value === 'true' ? true : value === 'false' ? false : null;

  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const body: Record<string, unknown> = {
      organization_id: organizationId,
      name: data.get('name'),
      species: data.get('species'),
      age: data.get('age'),
      months: Number(data.get('months') || 0),
      stage: data.get('stage'),
      size: data.get('size'),
      sex: data.get('sex'),
      location: data.get('location'),
      department: data.get('department'),
      breed: data.get('breed'),
      weight_kg: unknownNumber(data.get('weight_kg')),
      adult_size: data.get('adult_size') || null,
      tag: data.get('tag'),
      tagIcon: pet?.tagIcon ?? 'heart',
      tagColor: pet?.tagColor ?? '#e4edae',
      energy: unknownNumber(data.get('energy')),
      pos: pet?.pos ?? '50% 50%',
      quote: data.get('quote'),
      traits: String(data.get('traits') ?? '')
        .split(',')
        .map((text) => text.trim())
        .filter(Boolean),
      story: data.get('story'),
      needs: data.get('needs'),
      care: lines(data.get('care')),
      alt: data.get('alt'),
      smallSpace: unknownBoolean(data.get('small_space_compatible')),
      personality: {
        ...Object.fromEntries(
          Object.keys(personalityFields).map((key) => [
            key,
            unknownNumber(data.get(`personality_${key}`)),
          ]),
        ),
        observations: data.get('personality_observations'),
        likes: String(data.get('likes') ?? '')
          .split(',')
          .map((text) => text.trim())
          .filter(Boolean),
      },
      requirements: {
        ...requirements,
        activity_minutes: unknownNumber(data.get('activity_minutes')),
        mental_stimulation_minutes: unknownNumber(
          data.get('mental_stimulation_minutes'),
        ),
        max_hours_alone: unknownNumber(data.get('max_hours_alone')),
        secure_outdoor_required: unknownBoolean(
          data.get('secure_outdoor_required'),
        ),
        small_space_compatible: unknownBoolean(
          data.get('small_space_compatible'),
        ),
        special_care_required: unknownBoolean(
          data.get('special_care_required'),
        ),
        special_care: unknownBoolean(data.get('special_care')),
        only_pet: unknownBoolean(data.get('only_pet')),
        gradual_introduction: unknownBoolean(data.get('gradual_introduction')),
        training_level: unknownNumber(data.get('training_level')),
        training_notes: data.get('training_notes'),
        mobility_needs: data.get('mobility_needs'),
        grooming: data.get('grooming'),
        treatment: data.get('treatment'),
        mandatory_care: lines(data.get('mandatory_care')),
        environment: data.get('environment'),
      },
      compatibilities: observations,
      adoption_status: pet?.adoption_status ?? 'available',
      is_demo: pet?.is_demo || organization?.is_demo || false,
      ...(pet ? { id: pet.id, profile_version: pet.profile_version } : {}),
    };
    setBusy(true);
    setError('');
    setMessage('');
    try {
      onSaved(
        await api<Pet>(pet ? `/admin/pets/${pet.id}` : '/admin/pets', {
          method: pet ? 'PUT' : 'POST',
          body,
        }),
      );
      setMessage('Guardamos la ficha.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, body?: unknown, method = 'POST') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      onSaved(await api<Pet>(path, { method, body }));
      setMessage('Actualizamos el estado de la ficha.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2>{pet ? `Ficha de ${pet.name}` : 'Una nueva historia'}</h2>
      {pet && (
        <p>
          <span className="management-status">
            {publicationNames[pet.publication_status ?? 'draft']}
          </span>{' '}
          · {availabilityNames[pet.adoption_status ?? 'available']}
          {pet.is_demo ? ' · Perfil ficticio de prueba' : ''}
        </p>
      )}
      {error && (
        <p role="alert" className="management-message is-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="management-message">
          {message}
        </p>
      )}
      <form onSubmit={save}>
        <fieldset className="management-fields" disabled={busy}>
          <legend className="sr-only">Datos de la mascota</legend>
          <details open>
            <summary>Identidad, historia y necesidades</summary>
            <div className="form-grid">
              <FormField label="Nombre">
                <input
                  name="name"
                  defaultValue={pet?.name}
                  required
                  maxLength={80}
                />
              </FormField>
              <FormField label="Organización responsable">
                <select
                  required
                  value={organizationId}
                  onChange={(event) => setOrganizationId(event.target.value)}
                >
                  <option value="">Elegí una organización</option>
                  {organizations
                    .filter(
                      (item) => item.active || item.id === pet?.organization_id,
                    )
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                        {item.is_demo ? ' (pruebas)' : ''}
                      </option>
                    ))}
                </select>
              </FormField>
              <FormField label="Especie">
                <select name="species" defaultValue={pet?.species ?? 'dog'}>
                  <option value="dog">Perro</option>
                  <option value="cat">Gato</option>
                  <option value="rabbit">Conejo</option>
                  <option value="bird">Ave</option>
                  <option value="other">Otra especie</option>
                </select>
              </FormField>
              <FormField label="Sexo">
                <select name="sex" defaultValue={pet?.sex ?? 'A confirmar'}>
                  <option>A confirmar</option>
                  <option>Macho</option>
                  <option>Hembra</option>
                </select>
              </FormField>
              <FormField label="Edad o estimación visible">
                <input
                  name="age"
                  required
                  defaultValue={pet?.age ?? 'Edad a confirmar'}
                  maxLength={80}
                />
              </FormField>
              <FormField label="Edad aproximada en meses">
                <input
                  name="months"
                  type="number"
                  min={0}
                  max={600}
                  defaultValue={pet?.months ?? 0}
                />
              </FormField>
              <FormField label="Etapa de vida">
                <select name="stage" defaultValue={pet?.stage ?? 'adult'}>
                  <option value="young">Joven</option>
                  <option value="adult">Adulto</option>
                  <option value="senior">Senior</option>
                </select>
              </FormField>
              <FormField label="Tamaño actual">
                <select name="size" defaultValue={pet?.size ?? 'Mediano'}>
                  <option>Pequeño</option>
                  <option>Mediano</option>
                  <option>Grande</option>
                </select>
              </FormField>
              <FormField label="Tamaño adulto estimado">
                <input
                  name="adult_size"
                  defaultValue={String(
                    (pet as unknown as Record<string, unknown> | null)
                      ?.adult_size ?? '',
                  )}
                  maxLength={30}
                />
              </FormField>
              <FormField label="Peso aproximado en kg">
                <input
                  name="weight_kg"
                  type="number"
                  min={0}
                  max={200}
                  step="0.1"
                  defaultValue={String(
                    (pet as unknown as Record<string, unknown> | null)
                      ?.weight_kg ?? '',
                  )}
                />
              </FormField>
              <FormField label="Raza, si se conoce">
                <input
                  name="breed"
                  defaultValue={String(
                    (pet as unknown as Record<string, unknown> | null)?.breed ??
                      'Mestizo',
                  )}
                  maxLength={100}
                />
              </FormField>
              <FormField label="Localidad">
                <input
                  name="location"
                  defaultValue={pet?.location ?? 'Minas'}
                  required
                  maxLength={80}
                />
              </FormField>
              <FormField label="Departamento">
                <input
                  name="department"
                  defaultValue={pet?.department ?? 'Lavalleja'}
                  required
                  maxLength={80}
                />
              </FormField>
              <FormField label="Una frase sobre su personalidad">
                <input
                  name="tag"
                  defaultValue={pet?.tag ?? 'Una historia por conocer'}
                  maxLength={80}
                  required
                />
              </FormField>
              <FormField label="Su presentación breve" full>
                <input
                  name="quote"
                  defaultValue={pet?.quote ?? 'Conocé mi historia.'}
                  maxLength={300}
                  required
                />
              </FormField>
              <FormField label="Rasgos, separados por comas" full>
                <input
                  name="traits"
                  defaultValue={pet?.traits.join(', ')}
                  maxLength={1500}
                />
              </FormField>
              <FormField label="Su historia" full>
                <textarea
                  name="story"
                  defaultValue={pet?.story}
                  required
                  maxLength={10000}
                />
              </FormField>
              <FormField label="Sus necesidades" full>
                <textarea
                  name="needs"
                  defaultValue={pet?.needs}
                  required
                  maxLength={7000}
                />
              </FormField>
              <FormField label="Cuidados visibles, uno por línea" full>
                <textarea
                  name="care"
                  defaultValue={pet?.care.join('\n')}
                  maxLength={5000}
                />
              </FormField>
              <FormField label="Descripción visual del animal" full>
                <input name="alt" defaultValue={pet?.alt} maxLength={500} />
              </FormField>
            </div>
          </details>
          <details>
            <summary>Personalidad observada</summary>
            <p>
              Usá una escala de 0 (muy baja) a 5 (muy alta). Dejá sin evaluar lo
              que todavía no se conoce.
            </p>
            <div className="form-grid">
              <FormField label="Energía observada">
                <select name="energy" defaultValue={pet?.energy ?? ''}>
                  <option value="">No evaluada</option>
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <option value={value} key={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </FormField>
              {Object.entries(personalityFields).map(([key, label]) => (
                <FormField key={key} label={label}>
                  <select
                    name={`personality_${key}`}
                    defaultValue={String(personality[key] ?? '')}
                  >
                    <option value="">No evaluada</option>
                    {[0, 1, 2, 3, 4, 5].map((value) => (
                      <option value={value} key={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </FormField>
              ))}
              <FormField label="Conductas observadas y contexto" full>
                <textarea
                  name="personality_observations"
                  maxLength={5000}
                  defaultValue={String(personality.observations ?? '')}
                />
              </FormField>
              <FormField
                label="Actividades que disfruta, separadas por comas"
                full
              >
                <input
                  name="likes"
                  maxLength={1500}
                  defaultValue={
                    Array.isArray(personality.likes)
                      ? personality.likes.join(', ')
                      : ''
                  }
                />
              </FormField>
            </div>
          </details>
          <details>
            <summary>Actividad, hogar y cuidados</summary>
            <div className="form-grid">
              <FormField label="Minutos diarios de actividad estimados">
                <input
                  name="activity_minutes"
                  type="number"
                  min={0}
                  max={480}
                  defaultValue={String(requirements.activity_minutes ?? '')}
                />
              </FormField>
              <FormField label="Minutos diarios de estimulación mental">
                <input
                  name="mental_stimulation_minutes"
                  type="number"
                  min={0}
                  max={240}
                  defaultValue={String(
                    requirements.mental_stimulation_minutes ?? '',
                  )}
                />
              </FormField>
              <FormField label="Horas a solas toleradas, si se conoce">
                <input
                  name="max_hours_alone"
                  type="number"
                  min={0}
                  max={24}
                  step="0.5"
                  defaultValue={String(requirements.max_hours_alone ?? '')}
                />
              </FormField>
              {[
                ['secure_outdoor_required', 'Requiere exterior seguro'],
                [
                  'small_space_compatible',
                  'Necesidades compatibles con espacio pequeño',
                ],
                ['special_care', 'Cuidados especiales observados'],
                ['special_care_required', 'Cuidados especiales indispensables'],
                ['only_pet', 'Necesita ser la única mascota'],
                ['gradual_introduction', 'Requiere presentación gradual'],
              ].map(([key, label]) => (
                <FormField key={key} label={label}>
                  <select
                    name={key}
                    defaultValue={String(requirements[key] ?? '')}
                  >
                    {triState.map((item) => (
                      <option value={item.value} key={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              ))}
              <FormField label="Apoyo para entrenamiento que necesita (0 bajo, 5 alto)">
                <select
                  name="training_level"
                  defaultValue={String(requirements.training_level ?? '')}
                >
                  <option value="">No evaluado</option>
                  {[0, 1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Observaciones sobre entrenamiento y adaptación"
                full
              >
                <textarea
                  name="training_notes"
                  maxLength={3000}
                  defaultValue={String(requirements.training_notes ?? '')}
                />
              </FormField>
              {[
                [
                  'mobility_needs',
                  'Necesidades de accesibilidad o movilidad',
                  2000,
                ],
                ['grooming', 'Aseo y mantenimiento', 2000],
                ['treatment', 'Tratamientos y seguimiento publicables', 3000],
                ['environment', 'Requisitos particulares del entorno', 2000],
              ].map(([key, label, max]) => (
                <FormField key={key} label={String(label)} full>
                  <textarea
                    name={String(key)}
                    maxLength={Number(max)}
                    defaultValue={String(requirements[key] ?? '')}
                  />
                </FormField>
              ))}
              <FormField label="Cuidados indispensables, uno por línea" full>
                <textarea
                  name="mandatory_care"
                  maxLength={5000}
                  defaultValue={
                    Array.isArray(requirements.mandatory_care)
                      ? requirements.mandatory_care.join('\n')
                      : ''
                  }
                />
              </FormField>
            </div>
          </details>
          <CompatibilityEditor
            value={observations}
            onChange={setObservations}
          />
          <p className="management-footnote">
            Compartí información del animal. Evitá nombres de niños, teléfonos,
            direcciones particulares o información privada de otras personas.
          </p>
          <button type="submit" className="btn btn-orange">
            {busy ? 'Guardando…' : 'Guardar ficha'}
          </button>
        </fieldset>
      </form>
      {pet && (
        <>
          <div className="admin-actions">
            {['draft', 'rejected', 'pending'].includes(
              pet.publication_status ?? 'draft',
            ) && (
              <button
                className="btn btn-dark"
                disabled={busy}
                onClick={() => action(`/admin/pets/${pet.id}/submit`)}
              >
                Enviar a revisión
              </button>
            )}
            {isAdmin &&
              ['pending', 'published'].includes(
                pet.publication_status ?? '',
              ) && (
                <button
                  className="btn btn-orange"
                  disabled={busy}
                  onClick={() =>
                    action(`/admin/pets/${pet.id}/publication`, {
                      status: 'published',
                    })
                  }
                >
                  Aprobar publicación
                </button>
              )}
            {isAdmin && pet.publication_status === 'pending' && (
              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={() =>
                  action(`/admin/pets/${pet.id}/publication`, {
                    status: 'rejected',
                    note: 'Revisar la ficha y volver a presentar.',
                  })
                }
              >
                Pedir correcciones
              </button>
            )}
            {pet.publication_status !== 'archived' && isAdmin && (
              <button
                className="btn btn-outline"
                disabled={busy}
                onClick={() =>
                  action(`/admin/pets/${pet.id}/publication`, {
                    status: 'archived',
                  })
                }
              >
                Archivar ficha
              </button>
            )}
            {pet.publication_status === 'published' && (
              <a className="btn btn-outline" href={`/mascotas/${pet.id}/`}>
                Ver ficha pública
              </a>
            )}
          </div>
          <p className="management-footnote">
            Guardá los cambios antes de enviar la ficha a revisión. Una
            publicación se aprueba desde una cuenta administradora.
          </p>
          <FormField label="Disponibilidad actual">
            <select
              disabled={busy}
              value={pet.adoption_status ?? 'available'}
              onChange={(event) =>
                action(
                  `/admin/pets/${pet.id}/status`,
                  { status: event.target.value },
                  'PATCH',
                )
              }
            >
              {Object.entries(availabilityNames).map(([key, label]) => (
                <option value={key} key={key}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <PhotoManager pet={pet} onSaved={onSaved} />
        </>
      )}
    </div>
  );
}
