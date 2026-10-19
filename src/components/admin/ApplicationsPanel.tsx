import { useEffect, useState, type SyntheticEvent } from 'react';
import { api, errorMessage } from '../../lib/api';
import FormField from '../forms/FormField';
import ApplicationReview from './ApplicationReview';
import {
  formatProfileDate,
  type Assessment,
} from '../../features/auth/profile';

interface Application {
  id: string;
  pet_id: string;
  pet_name: string;
  status: string;
  message: string;
  locality: string;
  phone?: string;
  is_demo: boolean;
  assessment: Assessment | null;
  applicant: { display_name: string; email: string };
  history: { status: string; note: string; created_at: string }[];
}
const names: Record<string, string> = {
  received: 'Recibida',
  under_review: 'En evaluación',
  information_requested: 'Pedir información',
  meeting_scheduled: 'Encuentro coordinado',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  closed: 'Cerrada',
  completed: 'Adopción concretada',
};
const transitions: Record<string, string[]> = {
  received: ['under_review', 'information_requested', 'rejected', 'closed'],
  under_review: [
    'information_requested',
    'meeting_scheduled',
    'approved',
    'rejected',
    'closed',
  ],
  information_requested: [
    'under_review',
    'meeting_scheduled',
    'rejected',
    'closed',
  ],
  meeting_scheduled: ['under_review', 'approved', 'rejected', 'closed'],
  approved: ['completed', 'closed'],
  rejected: ['under_review', 'closed'],
  closed: [],
  completed: [],
};
export default function ApplicationsPanel() {
  const [items, setItems] = useState<Application[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load(signal?: AbortSignal) {
    const data = await api<{ items: Application[]; pages: number }>(
      `/admin/applications?page=${page}`,
      { signal },
    );
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
  async function update(
    event: SyntheticEvent<HTMLFormElement>,
    item: Application,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/applications/${item.id}`, {
        method: 'PATCH',
        body: { status: data.get('status'), note: data.get('note') },
      });
      await load();
      setMessage('Actualizamos la solicitud y su historial.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Encuentros que empiezan</h2>
      <p>
        La evaluación y la decisión corresponden al equipo responsable de cada
        animal.
      </p>
      {error && (
        <p className="management-message is-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="management-message" role="status">
          {message}
        </p>
      )}
      {!items.length && (
        <p>Todavía no hay solicitudes para las mascotas que gestionás.</p>
      )}
      {items.map((item) => (
        <article className="management-card" key={`${item.id}-${item.status}`}>
          <div className="management-title-row">
            <div>
              <h3>{item.pet_name}</h3>
              <p>
                {item.applicant.display_name} · {item.applicant.email}
                <br />
                {item.locality}
                {item.phone ? ` · ${item.phone}` : ''}
              </p>
            </div>
            <span className="management-status">
              {names[item.status]}
              {item.is_demo ? ' · Prueba' : ''}
            </span>
          </div>
          <p>{item.message}</p>
          <ApplicationReview
            applicationId={item.id}
            initial={item.assessment}
          />
          <details>
            <summary>Historial de la solicitud</summary>
            <ul className="management-list">
              {item.history.map((entry, index) => (
                <li key={index}>
                  <div>
                    {names[entry.status]}
                    <small>
                      {formatProfileDate(entry.created_at, {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </small>
                    {entry.note && <p>{entry.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </details>
          {(transitions[item.status]?.length ?? 0) > 0 && (
            <form onSubmit={(event) => update(event, item)}>
              <fieldset className="management-fields" disabled={busy}>
                <legend className="sr-only">
                  Actualizar solicitud de {item.pet_name}
                </legend>
                <FormField label="Siguiente estado">
                  <select
                    name="status"
                    defaultValue={transitions[item.status][0]}
                  >
                    {transitions[item.status].map((status) => (
                      <option key={status} value={status}>
                        {names[status]}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Nota para el historial y la persona solicitante">
                  <textarea name="note" maxLength={3000} required />
                </FormField>
                <button className="btn btn-orange">
                  Guardar cambio de estado
                </button>
              </fieldset>
            </form>
          )}
        </article>
      ))}
      <div className="admin-pagination">
        <button
          className="btn btn-outline btn-small"
          disabled={page <= 1 || busy}
          onClick={() => setPage((value) => value - 1)}
        >
          Anterior
        </button>
        <span>
          {page} / {Math.max(1, pages)}
        </span>
        <button
          className="btn btn-outline btn-small"
          disabled={page >= pages || busy}
          onClick={() => setPage((value) => value + 1)}
        >
          Siguiente
        </button>
      </div>
    </section>
  );
}
