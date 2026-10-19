import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import node from '@astrojs/node';

export default defineConfig({
  site: 'https://patitas.lavalleja.uy',
  output: 'static',
  adapter: node({ mode: 'standalone' }),
  trailingSlash: 'ignore',
  integrations: [
    react(),
    sitemap({
      serialize(item) {
        const url = new URL(item.url);
        if (
          !url.pathname.split('/').pop()?.includes('.') &&
          !url.pathname.endsWith('/')
        )
          url.pathname += '/';
        return { ...item, url: url.href };
      },
      customSitemaps: ['https://patitas.lavalleja.uy/sitemap-pets.xml'],
      filter: (page) =>
        !/\/(404|favoritos|publicar|solicitud|login|cuenta|admin|health|api)(\/|$)/.test(
          new URL(page).pathname,
        ),
    }),
  ],
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  vite: { plugins: [tailwindcss()], build: { cssTarget: 'safari15' } },
});
