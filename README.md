# Patitas Lavalleja

Portal estático de adopción responsable, construido a partir de `Patitas_Lavalleja_Boceto_Interactivo.html`. Conserva su identidad editorial y sus flujos, con un modo nocturno neón, navegación con View Transitions e islas React.

Arquitectura inspirada en [Semana de Lavalleja](https://github.com/IntendenciaDeLavalleja/semana-de-lavalleja): Astro estático, React, TypeScript, Tailwind CSS, Nano Stores, layout central y separación entre componentes, datos y funcionalidades.

## Desarrollo

Node.js **22.22.3 o posterior** y npm.

```sh
npm ci
npm run dev
```

La web local abre en `http://localhost:4321`.

```sh
npm run check
npm run test
npm run build
npm run test:e2e
npm run verify
```

Las pruebas E2E usan Chrome instalado. Si tu entorno no tiene Chrome, ejecutá `npx playwright install chrome`, o cambiá `channel: 'chrome'` por el navegador Chromium de Playwright en `playwright.config.ts` y ejecutá `npx playwright install chromium`.

## Arquitectura

- `src/layouts/BaseLayout.astro`: documento, navegación, footer, ClientRouter, estilos y SEO.
- `src/components/layout`: marca, navbar, footer e inicialización temprana del tema.
- `src/components/sections`: hero, catálogo, afinidad, proceso, historias, colaboración y FAQ.
- `src/components/cards`: tarjetas de mascotas, pasos y formas de ayudar.
- `src/components/islands`: filtros, favoritos, carruseles, cuestionario, pestañas, formularios, tema y movimiento.
- `src/features`: selectores del catálogo, reglas de afinidad, preferencias persistentes y ciclo de vida de navegación.
- `src/data`: perfiles tipados, preguntas frecuentes, historias y procedencia de fotos.
- `src/styles`: estilos por área, ajustes de aplicación y tema nocturno. `desktop.css` amplía tipografía, controles y espacios desde 1061 px; desde 1600 px escala la composición del boceto con un ancho máximo de 1650 px.
- `src/pages`: rutas estáticas, fichas individuales, `robots.txt` y `llms.txt`.

Las páginas se generan como HTML durante el build. React se hidrata solo en las islas interactivas. El catálogo, las fichas y los contenidos editoriales son legibles sin JavaScript. El [ClientRouter de Astro](https://docs.astro.build/en/guides/view-transitions/) proporciona navegación entre archivos estáticos con transiciones y una animación compartida de la foto al abrir una ficha.

## Contenido y estado

Editar `src/data/pets.ts` para mantener perfiles. Las ocho fichas originales son **ficticias**, y todas las fotos son ilustrativas. El sitio lo informa en catálogo, fichas, FAQ, formularios, metadatos y `llms.txt`.

Los favoritos conservan la clave `patitas-favorites-v1` del boceto. Los identificadores se validan antes de utilizarlos. Tema y movimiento también se guardan localmente. El estado de filtros se comparte durante la navegación, y se reinicia al recargar. Si localStorage no está disponible, el sitio funciona con estado en memoria.

Los formularios conservan el alcance de demostración del original: validación en el navegador, vista previa local de publicación y confirmación de prueba. **No envían datos, no reservan animales y no publican fichas.** Para lanzar un servicio de adopciones real, conectar un receptor autorizado, revisión de fichas y contenido validado; actualizar la información de privacidad y las indicaciones de demostración al implementar esas conexiones.

Las respuestas del cuestionario solo viven en memoria. La afinidad usa reglas claras de especie, energía y prioridad; no promete compatibilidad.

## Imágenes y fuentes

Las fotografías de Unsplash se alojan localmente en WebP (480 y 960 píxeles). Los créditos y URLs originales están en `src/data/photo-sources.json`. DM Sans y Manrope se sirven desde paquetes Fontsource. No se necesitan solicitudes a Google Fonts ni Unsplash al navegar.

`node scripts/prepare-assets.mjs` regenera imágenes e identidad social desde las fuentes originales; requiere Internet. No es necesario para ejecutar ni compilar el proyecto: los archivos finales están en `public/`.

El HTML original permanece intacto como referencia. `scripts/extract-reference.mjs` documenta la extracción inicial; no debe ejecutarse sobre componentes que ya fueron editados, porque vuelve a generar las secciones extraídas.

## Publicación y SEO

```sh
npm run build
```

Publicar el contenido de `dist/` como archivos estáticos en **https://patitas.lavalleja.uy**. No requiere Node ni servidor de aplicación en producción. Configurar HTTPS, servir `404.html` con estado 404 y resolver `/ruta/` a `/ruta/index.html`.

El sitio incluye canonical por ruta, descripciones, Open Graph con PNG de 1200 × 630, Twitter Cards, datos estructurados WebSite/Organization/WebPage/FAQPage/BreadcrumbList, `robots.txt`, `llms.txt` y sitemap XML. Las páginas de favoritos, solicitudes y publicación se marcan `noindex` y se excluyen del sitemap. Las páginas públicas y fichas de demostración permiten indexación.

La publicación y el rastreo no garantizan indexación inmediata. Una vez activo el dominio, verificarlo en Google Search Console y enviar `https://patitas.lavalleja.uy/sitemap-index.xml`. Ver `docs/deployment.md`.

## Accesibilidad y movimiento

Tema automático según el sistema con selección manual persistente. Navegación por teclado, controles etiquetados, pestañas con flechas/Home/End, diálogo nativo para zoom, favoritos con estado anunciado, contenido visible sin JS y respeto por `prefers-reduced-motion`. También hay un control explícito para pausar movimiento.
