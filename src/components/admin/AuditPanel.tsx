import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import {
  applicationStates,
  formatProfileDate,
} from '../../features/auth/profile';
interface Entry {
  id: number;
  actor_id: string | null;
  action: string;
  resource_id: string;
  created_at: string;
  detail: Record<string, unknown>;
}
const actionLabels: Record<string, string> = {
  'account.demo_login': 'Ingreso con cuenta de prueba',
  'account.registered': 'Cuenta creada',
  'account.login': 'Inicio de sesión',
  'account.logout': 'Cierre de sesión',
  'account.recovery_requested': 'Recuperación de acceso solicitada',
  'account.password_changed': 'Contraseña actualizada',
  'account.permissions_changed': 'Permisos de cuenta actualizados',
  'profile.identity_updated': 'Presentación personal actualizada',
  'profile.updated': 'Perfil de hogar actualizado',
  'profile.deleted': 'Perfil de hogar eliminado',
  'pet.created': 'Ficha creada',
  'pet.updated': 'Ficha actualizada',
  'pet.submitted': 'Ficha enviada para revisión',
  'pet.publication_changed': 'Publicación de ficha actualizada',
  'pet.availability_changed': 'Disponibilidad actualizada',
  'pet.archived': 'Ficha archivada',
  'pet.photo_uploaded': 'Fotografía añadida',
  'pet.photo_deleted': 'Fotografía eliminada',
  'organization.created': 'Organización creada',
  'organization.updated': 'Organización actualizada',
  'organization.member_added': 'Integrante incorporado',
  'organization.member_removed': 'Integrante desvinculado',
  'application.created': 'Solicitud recibida',
  'application.status_changed': 'Estado de solicitud actualizado',
  'application.compatibility_evaluated': 'Compatibilidad evaluada',
  'index.rebuild_requested': 'Actualización de búsqueda solicitada',
};
const statusLabels: Record<string, string> = {
  ...applicationStates,
  draft: 'Borrador',
  pending: 'Pendiente de revisión',
  published: 'Publicada',
  archived: 'Archivada',
  available: 'Disponible para conocer',
  reserved: 'Encuentro en proceso',
  adopted: 'Ya encontró hogar',
  withdrawn: 'No disponible',
};
const decisionLabels: Record<string, string> = {
  favorable: 'Buen encaje inicial',
  incompatible: 'Incompatibilidades observadas',
  review_required: 'Hay aspectos por conversar',
  insufficient_information: 'Falta información del hogar',
};
const roleLabels: Record<string, string> = {
  adopter: 'Adoptante',
  responsible: 'Responsable',
  admin: 'Administración',
};
// Present known management facts only; diagnostics and new internal fields
// must not become UI copy just because they are added to the audit payload.
function entryDetails(detail: Entry['detail']) {
  return [
    typeof detail.status === 'string' ? statusLabels[detail.status] : undefined,
    typeof detail.decision === 'string'
      ? decisionLabels[detail.decision]
      : undefined,
    typeof detail.role === 'string' ? roleLabels[detail.role] : undefined,
    typeof detail.active === 'boolean'
      ? detail.active
        ? 'Cuenta activa'
        : 'Cuenta desactivada'
      : undefined,
    typeof detail.note === 'string' ? detail.note : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
export default function AuditPanel() {
  const [items, setItems] = useState<Entry[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<{ items: Entry[]; pages: number }>(`/admin/audit?page=${page}`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) {
          setItems(data.items);
          setPages(data.pages);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      });
    return () => controller.abort();
  }, [page]);
  return (
    <section>
      <h2>Historial de gestión</h2>
      <p>Registro de operaciones sensibles y recursos afectados.</p>
      {error && (
        <p role="alert" className="management-message is-error">
          {error}
        </p>
      )}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Operación</th>
              <th>Responsable</th>
              <th>Recurso</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  {formatProfileDate(item.created_at, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </td>
                <td>
                  {actionLabels[item.action] ??
                    'Actividad de gestión registrada'}
                  {entryDetails(item.detail) && (
                    <small>{entryDetails(item.detail)}</small>
                  )}
                </td>
                <td>{item.actor_id ?? 'Sistema'}</td>
                <td>{item.resource_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
    </section>
  );
}
