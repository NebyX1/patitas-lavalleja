import { useEffect, useState } from 'react';
import { navigate } from 'astro:transitions/client';
import { errorMessage, getSession, logout } from '../../lib/api';
import { useSession } from '../../features/auth/store';
import {
  consumePasswordResetToken,
  loginHref,
} from '../../features/auth/navigation';
import ProfileDashboard from '../profile/ProfileDashboard';

export default function AccountPanel() {
  const session = useSession();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Keep recovery links issued before the dedicated login page working.
    const token = consumePasswordResetToken();
    if (token) {
      void navigate(`/login/#reset_token=${encodeURIComponent(token)}`, {
        history: 'replace',
      });
      return;
    }
    setReady(true);
    void getSession().catch((reason) => setError(errorMessage(reason)));
  }, []);

  useEffect(() => {
    if (ready && session && !session.authenticated && !busy)
      void navigate(loginHref('/cuenta/'), { history: 'replace' });
  }, [ready, session?.authenticated, busy]);

  async function signOut() {
    setBusy(true);
    setError('');
    try {
      await logout();
      await navigate('/login/', { history: 'replace' });
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !session?.authenticated || !session.user)
    return (
      <div className="management-panel">
        <p role={error ? 'alert' : 'status'}>
          {error || 'Comprobando tu sesión…'}
        </p>
        {error && (
          <a className="btn btn-outline" href={loginHref('/cuenta/')}>
            Iniciar sesión
          </a>
        )}
      </div>
    );

  return (
    <div className="account-panel profile-account">
      {error && (
        <p className="api-notice" role="alert">
          {error}
        </p>
      )}
      <ProfileDashboard
        key={session.user.id}
        user={session.user}
        onLogout={() => void signOut()}
        busy={busy}
      />
    </div>
  );
}
