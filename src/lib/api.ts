import { atom } from 'nanostores';
import { readNDJSON } from './ndjson';
import { ApiError } from './api-error';
export { ApiError } from './api-error';

export interface User {
  id: string;
  email: string;
  display_name: string;
  name?: string;
  role: 'adopter' | 'responsible' | 'admin';
  organization_ids?: string[];
  organization_id?: string | null;
  is_demo?: boolean;
}
export interface Session {
  authenticated: boolean;
  user: User | null;
  csrf_token: string;
}
export const $session = atom<Session | null>(null);
export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  validate?: (value: unknown) => boolean;
  onEvent?: (event: unknown) => void;
}
let sessionRequest: Promise<Session> | null = null;
export const setSession = (session: Session | null) => $session.set(session);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
export async function api<T>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://'))
    throw new Error('La ruta de API debe ser relativa.');
  const { body, validate, onEvent, ...init } = options;
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (body !== undefined && !(body instanceof FormData))
    headers.set('Content-Type', 'application/json');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(method) &&
    path !== '/auth/session'
  ) {
    const session = $session.get() ?? (await getSession());
    headers.set('X-CSRF-Token', session.csrf_token);
  }
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error;
    throw new ApiError(
      0,
      'network_error',
      'No pudimos conectar. Revisá tu conexión e intentá nuevamente.',
    );
  }
  if (response.status === 204) return undefined as T;
  let value: unknown;
  try {
    value =
      response.ok &&
      response.body &&
      response.headers.get('content-type')?.includes('application/x-ndjson')
        ? await readNDJSON(response.body, onEvent)
        : await response.json();
  } catch (error) {
    if (
      error instanceof ApiError ||
      (error instanceof DOMException && error.name === 'AbortError')
    )
      throw error;
    throw new ApiError(
      response.status,
      'invalid_response',
      'El servicio devolvió una respuesta inesperada.',
    );
  }
  if (!response.ok) {
    const detail = record(value) ? value.detail : undefined;
    const nested = record(detail)
      ? detail
      : record(value) && record(value.error)
        ? value.error
        : null;
    const message =
      typeof detail === 'string'
        ? detail
        : nested && typeof nested.message === 'string'
          ? nested.message
          : response.status === 401
            ? 'Ingresá a tu cuenta para continuar.'
            : response.status === 403
              ? 'No tenés permiso para realizar esta acción.'
              : response.status === 429
                ? 'Hay muchas solicitudes. Esperá un momento y volvé a intentar.'
                : 'No pudimos completar la operación. Revisá los datos e intentá nuevamente.';
    throw new ApiError(
      response.status,
      nested && typeof nested.code === 'string'
        ? nested.code
        : `http_${response.status}`,
      message,
    );
  }
  if (validate && !validate(value))
    throw new ApiError(
      502,
      'invalid_contract',
      'Los datos del servicio no tienen el formato esperado.',
    );
  return value as T;
}
export const apiRequest = api;
export async function getSession(refresh = false): Promise<Session> {
  if (!refresh && $session.get()) return $session.get()!;
  if (sessionRequest) return sessionRequest;
  sessionRequest = api<Session>('/auth/session', {
    validate: (v) =>
      record(v) &&
      typeof v.authenticated === 'boolean' &&
      typeof v.csrf_token === 'string',
  })
    .then((value) => {
      setSession(value);
      return value;
    })
    .finally(() => {
      sessionRequest = null;
    });
  return sessionRequest;
}
export async function login(email: string, password: string) {
  await api('/auth/login', { method: 'POST', body: { email, password } });
  return getSession(true);
}
export async function register(
  email: string,
  password: string,
  display_name: string,
) {
  await api('/auth/register', {
    method: 'POST',
    body: { email, password, display_name },
  });
  return getSession(true);
}
export async function logout() {
  await api('/auth/logout', { method: 'POST' });
  setSession(null);
  return getSession(true);
}
// Display actionable product messages, never exception text or diagnostics.
const technicalError =
  /\b(?:bekko|horizon|lance(?:db)?|onnx(?:runtime)?|openvino|sqlite|sqlalchemy|fastapi|astro|react|embeddings?|rerank\w*|bm25|cpu|cuda|traceback|smtp|csrf|json|tokenizer|backend|frontend|pipeline|sql|webp)\b|modelos?|inferencia|indexaci[oó]n|[ií]ndice (?:p[uú]blico|de b[uú]squeda)|pesos|vector(?:es|ial|izaci[oó]n)?/i;
export function errorMessage(error: unknown) {
  const fallback =
    error instanceof ApiError && error.status === 401
      ? 'Ingresá a tu cuenta para continuar.'
      : error instanceof ApiError && error.status === 403
        ? 'No pudimos autorizar esta acción. Recargá la página e intentá nuevamente.'
        : error instanceof ApiError && error.status === 429
          ? 'Hay muchas solicitudes. Esperá un momento y volvé a intentar.'
          : 'No pudimos completar la operación. Volvé a intentar en unos minutos.';
  if (
    !(error instanceof ApiError) ||
    error.status >= 500 ||
    technicalError.test(error.message)
  )
    return fallback;
  return error.message || fallback;
}
