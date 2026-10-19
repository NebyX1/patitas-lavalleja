import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { formatProfileDate } from '../../features/auth/profile';
interface ComponentState {
  enabled: boolean;
  ready: boolean;
  state: string;
  error?: string | null;
}
interface AIState {
  models: Record<string, ComponentState>;
  index: Record<string, unknown>;
  cpu_only: boolean;
}
interface IndexState {
  events: Record<string, number>;
  jobs: {
    id: string;
    kind: string;
    status: string;
    error: string;
    updated_at: string;
  }[];
}
const stateNames: Record<string, string> = {
  ready: 'Disponible',
  disabled: 'No disponible',
  not_loaded: 'Disponible al iniciar una búsqueda',
  error: 'Temporalmente indisponible',
  queued: 'En cola',
  running: 'En curso',
  completed: 'Completada',
  failed: 'No se completó',
  pending: 'Pendientes',
  processing: 'En curso',
  processed: 'Actualizadas',
};
const searchFunctions = [
  ['bekko', 'Comprensión de preferencias'],
  ['horizon', 'Evaluación de afinidades'],
] as const;
export default function SystemPanel() {
  const [models, setModels] = useState<AIState | null>(null);
  const [index, setIndex] = useState<IndexState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function load(signal?: AbortSignal) {
    const [ai, events] = await Promise.all([
      api<AIState>('/system/ai', { signal }),
      api<IndexState>('/system/index', { signal }),
    ]);
    if (!signal?.aborted) {
      setModels(ai);
      setIndex(events);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((reason) => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    });
    return () => controller.abort();
  }, []);
  async function refresh() {
    setBusy(true);
    setError('');
    try {
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function rebuild() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api('/system/index/rebuild', { method: 'POST' });
      setMessage(
        'Actualización de búsqueda solicitada. Actualizá el estado para seguir su avance.',
      );
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2>Estado de Patitas Intelligence</h2>
      <p>
        Revisá la disponibilidad de la búsqueda inteligente y la actualización
        de las fichas. El catálogo sigue disponible si una búsqueda necesita
        otro intento.
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
      <dl className="management-facts">
        {models &&
          searchFunctions.map(([key, label]) => {
            const component = models.models[key];
            if (!component) return null;
            return (
              <div className="management-card" key={key}>
                <dt>{label}</dt>
                <dd>
                  {stateNames[component.state] ?? 'Estado por confirmar'}
                  {component.error && (
                    <p>
                      Esta función necesita atención. Volvé a consultar su
                      estado más tarde.
                    </p>
                  )}
                </dd>
              </div>
            );
          })}
      </dl>
      <h3>Sincronización de fichas</h3>
      <dl className="management-facts">
        {index &&
          Object.entries(index.events).map(([key, value]) => (
            <div key={key}>
              <dt>{stateNames[key] ?? 'Por revisar'}</dt>
              <dd>
                {value} {value === 1 ? 'actualización' : 'actualizaciones'}
              </dd>
            </div>
          ))}
      </dl>
      <div className="admin-actions">
        <button className="btn btn-outline" onClick={refresh} disabled={busy}>
          Actualizar estado
        </button>
        <button
          className="btn btn-dark"
          onClick={rebuild}
          disabled={
            busy ||
            index?.jobs.some((job) =>
              ['queued', 'running'].includes(job.status),
            )
          }
        >
          Actualizar fichas de búsqueda
        </button>
      </div>
      <ul className="management-list">
        {index?.jobs.map((job) => (
          <li key={job.id}>
            <div>
              {stateNames[job.status] ?? 'Estado por confirmar'}
              <small>
                {formatProfileDate(job.updated_at, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}
              </small>
              {job.error && (
                <p>
                  La actualización no pudo completarse. Revisá su estado antes
                  de volver a intentarlo.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="management-footnote">
        La disponibilidad de las mascotas se confirma con la información
        actualizada de cada ficha.
      </p>
    </section>
  );
}
