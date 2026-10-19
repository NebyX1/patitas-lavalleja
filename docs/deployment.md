# Despliegue y operación

## Servicios

El portal necesita runtime Node para Astro y Python/FastAPI. Las páginas editoriales se prerenderizan; catálogo, fichas, solicitudes, proxy y sitemap de mascotas consultan datos actuales. Publicar solo archivos estáticos ya no alcanza.

| Servicio | Puerto interno | Salud                                         |
| -------- | -------------: | --------------------------------------------- |
| frontend |           4321 | `/health`                                     |
| backend  |           8000 | `/api/v1/health/live`, `/api/v1/health/ready` |

Compose resuelve `http://backend:8000` por el nombre real de servicio. El navegador usa `/api/v1` en el dominio público. Sin Docker, los puertos locales son 8010 y 4321.

| Volumen  | Ruta           | Contenido                     |
| -------- | -------------- | ----------------------------- |
| database | `/data/db`     | Una SQLite, WAL y lock        |
| media    | `/data/media`  | WebP card/detail/full         |
| lance    | `/data/lance`  | Índice reconstruible          |
| models   | `/data/models` | Modelos y manifiestos fijados |

Backend UID/GID 10001 y frontend usuario `node`; los volúmenes deben permitir escritura al UID correspondiente. No montar el repositorio como datos. Una instancia/worker de backend contra la misma SQLite/LanceDB; el lock impide réplicas competidoras.

## Preparación Docker

Copiar `.env.example` a `.env` y completar los valores. Generar una clave aleatoria con `python -c "import secrets; print(secrets.token_hex(32))"`; guardarla como secreto, sin versionar.

```sh
docker compose build
docker compose run --rm backend python scripts/prepare_models.py --model-dir /data/models --onnx-fallback
docker compose run --rm backend python -m app.cli create-admin --email TU_CORREO --name "Tu nombre"
docker compose up -d
docker compose ps
```

El entrypoint migra antes de iniciar Uvicorn; no crea cuentas ni carga animales ficticios automáticamente. El preparador descarga solo artefactos auditados/tokenizers/configuración, verifica SHA-256 y persiste manifiestos. No hay descargas en peticiones HTTP. La opción ONNX prepara el mismo Bekko para hardware incompatible con OpenVINO/AVX2. Volver a medir las instrucciones visibles dentro de la VM final.

Para HTTP local:

```sh
docker compose -f compose.yaml -f compose.development.yaml up --build -d
```

El override cambia origen/cookies a desarrollo y expone API en `127.0.0.1:8010`. Seed/reset solo se permiten en ese entorno. El seed completo de fotografías originales requiere acceso de lectura a `public/images` del frontend; el entorno local ya las copia a media. Las imágenes reales se cargan por UI y persisten sin el código fuente.

## Configuración

| Variables                                                        | Uso                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `ENVIRONMENT`                                                    | `production` prohíbe seed/reset ficticio                                           |
| `SECRET_KEY`                                                     | Secreto persistente de 32+ caracteres                                              |
| `PUBLIC_SITE_URL`, `CORS_ORIGINS`                                | Dominio HTTPS y orígenes explícitos autorizados                                    |
| `COOKIE_SECURE`, `COOKIE_SAMESITE`                               | `true` y `lax` en producción                                                       |
| `BACKEND_INTERNAL_URL`                                           | Frontend: `http://backend:8000`, sin sufijo `/api`                                 |
| `PUBLIC_DATA_CONTROLLER_NAME`, `PUBLIC_PRIVACY_CONTACT`          | Identificación y contacto públicos de privacidad; argumentos de build del frontend |
| `DATABASE_URL`                                                   | `sqlite:////data/db/patitas.sqlite3`                                               |
| `MEDIA_DIR`, `LANCEDB_PATH`, `MODEL_CACHE_DIR`                   | Las rutas de volúmenes anteriores                                                  |
| `AI_ENABLED`, `RERANK_ENABLED`                                   | Activar modelos preparados; desactivarlos conserva reglas/texto                    |
| `EMBEDDING_BACKEND`                                              | `openvino` preferido u `onnx` del mismo Bekko                                      |
| `EMBEDDING_MODEL_ID/REVISION`, `RERANK_MODEL_ID/REVISION`        | Fijados en configuración a los artefactos auditados                                |
| `AI_THREADS`, `AI_MAX_CONCURRENT`, `RERANK_POOL_SIZE`            | Inicialmente 2, 1 y 12                                                             |
| `MODEL_LOAD_TIMEOUT`, `INDEX_POLL_SECONDS`                       | 120 y 10 segundos                                                                  |
| `MEDIA_MAX_INPUT_BYTES`, `MEDIA_MAX_PIXELS`, `MEDIA_QUOTA_BYTES` | 12 MiB, 24 MP y 512 MiB iniciales                                                  |
| `SMTP_HOST/PORT/USERNAME/PASSWORD/SENDER/STARTTLS`               | Recuperación con transporte autorizado                                             |
| `PROXY_TRUSTED_IPS`                                              | Solo direcciones/rango de proxies propios                                          |

