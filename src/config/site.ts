export const site = {
  name: 'Patitas Lavalleja',
  url: 'https://patitas.lavalleja.uy',
  description:
    'Un hogar lo cambia todo. Explorá historias de perros y gatos, conocé la adopción responsable y descubrí cómo ayudar en Lavalleja, Uruguay.',
  image: '/images/social/patitas-og.png',
  locale: 'es-UY',
  demo: true,
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
