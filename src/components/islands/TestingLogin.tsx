import { useEffect, useState } from 'react';
import { api, errorMessage, getSession, type Session } from '../../lib/api';
import { useSession } from '../../features/auth/store';
import '../../styles/testing.css';

type TestUser = {
  id: string;
  display_name: string;
  role: 'adopter' | 'responsible' | 'admin';
  description: string;
};

export default function TestingLogin({
  disabled = false,
  onAvailability,
}: {
  disabled?: boolean;
  onAvailability?: (enabled: boolean) => void;
}) {
  const session = useSession();
  const [users, setUsers] = useState<TestUser[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void api<{ enabled: boolean; items: TestUser[] }>('/auth/demo-users', {
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return;
        setEnabled(data.enabled);
        setUsers(data.items);
        onAvailability?.(data.enabled && data.items.length > 0);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [onAvailability]);

  async function choose(userId: string) {
    if (!userId) return;
    setBusy(true);
    setError('');
    try {
      await api<Session>('/auth/demo-login', {
        method: 'POST',
        body: { user_id: userId },
      });
      await getSession(true);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled || session?.authenticated) return null;
  return (
    <section
      className="testing-login"
      aria-label="Acceso de prueba"
      aria-busy={busy}
    >
      <span className="testing-badge">Laboratorio de pruebas</span>
      <label className="form-field">
        <span>Entrar como usuario de prueba</span>
        <select
          value=""
          disabled={disabled || busy}
          onChange={(event) => void choose(event.target.value)}
        >
          <option value="" disabled>
            Elegí un nombre · sin contraseña
          </option>
          {(
            [
              ['adopter', 'Hogares y preferencias'],
              ['responsible', 'Responsables de asociaciones'],
              ['admin', 'Administración'],
            ] as const
          ).map(([role, label]) => (
            <optgroup key={role} label={label}>
              {users
                .filter((user) => user.role === role)
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.display_name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="testing-description" role="status">
        {busy
          ? 'Iniciando sesión…'
          : 'Personas, hogares y asociaciones ficticias. Seleccioná un nombre para comenzar.'}
      </p>
      {error && (
        <p className="api-notice" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
