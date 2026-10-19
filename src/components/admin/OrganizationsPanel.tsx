import { useEffect, useState, type SyntheticEvent } from 'react';
import { api, errorMessage, type User } from '../../lib/api';
import FormField from '../forms/FormField';
import type { Organization } from './PetEditor';

export default function OrganizationsPanel() {
  const [items, setItems] = useState<Organization[]>([]);
  const [users, setUsers] = useState<(User & { active: boolean })[]>([]);
  const [selected, setSelected] = useState<Organization | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const [orgs, accounts] = await Promise.all([
      api<{ items: Organization[] }>('/admin/organizations?page_size=100'),
      api<{ items: (User & { active: boolean })[] }>(
        '/admin/users?page_size=100',
      ),
    ]);
    setItems(orgs.items);
    setUsers(accounts.items);
  }
  useEffect(() => {
    void load().catch((reason) => setError(errorMessage(reason)));
  }, []);
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const body = {
        name: data.get('name'),
        description: data.get('description'),
        locality: data.get('locality'),
        department: data.get('department'),
        active: data.get('active') === 'on',
      };
      const result = await api<Organization>(
        selected
          ? `/admin/organizations/${selected.id}`
          : '/admin/organizations',
        { method: selected ? 'PUT' : 'POST', body },
      );
      setSelected(result);
      await load();
      setMessage('Guardamos la organización.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function addMember(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/admin/organizations/${selected.id}/members`, {
        method: 'POST',
        body: { user_id: data.get('user_id') },
      });
      await load();
      setMessage(
        'Asignamos la cuenta a esta organización. La persona debe volver a ingresar para usar sus nuevos permisos.',
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function removeMember(userId: string) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/organizations/${selected.id}/members/${userId}`, {
        method: 'DELETE',
      });
      await load();
      setMessage('Quitamos la asignación a esta organización.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Organizaciones y responsables</h2>
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
      <div className="admin-layout">
        <div>
          <button className="btn btn-dark" onClick={() => setSelected(null)}>
            Nueva organización
          </button>
          <ul className="management-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  className="admin-pet-button"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelected(item)}
                >
                  {item.name}
                  <small>
                    {item.locality} · {item.active ? 'Activa' : 'Inactiva'}
                    {item.is_demo ? ' · Pruebas' : ''}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <form onSubmit={save} key={selected?.id ?? 'new'}>
            <fieldset className="management-fields" disabled={busy}>
              <legend className="sr-only">Datos de la organización</legend>
              <FormField label="Nombre">
                <input
                  name="name"
                  required
                  maxLength={120}
                  defaultValue={selected?.name}
                />
              </FormField>
              <FormField label="Presentación">
                <textarea
                  name="description"
                  maxLength={5000}
                  defaultValue={selected?.description}
                />
              </FormField>
              <FormField label="Localidad">
                <input
                  name="locality"
                  maxLength={80}
                  defaultValue={selected?.locality}
                />
              </FormField>
              <FormField label="Departamento">
                <input
                  name="department"
                  maxLength={80}
                  defaultValue={selected?.department ?? 'Lavalleja'}
                />
              </FormField>
              <label className="form-checkbox">
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={selected?.active ?? true}
                />
                <span>Organización activa</span>
              </label>
              <button className="btn btn-orange">Guardar organización</button>
            </fieldset>
          </form>
          {selected && (
            <div className="management-card">
              <h3>Responsables de {selected.name}</h3>
              <p>
                Las cuentas asignadas pueden gestionar sus fichas y solicitudes.
              </p>
              <ul className="management-list">
                {users
                  .filter((user) =>
                    user.organization_ids?.includes(selected.id),
                  )
                  .map((user) => (
                    <li key={user.id}>
                      <div>
                        {user.display_name}
                        <small>{user.email}</small>
                      </div>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => removeMember(user.id)}
                      >
                        Quitar asignación
                      </button>
                    </li>
                  ))}
              </ul>
              <form onSubmit={addMember}>
                <fieldset className="management-fields" disabled={busy}>
                  <legend className="sr-only">Asignar responsable</legend>
                  <FormField label="Cuenta a asignar">
                    <select name="user_id" required defaultValue="">
                      <option value="">Elegí una cuenta</option>
                      {users
                        .filter(
                          (user) =>
                            user.active &&
                            !user.organization_ids?.includes(selected.id),
                        )
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.display_name} · {user.email}
                          </option>
                        ))}
                    </select>
                  </FormField>
                  <button className="btn btn-outline">
                    Asignar responsable
                  </button>
                </fieldset>
              </form>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
