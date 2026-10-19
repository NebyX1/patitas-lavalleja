import { useState, type SyntheticEvent } from 'react';
import type { Pet } from '../../types/pet';
import { api, errorMessage } from '../../lib/api';
import FormField from '../forms/FormField';

export default function PhotoManager({
  pet,
  onSaved,
}: {
  pet: Pet;
  onSaved: (pet: Pet) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function upload(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const body = new FormData(form);
    const file = body.get('file');
    if (!(file instanceof File) || file.size > 12 * 1024 * 1024) {
      setError('Elegí una fotografía de hasta 12 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api<{ pet: Pet }>(`/admin/pets/${pet.id}/photos`, {
        method: 'POST',
        body,
      });
      onSaved(result.pet);
      form.reset();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/pets/${pet.id}/photos/${id}`, { method: 'DELETE' });
      onSaved(await api<Pet>(`/admin/pets/${pet.id}`));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="management-card" aria-labelledby="photo-manager-title">
      <h3 id="photo-manager-title">Fotografías de la ficha</h3>
      <p>
        Podés añadir hasta ocho fotografías. Usá imágenes del animal y evitá
        datos personales en la descripción.
      </p>
      {error && (
        <p role="alert" className="management-message is-error">
          {error}
        </p>
      )}
      <div className="admin-photo-list">
        {pet.photos?.map((photo) => {
          const variant = photo.variants?.card as unknown;
          const url =
            typeof variant === 'string'
              ? variant
              : variant && typeof variant === 'object' && 'url' in variant
                ? String(variant.url)
                : photo.url;
          return (
            <div className="admin-photo" key={photo.id}>
              {url && (
                <img src={url} alt={photo.alt || `Fotografía de ${pet.name}`} />
              )}
              <button
                type="button"
                onClick={() => remove(photo.id)}
                disabled={busy}
              >
                Eliminar fotografía
              </button>
            </div>
          );
        })}
      </div>
      <form onSubmit={upload}>
        <fieldset
          className="management-fields"
          disabled={busy || (pet.photos?.length ?? 0) >= 8}
        >
          <legend className="sr-only">Subir una fotografía</legend>
          <FormField label="Fotografía">
            <input
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
            />
          </FormField>
          <FormField label="Descripción para quienes no ven la imagen">
            <input name="alt" required maxLength={500} />
          </FormField>
          <button className="btn btn-outline" type="submit">
            {busy ? 'Procesando fotografía…' : 'Guardar fotografía'}
          </button>
        </fieldset>
      </form>
    </section>
  );
}
