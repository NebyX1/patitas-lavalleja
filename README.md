# Patitas Lavalleja · Intelligence

Plataforma que evoluciona el portal Astro existente: conserva su diseño, islas React, temas claro/neón, View Transitions y accesibilidad. FastAPI y SQLite incorporan cuentas, organizaciones, publicaciones revisadas, fotos, favoritos y solicitudes persistentes. El matching combina reglas estrictas, lógica difusa bidireccional, Bekko, LanceDB y Horizon, con inferencia local sobre CPU.

## Arranque local

Requisitos: Node.js 22.22.3 o posterior, Python 3.11 y npm. En Linux usar `.venv/bin/python` y `cp` en lugar de las variantes PowerShell siguientes.

```powershell
npm ci
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
Copy-Item backend/.env.example backend/.env
Set-Location backend
.venv/Scripts/python.exe -m app.cli migrate
.venv/Scripts/python.exe scripts/prepare_models.py --model-dir .data/models --onnx-fallback
.venv/Scripts/python.exe -m app.cli seed-demo
.venv/Scripts/python.exe -m app.cli create-admin --email TU_CORREO --name "Tu nombre"
.venv/Scripts/python.exe asgi.py --port 8010
```

En una segunda terminal, desde la raíz:

```powershell
npm run dev
```

Abrir **http://localhost:4321/**. El frontend usa `/api/v1` del mismo origen y reenvía al backend en `http://127.0.0.1:8010`; se configura con `BACKEND_INTERNAL_URL`. Los servicios pueden iniciarse por separado. OpenAPI: `http://127.0.0.1:8010/api/v1/docs`.

La contraseña administradora se pide en la terminal y no se versiona. En este workspace se generó un archivo local ignorado `.env.e2e` para pruebas; no es configuración de producción ni se copia a las imágenes. Seed crea animales ficticios rotulados y solo se permite en desarrollo/testing.

La preparación mínima de modelos descarga unos 467 MB; con el fallback Bekko ONNX el total verificado es 597.520.001 bytes. Los pesos quedan fuera del código. Si faltan, el catálogo y las recomendaciones estructuradas funcionan y muestran la degradación.

## Funcionalidades

### Laboratorio con usuarios ficticios

El navbar ofrece **Iniciar sesión** y lleva a `/login/`; en pantallas pequeñas el acceso está dentro del menú. Esa página concentra el selector de pruebas, el acceso con contraseña, el registro y la recuperación. Hay ocho hogares con preferencias guardadas, cuatro responsables de asociaciones y una administradora ficticia. Al ingresar se muestra el nombre activo; para elegir otra cuenta hay que **Cerrar sesión** desde el perfil. `/cuenta/` y `/tu-match/` no muestran selectores de acceso. Una visita anónima a la búsqueda pasa por login y vuelve al cuestionario al ingresar. En Tu match, **Buscar con mi perfil guardado** evalúa directamente el hogar de la sesión activa.

Para preparar este laboratorio en otro entorno local, detener primero la API y ejecutar desde `backend/`:

```powershell
.venv/Scripts/python.exe -m app.cli seed-testing
.venv/Scripts/python.exe -m app.cli rebuild-index
```

Configurar `DEMO_LOGIN_ENABLED=true` en `backend/.env`, con `ENVIRONMENT=development`, y reiniciar la API. El flag viene desactivado en la plantilla y se rechaza en producción. El acceso conserva cookies, CSRF, permisos y rotación de sesión; solo admite los IDs ficticios creados por este seed. No hay contraseñas públicas.

El seed es aditivo e idempotente: agrega 48 animales y cuatro asociaciones ficticias, además de los diez ejemplos originales. Incluye perros, gatos, conejos y aves, diferentes edades/energías, convivencia compatible/incompatible/condicional/desconocida, cuidados indispensables y estados disponibles, reservados, adoptados, retirados, borrador y pendientes. También incorpora favoritos e historial de cuatro solicitudes ficticias. No modifica las fichas o preferencias ya editadas. Las fotos de perros/gatos reutilizan imágenes ilustrativas existentes; otras especies conservan el marcador de ausencia de foto.

