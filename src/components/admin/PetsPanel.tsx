import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import type { Pet, PetPage } from '../../types/pet';
import PetEditor, { type Organization } from './PetEditor';
export default function PetsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Pet[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<Pet | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  async function load(signal?: AbortSignal) {
    const [pets, orgs] = await Promise.all([
      api<PetPage>(`/admin/pets?page=${page}`, { signal }),
      api<{ items: Organization[] }>('/admin/organizations?page_size=100', {
        signal,
      }),
    ]);
    if (!signal?.aborted) {
      setItems(pets.items);
      setPages(pets.pages);
      setOrganizations(orgs.items);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((reason) => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    });
    return () => controller.abort();
  }, [page]);
  function saved(pet: Pet) {
    setSelected(pet);
    void load().catch((reason) => setError(errorMessage(reason)));
  }
  return (
    <section>
      {error && (
        <p role="alert" className="management-message is-error">
          {error}
        </p>
      )}
      <div className="admin-layout">
        <aside>
          <button className="btn btn-dark" onClick={() => setSelected(null)}>
            Crear una ficha
          </button>
          <p className="management-footnote">
            Elegí una historia para revisar sus datos, fotos y publicación.
          </p>
          <div className="admin-list">
            {items.map((pet) => (
              <button
                className="admin-pet-button"
                key={pet.id}
                onClick={() => setSelected(pet)}
                aria-pressed={selected?.id === pet.id}
              >
                {pet.name}
                <small>
                  {pet.location} · {pet.publication_status}
                  {pet.is_demo ? ' · Prueba' : ''}
                </small>
              </button>
            ))}
          </div>
          <div className="admin-pagination">
            <button
              className="btn btn-outline btn-small"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <span>
              {page} / {Math.max(1, pages)}
            </span>
            <button
              className="btn btn-outline btn-small"
              disabled={page >= pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Siguiente
            </button>
          </div>
        </aside>
        <div>
          {organizations.length ? (
            <PetEditor
              key={`${selected?.id ?? 'new'}-${selected?.profile_version ?? 0}`}
              pet={selected}
              organizations={organizations}
              isAdmin={isAdmin}
              onSaved={saved}
            />
          ) : (
            <p>
              {isAdmin
                ? 'Creá una organización antes de preparar la primera ficha.'
                : 'Un administrador debe asignarte una organización para que puedas gestionar mascotas.'}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
