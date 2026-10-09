# Despliegue estático

1. Usar Node.js 22.22.3 o posterior para construir: `npm ci && npm run verify`.
2. Publicar `dist/` en el hosting destinado a `patitas.lavalleja.uy`.
3. Configurar DNS y certificado HTTPS para ese dominio.
4. Resolver URLs con barra final a su `index.html`. Una ruta inexistente debe responder HTTP 404 con `404.html`; no redirigir todas las rutas a la home.
5. Comprobar `/robots.txt`, `/llms.txt`, `/sitemap-index.xml`, `/sitemap-0.xml` y una ficha como `/mascotas/milo/`.
6. Verificar el dominio en Search Console y enviar el sitemap. Solicitar indexación de la home cuando sea accesible públicamente. La decisión y el plazo de indexación pertenecen al buscador.

No se ejecuta SSR ni hay endpoints de recepción en producción. Los endpoints `.txt.ts` se generan durante el build y terminan como archivos estáticos.

## Nginx de ejemplo

```nginx
server {
    listen 80;
    server_name patitas.lavalleja.uy;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }

    error_page 404 /404.html;
    location = /404.html { internal; }

    location /_astro/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location ~* \.(webp|png|svg|woff2)$ {
        add_header Cache-Control "public, max-age=86400";
    }
}
```

HTTPS puede terminar en el proxy de la infraestructura. Aplicar compresión gzip/Brotli en el hosting. Servir HTML con una política de revalidación para que nuevos despliegues no conserven enlaces a bundles anteriores.

## Antes de conectar adopciones reales

Sustituir perfiles ficticios por contenido aprobado, agregar el receptor de solicitudes y su flujo de revisión, documentar los responsables y la política de privacidad, y actualizar los textos de demostración de forma coherente. No basta con ocultar esos textos: esta versión no tiene un backend de adopciones.