Ana prioriza tranquilidad; Bruno, actividad; Carla combina gato y niña pequeña; Diego convive con gatos; Elena prueba otras especies; Federico pasa nueve horas fuera; Gabriela combina perro y niños; Hugo conserva información sin confirmar. Lucía, Marcos, Paula y Ramiro gestionan una asociación cada uno. Sofía permite probar administración e IA.

Pruebas específicas: `npx playwright test tests/e2e/testing-login.spec.ts`. Las pruebas históricas del catálogo usan el seed original de diez ejemplos; no asumir sus cantidades después de ampliar el laboratorio.

### Perfiles y revisión en dos sentidos

La **Búsqueda inteligente** aparece al iniciar sesión en el navbar, menú móvil y catálogos, incluidos favoritos. La página `/tu-match/` y sus rutas de análisis exigen una cuenta activa. Cada ficha animal ofrece **Analizar compatibilidad**, usando el hogar guardado de esa cuenta y mostrando ambos ejes, razones y condiciones pendientes. Si falta el hogar, ofrece completarlo. Salir o cambiar de cuenta descarta el informe anterior; las mismas restricciones se aplican en FastAPI, con CSRF y revalidación tras inferir.

El cuestionario utiliza el ancho disponible, con siete pasos navegables, tarjetas visuales de selección múltiple, accesos rápidos para tiempos de actividad y un resumen de respuestas en vivo. La búsqueda con el perfil guardado está al comienzo. Los resultados muestran ambos ejes de compatibilidad y motivos desplegables en una grilla adaptable a móvil y al tema neón. Sus piezas visuales están separadas en `src/components/match/` y sus estilos en `src/styles/match-studio.css`.

Antes de los matches aparece un modal animado con progreso real del servidor. Sus textos describen el hogar, las preferencias, las historias disponibles y las afinidades, sin identificar las tecnologías internas. Muestra perfiles revisados y permite cancelar y reintentar sin perder las respuestas. Las búsquedas rápidas conservan una breve transición de lectura, y el movimiento reducido mantiene toda la información de etapas.

El análisis de compatibilidad de una ficha también abre este modal, personalizado con el nombre del animal. Tiene una presentación mínima de tres segundos, cancelación y reintento. Las etapas muestran los estados confirmados en el informe; los modelos no requeridos o indisponibles se identifican como tales.

`/cuenta/` ofrece un perfil personal con portada, avatar de iniciales, presentación editable, localidad, biografía, completitud del hogar, favoritos y seguimiento de solicitudes. Las cuentas responsables tienen además su organización y acceso directo a la revisión. Solo muestra el perfil de la sesión activa; al salir se abre `/login/`. Una cuenta conectada que visite `/login/` vuelve al perfil o al destino interno solicitado.

Para presentar el recorrido: ingresar como **Lucía**, abrir **Revisar solicitudes con IA**, buscar la solicitud de **Brisa** de Ana y pulsar **Ver perfil del solicitante** o **Evaluar compatibilidad con IA**. El informe mantiene separados **Hogar → Animal** y **Animal → Persona**, muestra afinidades, condiciones pendientes y componentes disponibles. Al cambiar a **Ana**, se encuentra el mismo informe en **Solicitudes**. Marcos/Carla y Paula/Diego permiten contrastar otras asociaciones y hogares. La orientación nunca decide la adopción; el equipo conserva sus controles de estado.

Los informes quedan guardados y se marcan desactualizados si cambia el hogar o la ficha animal. Antes de actualizar instalaciones existentes, respaldar SQLite y ejecutar `python -m app.cli migrate` con la API detenida. La migración 003 añade presentaciones e informes sin reemplazar datos existentes; `seed-testing` completa presentaciones ficticias faltantes sin sobrescribir ediciones. Las pruebas nuevas están en `tests/e2e/person-profiles.spec.ts` y `backend/tests/test_person_profiles.py`.

