import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://patitas.lavalleja.uy',
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    react(),
    sitemap({
      filter: (page) =>
        !/\/(404|favoritos|publicar|solicitud)(\/|$)/.test(
          new URL(page).pathname,
        ),
    }),
  ],
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  vite: { plugins: [tailwindcss()], build: { cssTarget: 'safari15' } },
});
