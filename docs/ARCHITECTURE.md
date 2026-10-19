# Patitas Intelligence: auditoría y decisiones

Auditoría inicial: 18 de octubre de 2026, antes de modificar la aplicación. Base local `e4d7fd8` del repositorio `NebyX1/patitas-lavalleja`.

## Qué se conserva y qué cambia

El portal usa Astro 7.3.8, React, TypeScript, Tailwind y Nano Stores. Se conservan BaseLayout, ClientRouter, tarjetas, galerías, pestañas, componentes visuales, estilos por área, temas claro/neón, movimiento reducido y la columna única móvil hasta 767 px. El catálogo, las fichas y las solicitudes dependen hoy de ocho perfiles ficticios en `src/data/pets.ts`; favoritos usa localStorage con una lista fija de IDs. MatchQuiz resuelve tres preguntas con una suma local y DemoForm nunca transmite datos. Estas partes requieren servicios persistentes y estados reales de error, carga y disponibilidad.

## Referencias investigadas

- Invest backend, commit `e708b02ab4351cd7ce378618b2df61f3e8ac24fe`: FastAPI/lifespan, Argon2, sesiones opacas revocables, CSRF y origen, roles, límites persistentes; WAL y migraciones transaccionales; LanceDB con FTS español, RRF y reranker perezoso. Usa sqlite3 directo: Patitas incorpora SQLAlchemy 2. Sus índices completos versionados inspiran recuperación, pero Patitas necesita un outbox incremental en la transacción de cada perfil. No se copian Ollama, LangGraph ni servicios generativos.
- Invest frontend, commit `1557d455883605fa7db3c2cbf2cfbc5f13289033`: llamadas del navegador al mismo origen `/api`, cookies y CSRF, separación entre dirección interna y pública, proxy y despliegue. Su renderizado estático no resuelve perfiles creados después del build.
- Sala de Medios backend, commit `99723bd3d5bb466986557f9d74f0f5618d6cffff`: validación del contenido real, límites de píxeles/bytes, orientación EXIF, conversión a sRGB, WebP y concurrencia limitada. Se adapta con almacenamiento local persistente; no se agrega MinIO ni pyvips como dependencia obligatoria.

Referencias: https://github.com/IntendenciaDeLavalleja/invest-lavalleja-backend, https://github.com/IntendenciaDeLavalleja/invest-lavalleja-frontend y https://github.com/IntendenciaDeLavalleja/sala-de-medios-backend.

## Arquitectura elegida

Frontend Astro con adaptador Node compatible (la versión 11.1.8 admite Astro ^7.2.1), páginas editoriales prerenderizadas y fichas/solicitudes bajo demanda. Un endpoint proxy Astro de `/api/` conecta con FastAPI por `BACKEND_INTERNAL_URL`. El navegador usa rutas relativas y no recibe secretos ni nombres internos de Docker. Los componentes reutilizables adaptan el contrato HTTP al modelo visual existente. Una caída de API produce un aviso y un estado HTTP coherente, nunca mascotas ficticias presentadas como disponibilidad real.

Backend autónomo en `backend/`, con routers, configuración, seguridad, SQLAlchemy, migraciones, servicios de dominio, almacenamiento, matching y tareas de indexación separados. SQLite es la fuente oficial de cuentas, organizaciones, perfiles, observaciones, fotografías, favoritos, solicitudes, auditoría y eventos de indexación. Activa foreign_keys, WAL y busy_timeout. Las transacciones no abarcan inferencia ni conversión de imágenes. Una sola instancia escritora/worker mantiene acotados recursos y acceso al índice embebido.

Las publicaciones pasan por borrador/revisión/aprobación. Los permisos se verifican por rol y organización en backend. Las sesiones se revocan en servidor; contraseñas Argon2id, cookies HttpOnly, Secure en producción, SameSite y validación CSRF/origen. Los datos de prueba quedan identificados y sus solicitudes no se confunden con adopciones reales.

## Matching y recuperación

SQLite obtiene candidatos publicados y disponibles. Reglas estrictas separan `eligible`, `needs_review`, `blocked` y `unavailable`; una incompatibilidad confirmada aplicable nunca puede compensarse con una puntuación textual. Los datos desconocidos requieren confirmación, no equivalen a compatibilidad. El motor difuso versionado evalúa por separado afinidad humana y capacidad del hogar para atender necesidades observadas, con explicaciones deterministas y confianza informativa independiente del índice.

Bekko `hotchpotch/bekko-embedding-v1-a8m`, revisión `c721113d59a1d91b447450324f51c4b3332c924a` (MIT), genera vectores normalizados de 384 dimensiones. Se prefiere OpenVINO CPU y se admite ONNX del mismo modelo. Horizon `Horizon-Labs/multilingual-reranker-small`, revisión `c2ec8fb3e499725b168bbed2164bfee095360f77` (Apache-2.0), usa ONNX cuantizado, pares de hasta 384 tokens y un conjunto pequeño de candidatos. Runtime directo con tokenizers evita Torch. Los modelos se preparan explícitamente y se conservan en volumen; no se descargan dentro de peticiones.

LanceDB contiene solo identidad/versionado y texto/metadatos públicos mínimos. Búsqueda exacta cosine + BM25 español se fusionan por RRF; se incluyen candidatos estructurados para evitar su pérdida por top-K semántico. Cada resultado se revalida con SQLite. Un evento de outbox se registra junto al cambio de perfil; el indexador idempotente reintenta y permite reconstrucción íntegra desde SQLite. La caída del reranker o del embedding conserva matching estructurado y búsqueda textual, con degradación explícita.

## Recursos y despliegue

Dos contenedores independientes: frontend Node y backend Uvicorn, sin GPU, Redis ni PostgreSQL. Persistencia fuera del código para SQLite/LanceDB/modelos/media; un worker, semáforos, hilos CPU limitados, cachés acotadas y cargas perezosas. Modelos mínimos estimados por sus artefactos: Bekko 164,6 MB y Horizon 302,9 MB, sin atribuir estas estimaciones a benchmarks. Los límites y latencias reales se registrarán junto al hardware. El host local tiene Python 3.11 y AVX2; Docker está instalado pero la auditoría no pudo conectar a su daemon, por lo que una ejecución en contenedor todavía no está verificada.

Los contratos y decisiones implementados se documentan en [API](API.md), [datos](DATA_MODEL.md), [matching](AI_MATCHING.md), [modelos CPU](AI_MODELS.md), [seguridad](SECURITY.md) y [operación](deployment.md). Los resultados efectivamente ejecutados se conservan en [TEST_REPORT](TEST_REPORT.md) y [PERFORMANCE](PERFORMANCE.md). La validación del contenedor y del VPS se distingue explícitamente de la inferencia y las pruebas locales.
