import { useEffect, useState } from 'react';
import { useSession } from '../../features/auth/store';
import { errorMessage, getSession } from '../../lib/api';
import PetsPanel from '../admin/PetsPanel';
import OrganizationsPanel from '../admin/OrganizationsPanel';
import ApplicationsPanel from '../admin/ApplicationsPanel';
import AccountsPanel from '../admin/AccountsPanel';
import AuditPanel from '../admin/AuditPanel';
import SystemPanel from '../admin/SystemPanel';
export default function AdminPanel() {
  const session = useSession();
  const [tab, setTab] = useState('pets');
  const [error, setError] = useState('');
  useEffect(() => {
    if (location.hash === '#solicitudes') setTab('applications');
    void getSession().catch((reason) => setError(errorMessage(reason)));
  }, []);
  if (!session)
    return (
      <div className="management-panel">
        <p role={error ? 'alert' : 'status'}>
          {error || 'Buscando tu sesión…'}
        </p>
        <a className="btn btn-outline" href="/cuenta/">
          Ir a mi cuenta
        </a>
      </div>
    );
  if (!session.authenticated)
    return (
      <div className="management-panel">
        <h2>Un espacio para cuidar cada historia.</h2>
        <p>
          Ingresá con tu cuenta responsable o administradora para gestionar las
          fichas.
        </p>
        <a className="btn btn-orange" href="/login/?next=%2Fadmin%2F">
          Ingresar a mi cuenta
        </a>
      </div>
    );
  const isAdmin = session.user?.role === 'admin';
  if (!isAdmin && session.user?.role !== 'responsible')
    return (
      <div className="management-panel">
        <h2>Tu cuenta de adoptante</h2>
        <p>
          Para publicar o gestionar animales, el equipo debe asignarte a una
          organización responsable.
        </p>
        <a className="btn btn-outline" href="/cuenta/">
          Volver a mi cuenta
        </a>
      </div>
    );
  const tabs = [
    ['pets', 'Mascotas'],
    ['applications', 'Solicitudes'],
    ...(isAdmin
      ? [
          ['organizations', 'Organizaciones'],
          ['accounts', 'Cuentas'],
          ['audit', 'Auditoría'],
          ['system', 'Sistema'],
        ]
      : []),
  ];
  return (
    <div className="management-panel">
      <div className="management-title-row">
        <div>
          <span className="eyebrow">
            {isAdmin ? 'Administración' : 'Gestión de tu organización'}
          </span>
          <h2>Detrás de cada encuentro.</h2>
        </div>
        <a className="btn btn-outline" href="/cuenta/">
          Mi cuenta
        </a>
      </div>
      <div
        className="management-tabs"
        role="group"
        aria-label="Secciones de gestión"
      >
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={`species-tab ${tab === key ? 'active' : ''}`}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'pets' && <PetsPanel isAdmin={isAdmin} />}{' '}
      {tab === 'applications' && <ApplicationsPanel />}
      {tab === 'organizations' && isAdmin && <OrganizationsPanel />}
      {tab === 'accounts' && isAdmin && <AccountsPanel />}
      {tab === 'audit' && isAdmin && <AuditPanel />}
      {tab === 'system' && isAdmin && <SystemPanel />}
    </div>
  );
}