### Plataforma

- Catálogo persistente con filtros combinados, convivencia observada, chips, orden y paginación; una tarjeta por fila en móvil.
- Fichas dinámicas con URL estable, SEO individual y 404 real, sin reconstruir el frontend después de publicar.
- Registro y sesiones revocables; perfil de compatibilidad editable/eliminable y favoritos de cuenta.
- Perfil personal privado y editable, seguimiento e informes de compatibilidad compartidos entre solicitante y responsable autorizado.
- Cuestionario de siete etapas y resultados con afinidad, adecuación del hogar, incógnitas y explicaciones verificables.
- Solicitudes autenticadas, protección contra duplicados, historial y estados gestionados por personas.
- Panel `/admin/` dividido en mascotas, solicitudes, organizaciones, responsables, cuentas, auditoría y sistema.
- Subida de fotografías con validación y WebP; borrador, revisión, aprobación y cambios de disponibilidad.
- Outbox recuperable, diagnóstico de IA y reconstrucción del índice desde SQLite.

Los perfiles seed son ficticios y se identifican en cada ficha; las solicitudes reales no se aceptan sobre ellos. Las páginas de colaboración conservan explícitamente su alcance de demostración. Recuperación de contraseña necesita SMTP autorizado y devuelve indisponibilidad si no está configurado.

## Arquitectura

`src/layouts` conserva la composición Astro y ClientRouter. `src/lib/api.ts`, `src/lib/server.ts` y `src/pages/api/[...path].ts` resuelven cliente tipado, proxy, cancelación, cookies/CSRF y límites de cuerpo. Fichas y catálogo usan SSR Node; páginas editoriales siguen prerenderizadas. `src/components/admin` divide la gestión por responsabilidades.

`backend/app` separa routers, seguridad, SQLAlchemy, servicios, matching, IA, tareas y almacenamiento; `backend/migrations` contiene migraciones versionadas. SQLite con WAL/FK es la fuente oficial. El outbox sincroniza solo información pública con LanceDB; los resultados se revalidan contra SQLite. Las incompatibilidades confirmadas no se compensan con similitud textual y los índices no son probabilidades de adopción.

`src/data/pets.ts` y el HTML original siguen como referencias visuales y datos de prueba, sin actuar como base de producción. Las fotos nuevas se alojan en el volumen del backend. Fuentes e identidad visual permanecen locales en `public/`.

## Comprobaciones

```powershell
npm run check
npm run test
npm run build
npm run test:e2e
Set-Location backend
.venv/Scripts/python.exe -m pytest -q
```

Playwright usa Chrome instalado y necesita API/frontend con datos seed de desarrollo. Las pruebas administrativas leen `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD` del entorno; el informe describe su ejecución. Las pruebas reales de IA y los benchmarks tienen opt-in y preparación documentados.

## Docker y documentación

Dos Dockerfiles independientes y `compose.yaml`, con cuatro volúmenes: SQLite, media, LanceDB y modelos. Astro escucha 4321 y FastAPI 8000 dentro de Docker; el proxy utiliza `http://backend:8000`. Configurar secretos, dominio HTTPS y persistencia antes de producción.

[Arquitectura y auditoría](docs/ARCHITECTURE.md) · [Datos](docs/DATA_MODEL.md) · [API](docs/API.md) · [Matching](docs/AI_MATCHING.md) · [Modelos CPU](docs/AI_MODELS.md) · [Seguridad](docs/SECURITY.md) · [Docker/Coolify](docs/deployment.md) · [Pruebas](docs/TEST_REPORT.md) · [Rendimiento](docs/PERFORMANCE.md)

El daemon Docker local no estuvo disponible durante la preparación; las verificaciones de contenedores y del VPS de Antel se distinguen de las pruebas locales realmente ejecutadas. Los muros sociales y la mensajería general quedan para otra etapa. No volver a ejecutar los scripts de extracción inicial sobre componentes evolucionados.
