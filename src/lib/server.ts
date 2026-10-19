import { validPet, validPetPage, type Pet, type PetPage } from '../types/pet';
import { ApiError } from './api';
export const backendOrigin = () => {
  const value = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8010';
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error('BACKEND_INTERNAL_URL debe ser un origen HTTP sin ruta.');
  return url.origin;
};
export async function serverApi<T>(
  path: string,
  validate?: (v: unknown) => boolean,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${backendOrigin()}/api/v1${path}`, {
      signal: AbortSignal.timeout(7000),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      503,
      'service_unavailable',
      'El catálogo está temporalmente fuera de servicio. Volvé a intentar en unos minutos.',
    );
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      `http_${response.status}`,
      response.status === 404
        ? 'No encontramos este perfil publicado.'
        : 'No pudimos consultar el catálogo.',
    );
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ApiError(
      502,
      'invalid_response',
      'El servicio devolvió una respuesta inesperada.',
    );
  }
  if (validate && !validate(value))
    throw new ApiError(
      502,
      'invalid_contract',
      'El servicio devolvió datos incompletos.',
    );
  return value as T;
}
export const serverPets = (query = '') =>
  serverApi<PetPage>(`/pets${query ? `?${query}` : ''}`, validPetPage);
export const serverPet = (id: string) =>
  serverApi<Pet>(`/pets/${encodeURIComponent(id)}`, validPet);
