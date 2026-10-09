import fs from 'node:fs/promises';
import sharp from 'sharp';
const sources = JSON.parse(
  await fs.readFile('src/data/photo-sources.json', 'utf8'),
);
await fs.mkdir('public/images/pets', { recursive: true });
await fs.mkdir('public/images/social', { recursive: true });
for (const [id, source] of Object.entries(sources)) {
  const url = new URL(source);
  url.searchParams.set('w', '1200');
  url.searchParams.set('q', '85');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Photo ${id}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await Promise.all(
    [480, 960].map((width) =>
      sharp(buffer)
        .resize(width, width, { fit: 'cover', position: 'attention' })
        .webp({ quality: 82 })
        .toFile(`public/images/pets/${id}-${width}.webp`),
    ),
  );
  console.log(`Prepared ${id}`);
}
await sharp('public/favicon.svg')
  .resize(180, 180)
  .png()
  .toFile('public/apple-touch-icon.png');
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#101218"/><circle cx="1040" cy="220" r="250" fill="#29203c"/><circle cx="1040" cy="220" r="205" fill="none" stroke="#c2ff62" stroke-opacity=".3"/><circle cx="1040" cy="220" r="175" fill="none" stroke="#c2ff62" stroke-opacity=".2" stroke-dasharray="8 12"/><g font-family="Arial,sans-serif"><text x="70" y="100" font-size="18" font-weight="700" fill="#c2ff62" letter-spacing="4">LAVALLEJA, URUGUAY</text><text x="65" y="295" font-size="150" font-weight="800" fill="#f0f4e9" letter-spacing="-9">patitas.</text><text x="75" y="400" font-size="47" font-weight="700" fill="#c2ff62">Un hogar lo cambia todo.</text><text x="75" y="475" font-size="25" fill="#afb9bd">Pequeñas patitas. Grandes comienzos.</text><text x="75" y="575" font-size="21" fill="#afb9bd">patitas.lavalleja.uy</text></g><g fill="#c2ff62" transform="translate(895 240) scale(5)"><path d="M9.2 21.2c1.5-1.8 2.4-5.5 6.8-5.5s5.3 3.7 6.8 5.5c2.8 3.5.7 7.1-2.7 6.4-2.4-.6-3.1-1.1-4.1-1.1s-1.7.5-4.1 1.1c-3.4.7-5.5-2.9-2.7-6.4Z"/><ellipse cx="7" cy="13" rx="3" ry="4.2"/><ellipse cx="13" cy="7.6" rx="3.1" ry="4.2"/><ellipse cx="20.5" cy="8.1" rx="3.1" ry="4.2"/><ellipse cx="26" cy="14" rx="2.8" ry="4"/></g></svg>`;
await sharp(Buffer.from(og))
  .png()
  .toFile('public/images/social/patitas-og.png');
console.log('Prepared social preview and touch icon.');
