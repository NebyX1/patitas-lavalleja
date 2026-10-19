import { useEffect, useState, type SyntheticEvent } from 'react';
import { api, errorMessage, getSession, type User } from '../../lib/api';
import FormField from '../forms/FormField';

export default function AccountsPanel() {
  const [items, setItems] = useState<(User & { active: boolean })[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load(signal?: AbortSignal) {
    const data = await api<{
      items: (User & { active: boolean })[];
      pages: number;
    }>(`/admin/users?page=${page}`, { signal });
    if (!signal?.aborted) {
      setItems(data.items);
      setPages(data.pages);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((reason) => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    });
    return () => controller.abort();
  }, [page]);
  async function save(event: SyntheticEvent<HTMLFormElement>, user: User) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/users/${user.id}`, {
        method: 'PATCH',
        body: { role: data.get('role'), active: data.get('active') === 'on' },
      });
      await getSession(true);
      await load();
      setMessage(
        'Actualizamos los permisos y cerramos las sesiones anteriores de esa cuenta.',
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Cuentas y permisos</h2>
      <p>
        Asigná responsabilidades según el trabajo de cada persona. Los cambios
        revocan las sesiones anteriores.
      </p>
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
      {items.map((user) => (
        <form
          className="management-card"
          key={`${user.id}-${user.role}-${user.active}`}
          onSubmit={(event) => save(event, user)}
        >
          <h3>{user.display_name}</h3>
          <p>{user.email}</p>
          <fieldset className="management-fields" disabled={busy}>
            <legend className="sr-only">Permisos de {user.display_name}</legend>
            <FormField label="Rol">
              <select name="role" defaultValue={user.role}>
                <option value="adopter">Adoptante</option>
                <option value="responsible">Responsable de organización</option>
                <option value="admin">Administrador</option>
              </select>
            </FormField>
            <label className="form-checkbox">
              <input
                name="active"
                type="checkbox"
                defaultChecked={user.active}
              />
              <span>Cuenta activa</span>
            </label>
            <button className="btn btn-outline">Guardar permisos</button>
          </fieldset>
        </form>
      ))}
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
    </section>
  );
}