El frontend no recibe SMTP ni clave de sesión. Conservar la clave al redeplegar; su rotación invalida sesiones. No copiar `.env` a imágenes. Las plantillas no contienen contraseñas.

## Coolify

Crear un recurso Compose desde este repositorio usando `compose.yaml`. Configurar secretos y los cuatro volúmenes; asociar `https://patitas.lavalleja.uy` a `frontend`, puerto 4321, con TLS en Coolify. El backend no necesita dominio público separado. Preparar modelos y crear administrador antes de publicar contenido.

Para recursos desplegados por separado, conectarlos a una misma red privada y asignar a la API el alias `backend`, o usar su nombre real verificable en `BACKEND_INTERNAL_URL`. `localhost` identifica el mismo contenedor; no comunica ambos servicios. El ejemplo Compose ya garantiza nombre y puerto internos.

Configurar `PROXY_TRUSTED_IPS` según la red real del proxy; el frontend sobrescribe X-Forwarded-For con la dirección observada y no confía ciegamente en un header del visitante. No exponer 8000 directamente a Internet. Las rutas privadas y sesiones llevan `no-store`; no ponerlas en caché compartida. Aplicar cabeceras de seguridad también a archivos prerenderizados en el proxy y HSTS cuando HTTPS esté validado.

Comprobar salud, cookie Secure, CSRF, permisos de foto borrador, una ficha creada sin rebuild y estados de disponibilidad. El panel Sistema muestra IA, eventos y tareas de reconstrucción. Readiness comprueba SQLite sin exigir modelos cargados.

## Recursos

Compose comienza con backend 2 CPU/2 GiB y frontend 0,75 CPU/384 MiB. El proceso de modelos local necesitó cerca de 1 GiB de RSS: no asumir 512 MiB. Son límites de partida para testing, no una medición del VPS. Mantener un worker, cachés pequeñas y semáforo de inferencia; medir antes de aumentar réplicas/hilos.

No registrar cuerpos de formularios, cookies, contraseñas ni tokens. La recuperación sin SMTP devuelve indisponibilidad, no éxito simulado. Los modelos sin preparar producen advertencias y conservan la búsqueda estructurada.

## Backups y restauración

`python -m app.cli backup /data/db/backups/FECHA.sqlite3` utiliza `Connection.backup` de SQLite y admite WAL activo. El destino debe ser nuevo y distinto del original. No copiar solo el archivo principal de una base en uso.

Para una copia completa con fotos: entrar en mantenimiento, detener escrituras/backend y copiar media junto a un backup consistente de SQLite y la configuración/revisión de modelos. Conservar copias cifradas fuera del VPS. LanceDB se reconstruye desde SQLite; preservar modelos evita nuevas descargas.

Restaurar con backend detenido: conservar los datos actuales, reemplazar SQLite/media por una copia correspondiente sin mezclar WAL/SHM de otra base, ajustar propietario UID 10001 y ejecutar código compatible. Comprobar integridad/FK, migrar si corresponde, reconstruir índice y probar cuenta, fotos, ficha y solicitudes antes de habilitar escrituras.

Antes de actualizar: backup, imagen/código identificados y migraciones revisadas. Las migraciones tienen versión/checksum; no se implementa downgrade destructivo automático. Rollback de esquema restaura backup y versión de aplicación juntos. No iniciar una imagen vieja contra un esquema futuro ni usar `docker compose down -v` en una actualización.

## SEO y validaciones pendientes

Verificar canonical, robots, llms y sitemaps (`/sitemap-index.xml`, `/sitemap-pets.xml`). Los perfiles ficticios/no aprobados quedan fuera de indexación. Registrar dominio y sitemap en Search Console cuando sea público; el código no garantiza tiempos de indexación.

Completar responsable, contacto, procedimiento de derechos y conservación de la política de privacidad antes de recolectar datos reales. La decisión de adopción sigue siendo humana.

La definición Compose fue validada con `docker compose config --quiet`. Docker Desktop está instalado pero el daemon Linux no estuvo accesible: **no se declara una construcción/ejecución de contenedores ni una prueba en Coolify/Antel**. Las pruebas locales Node/Python/CPU se registran separadamente. La imagen Python está fijada a `3.11.17-slim-trixie`, conforme a las [etiquetas oficiales](https://hub.docker.com/_/python); `requirements.lock.txt` fija la instalación probada localmente, y Linux se valida durante el testing del contenedor.
