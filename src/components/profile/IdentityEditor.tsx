import { useState, type SyntheticEvent } from 'react';
import { api, errorMessage, getSession } from '../../lib/api';
import type { Identity } from '../../features/auth/profile';
import FormField from '../forms/FormField';

export default function IdentityEditor({
  identity,
  creating = false,
  onSaved,
  onCancel,
}: {
  identity: Identity;
  creating?: boolean;
  onSaved: (identity: Identity) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    try {
      const updated = await api<Identity>('/me/identity', {
        method: 'PATCH',
        body: Object.fromEntries(
          [
            'display_name',
            'headline',
            'biography',
            'location',
            'avatar_color',
          ].map((key) => [key, String(data.get(key) ?? '')]),
        ),
      });
      await getSession(true);
      await onSaved(updated);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="profile-editor"
      onSubmit={save}
      aria-label={creating ? 'Crear mi presentación' : 'Editar mi presentación'}
      aria-busy={busy}
    >
      <h2 tabIndex={-1}>
        {creating ? 'Creá tu presentación' : 'Tu presentación'}
      </h2>
      <p>
        Tu perfil es privado. El equipo de una solicitud puede conocer los datos
        que necesita para acompañar la adopción.
      </p>
      {error && (
        <p className="api-notice" role="alert">
          {error}
        </p>
      )}
      <fieldset className="management-fields" disabled={busy}>
        <legend className="sr-only">Datos de tu presentación</legend>
        <div className="form-grid">
          <FormField label="Nombre o alias">
            <input
              name="display_name"
              defaultValue={identity.display_name}
              maxLength={80}
              required
              autoComplete="nickname"
            />
          </FormField>
          <FormField label="Localidad">
            <input
              name="location"
              defaultValue={identity.location}
              maxLength={80}
              autoComplete="address-level2"
            />
          </FormField>
          <FormField label="Una frase sobre vos" full>
            <input
              name="headline"
              defaultValue={identity.headline}
              maxLength={100}
              placeholder="Una vida tranquila, espacio para un nuevo amigo"
            />
          </FormField>
          <FormField label="Acerca de mí" full>
            <textarea
              name="biography"
              defaultValue={identity.biography}
              maxLength={1200}
              rows={4}
            />
          </FormField>
        </div>
        <fieldset className="avatar-color-options">
          <legend>Color de tu avatar</legend>
          {(['peach', 'lime', 'lilac', 'blue'] as const).map((color) => (
            <label key={color} className={`avatar-color avatar-${color}`}>
              <input
                type="radio"
                name="avatar_color"
                value={color}
                defaultChecked={identity.avatar_color === color}
              />
              <span>
                {
                  {
                    peach: 'Durazno',
                    lime: 'Lima',
                    lilac: 'Lavanda',
                    blue: 'Cielo',
                  }[color]
                }
              </span>
            </label>
          ))}
        </fieldset>
        <div className="profile-actions">
          <button className="btn btn-orange" type="submit">
            {busy ? 'Guardando…' : 'Guardar mi presentación'}
          </button>
          <button className="btn btn-outline" type="button" onClick={onCancel}>
            Cancelar
          </button>
        </div>
      </fieldset>
    </form>
  );
}
