import type { APIRoute } from 'astro';
import { serverPets } from '../lib/server';
import { site, petUrl } from '../config/site';
export const prerender = false;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;',
      })[char]!,
  );
export const GET: APIRoute = async () => {
  try {
    const urls: string[] = [];
    let page = 1;
    let pages = 1;
    do {
      const data = await serverPets(
        `page=${page}&page_size=48&availability=all`,
      );
      for (const pet of data.items)
        if (!pet.is_demo && pet.publication_status === 'published')
          urls.push(
            `<url><loc>${escape(`${site.url}${petUrl(pet.id)}`)}</loc></url>`,
          );
      pages = data.pages;
      page++;
    } while (page <= pages && page <= 1000);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
      {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=60',
        },
      },
    );
  } catch {
    return new Response('El catálogo está temporalmente fuera de servicio.', {
      status: 503,
      headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' },
    });
  }
};
