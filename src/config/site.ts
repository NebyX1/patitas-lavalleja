import type { Pet } from '../types/pet';
export const site = {
  name: 'Patitas Lavalleja',
  url: 'https://patitas.lavalleja.uy',
  description:
    'Un hogar lo cambia todo. Explorá historias de perros y gatos, conocé la adopción responsable y descubrí cómo ayudar en Lavalleja, Uruguay.',
  image: '/images/social/patitas-og.png',
  locale: 'es-UY',
} as const;

export const navigation = [
  { href: '/adopcion/', label: 'En adopción' },
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/#historias', label: 'Historias' },
  { href: '/#sumate', label: 'Sumate' },
];

export const petUrl = (id: string) => `/mascotas/${id}/`;
export const petPhoto = (id: string, width: 480 | 960 = 960) =>
  `/images/pets/${id}-${width}.webp`;
export const photoFor = (pet: Pet, width: 480 | 960 | 1600 = 960) => {
  const photo = pet.photos?.[0];
  const variant =
    photo?.variants?.[
      width === 480 ? 'card' : width === 1600 ? 'full' : 'detail'
    ] ?? photo?.variants?.[String(width)];
  return (
    photo?.[`url_${width}`] ||
    (typeof variant === 'string' ? variant : variant?.url) ||
    photo?.url ||
    '/images/pet-placeholder.svg'
  );
};
export const adoptionLabel = (pet: Pet) =>
  ({
    available: 'Disponible para conocer',
    under_review: 'En evaluación',
    reserved: 'Encuentro en proceso',
    adopted: 'Ya encontró hogar',
    withdrawn: 'No disponible',
  })[pet.adoption_status ?? 'available'] ?? 'Consultá su estado';
