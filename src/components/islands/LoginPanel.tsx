import { useEffect, useState, type SyntheticEvent } from 'react';
import { navigate } from 'astro:transitions/client';
import { api, errorMessage, getSession, login, register } from '../../lib/api';
import { useSession } from '../../features/auth/store';
import FormField from '../forms/FormField';
import Icon from '../ui/Icon';
import TestingLogin from './TestingLogin';
import {
  consumePasswordResetToken,
  safeReturnPath,
} from '../../features/auth/navigation';
import '../../styles/profile-account.css';

type Mode = 'login' | 'register' | 'recover' | 'reset';
export default function LoginPanel() {
  const session = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [testingEnabled, setTestingEnabled] = useState(false);
  const [passwordAccess, setPasswordAccess] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void getSession().catch((reason) => setError(errorMessage(reason)));
    const token = consumePasswordResetToken();
    if (token) {
      setResetToken(token);
      setMode('reset');
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready && session?.authenticated && mode !== 'reset')
      void navigate(
        safeReturnPath(new URL(location.href).searchParams.get('next')),
        {
          history: 'replace',
        },
      );
  }, [ready, session?.authenticated, mode]);
  useEffect(() => {
    setError('');
    setMessage('');
  }, [session?.user?.id]);
  function changeMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
  }
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const email = String(data.get('email') ?? ''),
        password = String(data.get('password') ?? '');
      if (mode === 'register') {
        await register(email, password, String(data.get('display_name')));
        setMessage('Tu cuenta está creada. Ya podés darle forma a tu perfil.');
      } else if (mode === 'login') await login(email, password);
      else if (mode === 'recover') {
        await api('/auth/password-reset/request', {
          method: 'POST',
          body: { email },
        });
        setMessage(
          'Si ese correo tiene una cuenta, recibirá un enlace para recuperar el acceso.',
        );
      } else {
        await api('/auth/password-reset/confirm', {
          method: 'POST',
          body: { token: resetToken, password },
        });
        await getSession(true);
        setResetToken('');
        setMode('login');
        setMessage(
          'Actualizamos tu contraseña y cerramos las sesiones anteriores. Ya podés ingresar.',
        );
      }
      form.reset();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  if (!ready || !session || (session.authenticated && mode !== 'reset'))
    return (
      <div className="management-panel">
        <p role={error ? 'alert' : 'status'}>
          {error || 'Comprobando tu sesión…'}
        </p>
        {error && (
          <button className="btn btn-outline" onClick={() => location.reload()}>
            Reintentar
          </button>
        )}
      </div>
    );
  return (
    <div className="account-access">
      <header className="account-access-heading">
        <span className="eyebrow">
          <span className="dot" />
          Iniciá una nueva historia
        </span>
        <h1>
          Tu cuenta.
          <br />
          Tu próxima historia.
        </h1>
        <p>
          Un espacio para presentarte, descubrir afinidades y acompañar cada
          encuentro.
        </p>
      </header>
      <div
        className="management-panel account-panel account-access-panel"
        aria-busy={busy}
      >
        {mode === 'login' && (
          <TestingLogin disabled={busy} onAvailability={setTestingEnabled} />
        )}
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
        {testingEnabled && !passwordAccess && mode === 'login' ? (
          <button className="text-link" onClick={() => setPasswordAccess(true)}>
            Usar correo y contraseña
          </button>
        ) : (
          <>
            <div
              className="management-tabs"
              role="group"
              aria-label="Acceso a tu cuenta"
            >
              <button
                className={`species-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => changeMode('login')}
                aria-pressed={mode === 'login'}
              >
                Ingresar
              </button>
              <button
                className={`species-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => changeMode('register')}
                aria-pressed={mode === 'register'}
              >
                Crear mi cuenta
              </button>
            </div>
            <form onSubmit={submit} className="account-form">
              <h2>
                {mode === 'register'
                  ? 'Un lugar para encontrarse.'
                  : mode === 'recover'
                    ? 'Recuperá tu acceso.'
                    : mode === 'reset'
                      ? 'Elegí una nueva contraseña.'
                      : 'Qué bueno volver a verte.'}
              </h2>
              <fieldset disabled={busy} className="management-fields">
                <legend className="sr-only">
                  {mode === 'register'
                    ? 'Datos de registro'
                    : 'Datos de acceso'}
                </legend>
                {mode === 'register' && (
                  <FormField label="Tu nombre o alias">
                    <input
                      name="display_name"
                      required
                      maxLength={80}
                      autoComplete="nickname"
                    />
                  </FormField>
                )}
                {mode !== 'reset' && (
                  <FormField label="Correo electrónico">
                    <input
                      name="email"
                      type="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                    />
                  </FormField>
                )}
                {mode !== 'recover' && (
                  <FormField
                    label={
                      mode === 'login'
                        ? 'Contraseña'
                        : 'Contraseña de al menos 12 caracteres'
                    }
                  >
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={mode === 'login' ? 1 : 12}
                      maxLength={256}
                      autoComplete={
                        mode === 'login' ? 'current-password' : 'new-password'
                      }
                    />
                  </FormField>
                )}
                {mode === 'reset' && !resetToken && (
                  <p role="alert">
                    Abrí el enlace del correo para elegir una nueva contraseña.
                  </p>
                )}
                {mode === 'register' && (
                  <label className="form-checkbox">
                    <input type="checkbox" required />
                    <span>
                      Leí la <a href="/privacidad/">política de privacidad</a> y
                      quiero crear mi cuenta.
                    </span>
                  </label>
                )}
                <button
                  className="btn btn-orange"
                  disabled={mode === 'reset' && !resetToken}
                  type="submit"
                >
                  {busy
                    ? 'Un momento…'
                    : mode === 'register'
                      ? 'Crear mi cuenta'
                      : mode === 'recover'
                        ? 'Solicitar enlace'
                        : mode === 'reset'
                          ? 'Guardar contraseña'
                          : 'Ingresar'}{' '}
                  <Icon name="arrow-up" />
                </button>
              </fieldset>
            </form>
            {mode === 'login' && (
              <button
                className="text-link"
                onClick={() => changeMode('recover')}
              >
                Olvidé mi contraseña
              </button>
            )}
            <p className="management-footnote">
              Podés explorar el catálogo sin crear una cuenta. La búsqueda
              inteligente y el análisis de compatibilidad requieren iniciar
              sesión.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
