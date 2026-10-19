# Informe de verificación

Ejecución local del 18 de octubre de 2026, con revisión de acceso a IA el 19 de octubre, sobre la evolución del portal existente. Este informe distingue pruebas de software, inferencia real y validaciones de infraestructura pendientes. No se utilizaron cuentas ni solicitudes de personas reales.

## Crear y editar la presentación desde “Acerca de mí” · 19 de octubre

La tarjeta incluye un acceso directo para completar o editar la información personal. Conserva el formulario existente de nombre, localidad, frase, biografía y color del avatar, con guardado en la cuenta. Abrirlo desplaza y enfoca el editor bajo la navegación; guardar o cancelar devuelve el foco al botón de origen. Se distinguen los estados de presentación vacía y existente, y se conservan los saltos de línea de la biografía.

**8 pruebas de navegador aprobadas en 15,3 segundos**, escritorio y móvil. Verifican perfil vacío, cancelación sin guardar borradores, actualización del nombre en la navegación, persistencia después de recargar, acceso desde tarjeta y encabezado, anchos de 320 a 1920 px, foco y axe en claro/neón. Se restauran los datos originales de las cuentas de prueba; las comprobaciones de favoritos parten de su estado actual en vez de asumir las cantidades del seed. Las capturas `reports/previews/about-me-*` se revisaron visualmente. Astro Check: **137 archivos, cero errores/advertencias/hints**; **26 pruebas unitarias aprobadas**; build correcto. La API de perfiles no necesitó cambios.

## Lenguaje de producto sin tecnologías internas · 19 de octubre

Se revisaron componentes, páginas, formularios, modales, informes y gestión. Las etapas explican hogar, preferencias y afinidades; los informes conservan resultados, razones y límites sin mostrar componentes de infraestructura. Los avisos de orientación parcial usan un texto propio, sin reproducir `meta.warnings`. Gestión presenta funciones y estados legibles, omite diagnósticos y versiones internas, y reemplaza el JSON de auditoría por acciones y detalles de negocio conocidos. Los errores inesperados y de servidor se convierten en mensajes de recuperación; se conservan los mensajes útiles sobre cuentas, permisos y datos. También se retiraron referencias de implementación de la información pública y de `llms.txt`.

Vitest aprobó **26 pruebas** y Astro Check revisó **137 archivos sin errores, advertencias ni hints**. En navegador se verificaron 28 escenarios únicos: **26 aprobados en la corrida de 54,8 segundos** y las dos comprobaciones de gestión aprobadas tras corregir la estructura accesible del aviso de servicio. La última corrida dirigida repitió modal y gestión en ambos tamaños: **4 pruebas aprobadas en 6,8 segundos**. Incluyen escritorio/móvil, claro/neón, inferencia real, informes personales y del responsable, errores transmitidos, avisos parciales y datos simulados con nombres de tecnologías y diagnósticos que deben quedar fuera de la interfaz. La prueba de auditoría conserva estados y notas de gestión sin publicar nuevos campos internos. Los resultados del motor y el contrato de la API no se modificaron.

## Animación del análisis de una ficha · 19 de octubre

El análisis personal reutiliza el modal de procesamiento con el nombre del animal, órbitas animadas y una presentación mínima de tres segundos. La inferencia comienza de inmediato; los estados de reglas, Bekko y Horizon se confirman desde la respuesta JSON, incluyendo componentes no requeridos. Se conserva el cálculo y el control de sesión del endpoint. Cancelar también descarta informes recibidos durante la espera visual. Los fallos permiten reintentar desde la misma ficha.

Validación de esta revisión: **18 pruebas de navegador aprobadas en 42,4 segundos**, escritorio y móvil, combinando `pet-processing`, `match-processing` e `intelligent-access`. Incluyen inferencia real, respuestas instantáneas simuladas para comprobar la demora visual, incompatibilidad estructurada, errores y reintentos, cancelación antes/después de recibir respuesta, foco, movimiento reducido y axe en claro/neón. Las cuatro capturas `reports/previews/pet-processing-*` se revisaron visualmente, incluido ancho de 320 px. **25 pruebas unitarias frontend aprobadas**, Astro Check sobre 134 archivos sin errores/advertencias/hints y build correcto. No hubo cambios de backend ni se repitió su suite completa en esta revisión.

## Procesamiento de IA visible · 19 de octubre

La búsqueda abre un modal nativo animado antes de presentar resultados. El servidor transmite en vivo las etapas de reglas, Bekko, LanceDB, Horizon y ranking por NDJSON, con conteos agregados y estados reales de disponibilidad. Los errores no generan resultados parciales; cancelar conserva las respuestas, aborta la petición y evita programar la siguiente etapa después de una inferencia nativa en curso. El proxy transmite el cuerpo sin acumularlo; la espera de desconexión no hereda el plazo de carga del JSON.

La presentación ofrece estados finales breves para respuestas rápidas, sin retrasar la inferencia ni fingir porcentajes. Se verifican UTF-8 fragmentado, streams incompletos/erróneos, cancelación del intervalo de presentación, seguridad de sesión y origen, revalidación de fichas/sesión, degradación de modelos y espera de desconexión. Las capturas `reports/previews/match-processing-*` muestran escritorio/móvil y claro/neón, con revisión de foco, Escape, reintento, desbordamiento y axe.

Validación final de esta revisión: **16 pruebas de navegador aprobadas en 1,1 minutos**, **102 pruebas backend aprobadas en 68,85 segundos** con los dos casos de modelos reales habilitados, y **24 pruebas unitarias frontend aprobadas**. Astro Check: 132 archivos, cero errores/advertencias/hints. Build, formato y salud de ambos servicios correctos. Las comprobaciones del navegador observan las transiciones renderizadas y los resultados; los registros NDJSON se verifican además en las pruebas de API.

## Rediseño de búsqueda inteligente · 19 de octubre

La página utiliza el ancho del contenedor con encabezado compacto, acceso inicial al perfil guardado, siete pasos navegables, tarjetas de especies con fotografía, selecciones múltiples, valores rápidos para la rutina y resumen de respuestas en vivo. Los resultados se presentan en grilla, conservando ambos ejes y todos los motivos de compatibilidad mediante detalles desplegables. Se separaron cinco componentes visuales en `src/components/match/`, con estilos propios y estados claro/neón.

La revisión del navegador cubre conservación de respuestas al navegar entre pasos, foco y desplazamiento bajo el navbar, búsqueda real con perfil guardado, detalles de resultados, retorno desde login y cambio de cuentas mediante logout. El diseño se comprueba a 320, 390, 768, 1060, 1440 y 1920 px; axe verifica cuestionario claro/neón y resultados. Las capturas `reports/previews/match-studio-*` y `match-results-*` se revisaron visualmente.

Durante la regresión se detectó una carrera existente: un registro respondía 201 pero la consulta inmediata de sesión aún veía al visitante anónimo porque el commit quedaba en la limpieza posterior de la dependencia HTTP. Las rutas de autenticación ahora confirman antes de responder. `tests/test_auth_commit.py` verifica desde otra conexión que la creación, rotación y salida ya son visibles antes de ejecutar esa limpieza.

Resultado final: **14 escenarios de navegador aprobados en un minuto**, escritorio y móvil, sin omisiones; **95 pruebas backend aprobadas en 53,94 segundos**, incluidas las dos de modelos reales con `RUN_AI_INTEGRATION=1`; **21 pruebas unitarias frontend aprobadas**. Astro Check revisó 126 archivos sin errores, advertencias ni hints. Build y formato correctos. Frontend y backend quedaron activos y saludables en 4321/8010.

## Separación de login y búsqueda inteligente · 19 de octubre

`/login/` concentra el acceso de pruebas, correo/contraseña, registro y recuperación. El cuestionario y el perfil no incluyen selectores para cambiar de cuenta. Las visitas anónimas al perfil o a la búsqueda pasan por login con retorno interno; las cuentas conectadas omiten esa pantalla. Cerrar sesión abre login y permite elegir otra persona.

Verificación de esta revisión: Astro Check sobre 120 archivos sin errores, advertencias ni hints; build correcto; **21 pruebas unitarias**, **2 pruebas backend de recuperación** y **28 escenarios Playwright aprobados en 1,1 minutos**, sin omisiones. El navegador comprueba escritorio/móvil, acceso desde navbar, retorno al cuestionario, cambio Ana → Bruno → Carla mediante logout, aislamiento de asociaciones, análisis de compatibilidad, recuperación con enlaces anteriores, registro, perfil y estilos. Se rechazaron destinos externos de `next` y retornos que generarían bucles de login. La suite completa de 94 pruebas backend indicada más abajo corresponde a la revisión previa del motor; en esta revisión se ejecutaron las dos pruebas afectadas por el nuevo enlace de recuperación.

Las capturas `reports/previews/dedicated-login-{desktop,mobile}.png` y `match-without-login-{desktop,mobile}.png` se revisaron visualmente. Ambos servicios quedaron activos en 4321/8010 y respondieron HTTP 200 en salud/readiness. Los correos nuevos usan `/login/#reset_token=TOKEN`; los enlaces previos de `/cuenta/` siguen funcionando y limpian el fragmento.

## Entorno observado

- Windows x64, AMD Ryzen 5 5500, seis núcleos/doce hilos, aproximadamente 15,9 GiB de RAM y AVX2 visible.
- Node.js 22.15.1 y Python 3.11.0 instalados en el host. El proyecto declara Node >=22.22.3; las imágenes propuestas fijan Node 22.22.3 y Python 3.11.17. Estos últimos runtimes no se ejecutaron mediante Docker aquí.
- Astro 7.3.8, React 19.3.0 y adaptador Node 11.1.8. Dependencias Python fijadas en `backend/requirements.lock.txt`.
- Frontend compilado servido en `http://localhost:4321`; FastAPI independiente en `http://127.0.0.1:8010`. Google Chrome 155.0.8059.82. SQLite, fotos, LanceDB y modelos locales persistentes en directorios ignorados por Git.
- Bekko OpenVINO, Bekko ONNX alternativo y Horizon ONNX cuantizado descargados de revisiones fijadas y verificados; inferencia CPU con dos hilos. No se usaron servicios externos de inferencia.

## Resultados

| Comprobación                                                                | Resultado observado                                                                                                               |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                                             | 0 errores, 0 advertencias, 0 hints                                                                                                |
| `npm run test`                                                              | 10 pruebas aprobadas                                                                                                              |
| `npm run build`                                                             | Compilación Astro/Node y páginas prerenderizadas correctas                                                                        |
| Playwright Chrome, escritorio y móvil                                       | Revisión del 19/10: **30 aprobadas en aproximadamente un minuto**; acceso autenticado a IA, perfiles, fotos, paginación y estilos |
| Pytest completo, `RUN_AI_INTEGRATION=1`                                     | **94 pruebas aprobadas en 70,03 segundos**, sin omitir las dos pruebas de pesos reales                                            |
| `pip check`                                                                 | Sin dependencias incompatibles                                                                                                    |
| `npm audit --omit=dev --json`                                               | 0 vulnerabilidades reportadas en dependencias de producción al ejecutar la revisión                                               |
| `docker compose -f compose.yaml -f compose.development.yaml config --quiet` | Definición válida                                                                                                                 |
| Salud frontend y readiness backend                                          | Ambos HTTP 200; SQLite disponible y configuración IA activada                                                                     |
| Filtro público `species=other`                                              | Incluye la coneja ficticia Lila; mantiene separados perros y gatos                                                                |

## Acceso autenticado a búsqueda y análisis personal · 19 de octubre

La búsqueda inteligente aparece para cuentas conectadas en navbar, menú móvil y catálogo/favoritos. El cuestionario pide iniciar sesión antes de comenzar. `/matches/search` y `/matches/evaluate` exigen cuenta activa, CSRF y origen permitido; las respuestas usan `no-store`. El análisis personal de una ficha usa `/me/pets/{id}/compatibility` y obtiene exclusivamente el hogar guardado del titular. No crea solicitudes ni informes de responsable. Los perfiles sin hogar ofrecen completarlo; las sesiones revocadas y los cambios de datos durante inferencia se rechazan.

Las seis pruebas nuevas de `backend/tests/test_personal_matching.py` verifican acceso anónimo rechazado, CSRF/origen, imposibilidad de sustituir la identidad o el perfil desde el cliente, ausencia de hogar, privacidad de borradores, disponibilidad reservada, ausencia de escrituras de evaluaciones y revalidación tras cambios de hogar, ficha o sesión. La suite completa suma 94 pruebas, incluidas las dos de modelos reales. Astro Check revisó 116 archivos sin errores, advertencias ni hints. Build y diez pruebas Vitest correctos.

La corrida final aprobó 30 escenarios de navegador en un único proceso con dos workers, sin omisiones. Incluyó `intelligent-access`, `testing-login`, `person-profiles`, `pet-profile-layout`, `pagination`, `layout` y el recorrido del cuestionario autenticado de `site`. Verificó acceso anónimo, login, búsqueda guardada, análisis Ana/Nube, descarte al salir o entrar como Bruno, hogar ausente, explicación y axe en claro/neón. El navbar y los puntajes se comprobaron entre 320 y 1920 px. Las capturas `reports/previews/personal-compatibility-{desktop,mobile}.png` muestran resultados reales; cuando la inferencia está ocupada la interfaz informa degradación en lugar de afirmar disponibilidad neural.

Los escenarios históricos de catálogo que dependen de cantidades del seed original y la publicación completa no se contabilizan como repetidos en esta revisión. Las secciones siguientes conservan las mediciones de las entregas previas.

## Laboratorio ampliado con acceso ficticio

Se cargaron trece usuarios de selección rápida: ocho hogares con perfil guardado, cuatro responsables de asociaciones distintas y una administradora. El seed agregó cuatro asociaciones y 48 animales: 24 perros, 16 gatos, cuatro conejos y cuatro aves. Junto con los diez ejemplos iniciales hay 58 animales ficticios de los seeds; 50 están publicados y disponibles. Los otros estados incluyen revisión, reserva, adopción, retirada, borrador y publicación pendiente. Todo permanece marcado como ficticio. Se creó un backup SQLite consistente antes de ampliar los datos locales.

La suite `tests/test_testing_mode.py` comprueba que el acceso está desactivado por defecto, rechaza producción e IDs reales y exige CSRF/origen. Verifica rotación de sesión, permisos por asociación, perfiles y favoritos separados, matching aplicable a niños/gatos/otras especies y seed idempotente sin sobrescribir ediciones. Estas dos pruebas están incluidas en el total del backend.

La corrida específica `npx playwright test tests/e2e/testing-login.spec.ts` aprobó sus cuatro escenarios en 13,7 segundos contra el frontend compilado y FastAPI real: escritorio/móvil, selección sin contraseña, cambio de Ana a Bruno y Carla, búsqueda con perfil guardado, descarte de resultados del usuario anterior y aislamiento de gestión de Lucía. Incluye axe sobre el selector y ausencia de desbordamiento móvil. Las capturas están en `reports/previews/testing-login-{desktop,mobile}.png` y `testing-results-{desktop,mobile}.png`. La suite histórica de 28 escenarios se ejecutó con el seed original y no se volvió a declarar como corrida completa sobre el catálogo ampliado.

Además se consultó la API real para los ocho hogares, con Bekko, Horizon, vectores y reglas en estado `ready`, sin degradación. Los primeros resultados observados fueron Ana: Brisa/Alma/Coco; Bruno: Rayo/Flash/Tango; Carla: Copito/Nube/Nori; Diego: Nube/Copito/Nori; Elena: Nuez/Avellana/Copo; Federico: Nube/Copito/Seda; Gabriela: Duna/Frida/Miel; Hugo: Sol/Tronco/Nuez. Los excluidos por reglas fueron respectivamente 9, 29, 40, 36, 41, 16, 29 y 0. Son escenarios sintéticos, no una evaluación de calidad clínica ni de éxito de adopción.

El frontend se dejó servido mediante `npm run preview` en 4321 y FastAPI en 8010. El acceso necesita `DEMO_LOGIN_ENABLED=true` y entorno development/testing; no modifica el mecanismo de login de producción.

## Correcciones de interfaz y regresiones

Se corrigió el encabezado fijo que invadía los paneles de Cuenta y Administración al desplazarse: el comportamiento sticky queda limitado a los recorridos que realmente tienen dos columnas y altura suficiente. Las acciones de editar y eliminar perfil se presentan en líneas separadas. También se ajustaron campos y columnas con `minmax(0,1fr)`, textos largos, botones adaptables, separación entre tarjetas, paginación y márgenes de formularios desplegables. El navbar usa fondo opaco al hacer scroll para conservar la legibilidad; la composición ilustrada del inicio ya no genera desbordamiento horizontal en móvil.

`tests/e2e/layout.spec.ts` verifica separación geométrica del encabezado y las acciones después de varios desplazamientos, navegación ClientRouter de ida y vuelta, Cuenta en claro/neón con axe, formularios de mascotas desplegados, todas las secciones de administración y páginas públicas entre 320 y 1920 px. Las capturas `reports/previews/layout-*.png` se revisaron visualmente.

La validación final combinó esta suite con `testing-login.spec.ts`: **10 pruebas aprobadas en 28,6 segundos**, dos workers, sin omisiones. Astro Check: 102 archivos, cero errores/advertencias/hints. Build correcto. La suite completa de backend, con pesos reales, aprobó **82 pruebas en 55,54 segundos**. Ambos servicios quedaron activos y saludables en 4321/8010.

Al ejecutar la revisión junto con las pruebas de búsqueda se detectó una espera de SQLite entre login y matching: el limitador síncrono podía bloquear el event loop mientras otra petición debía confirmar su sesión. La espera del limitador de matching se trasladó al threadpool. Una prueba coordinada con eventos mantiene la transacción de login hasta iniciar matching y exige que ambas peticiones terminen correctamente; los límites y la seguridad de sesión se conservan.

## Alcance backend

### Perfil personal y revisión de compatibilidad por solicitud

Se aplicó la migración 003 sobre la base local existente después de crear un backup SQLite consistente. El seed completó trece presentaciones ficticias sin reemplazar usuarios, preferencias, mascotas ni solicitudes. Las presentaciones permiten editar nombre, frase, biografía, localidad y color de avatar, con sincronización de localidad entre cuestionario y presentación. Cuenta organiza resumen, hogar, solicitudes, favoritos y organizaciones según el rol; el cambio de cuenta de prueba queda contraído al final.

Las seis pruebas de `backend/tests/test_person_profiles.py` cubren presentación privada editable, rechazo de campos de permisos/avatar inválidos, CSRF, separación por asociación, informe persistente y lectura por el solicitante. Incluyen incompatibilidad confirmada sin invocar ranking neural, ausencia de hogar, animal reservado y cambios de perfil/permisos durante inferencia. Los estados de solicitud y disponibilidad se conservan. Una modificación posterior del hogar marca el informe desactualizado.

La API real confirmó para la pareja ficticia Ana/Brisa: orientación favorable, ambos ejes 100/100, informe vigente y Bekko, Horizon, reglas y LanceDB en `ready`, sin degradación. Estos índices describen un escenario sintético y no son probabilidades de éxito. El responsable puede consultar la explicación y el solicitante ve el mismo informe guardado.

`tests/e2e/person-profiles.spec.ts` verifica edición y persistencia tras recarga, navegación entre secciones, actualización de favoritos y contador, evaluación desde Lucía y lectura desde Ana. Las capturas `reports/previews/person-profile-{desktop,mobile}.png`, `person-profile-neon-{desktop,mobile}.png` y `application-assessment-{desktop,mobile}.png` se revisaron visualmente. Axe se ejecuta sobre los perfiles en ambos temas y sobre el panel de revisión. En móvil los ejes y las tarjetas quedan en una columna, con el contenido seleccionado antes de los bloques complementarios.

Astro Check revisó 110 archivos sin errores, advertencias ni hints. Vitest aprobó diez pruebas y el build terminó correctamente. La última suite completa de backend con pesos reales aprobó 88 pruebas en 48,60 segundos. El benchmark anterior no se repitió: esta entrega reutiliza los módulos de IA y matching existentes, sin cambiar sus fuentes ni presentar nuevas cifras de rendimiento.

La corrida final de navegador aprobó **18 pruebas en 36,4 segundos**, con dos workers y sin omisiones. Combinó perfiles, estilos, acceso ficticio y los escenarios de registro/CSRF, errores/404 y recuperación de `platform.spec.ts`. Se excluyeron por nombre los dos escenarios históricos de catálogo con cantidades del seed original y publicación completa; no se presentan como repetidos en esta revisión. Comando exacto:

```powershell
npx playwright test tests/e2e/person-profiles.spec.ts tests/e2e/layout.spec.ts tests/e2e/testing-login.spec.ts tests/e2e/platform.spec.ts --grep-invert 'mobile catalog displays|authorized publication'
```

Una iteración previa lanzó dos procesos Playwright sobre la misma carpeta de evidencias y produjo errores ENOENT de trazas al cerrarse los contextos. La corrida final se ejecutó en un único proceso. También se corrigió la espera del test de registro: debe esperar la configuración del acceso ficticio antes de abrir el formulario de contraseña.

### Verificaciones generales

La suite verifica registro, cookies/CSRF/origen, revocación, roles y permisos por organización/recurso; publicación/aprobación/retirada; filtros SQL normalizados, paginación y convivencia combinada con semántica AND; favoritos, perfiles y solicitudes persistentes. Comprueba que los datos ficticios no puedan convertirse en solicitudes reales y que las observaciones positivas requieran evidencia.

También cubre carreras de solicitudes duplicadas y de cuotas de fotos, límites de cuerpo y tasas, privacidad de fotos borrador, estados humanos de adopción, tareas de reconstrucción persistentes, migraciones idempotentes con checksum y rechazo de esquemas futuros. Las pruebas de persistencia reinician la aplicación contra la misma SQLite y verifican datos/sesiones, FK/WAL, restricciones del seed y backup consistente.

La recuperación se prueba con transporte SMTP sustituido: enlace `/cuenta/#reset_token=TOKEN`, STARTTLS, consumo único y revocación de sesiones. Sin SMTP configurado se obtiene indisponibilidad explícita. No se envió correo externo.

El almacenamiento comprueba WebP de tres tamaños, límites de bytes/píxeles/cuota, contenido real, retirada de metadatos y rechazo de traversal o archivos disfrazados. Se usan imágenes de prueba generadas para estos casos.

## Matching e IA

Las pruebas estructuradas cubren reglas estrictas, especies aceptadas, incompatibilidades confirmadas aplicables, estados desconocidos, condiciones que requieren revisión y hogar aún no confirmado. Evalúan continuidad de funciones difusas, necesidades de compañía, actividad y cuidados; no deducen necesidad de patio por tamaño ni presentan similitud como probabilidad de adopción.

La recuperación híbrida verifica normalización de señales, BM25, representación pública sin datos humanos, índice desactualizado, reintentos del outbox, leases tras interrupciones, retirada de vectores y reconstrucción idempotente. La revalidación contra SQLite impide recomendar un perfil retirado durante la inferencia. Modelos ausentes conservan candidatos mediante reglas/texto e informan degradación.

Las dos pruebas opt-in usan pesos reales: Bekko genera vectores L2 de 384 dimensiones; Horizon ordena parejas relevantes y admite consultas largas; LanceDB recupera con esos vectores. La ruta Bekko ONNX se compara numéricamente con OpenVINO con similitud superior a 0,999. Los dobles empleados en pruebas de fallos no se contabilizan como inferencia real.

## Navegador y revisión visual

La suite combina escenarios existentes y nuevos en escritorio de 1440 × 1000 y emulación móvil iPhone 13 sobre Chromium/Chrome. Cubre navegación ClientRouter, persistencia de tema y favoritos, movimiento reducido, almacenamiento no disponible, contenido/metadata sin JavaScript, zoom de fotos, historial, formularios y cuestionario.

Los escenarios de plataforma verifican registro, CSRF, perfil guardado/editado/eliminado, favoritos de cuenta, errores 503 visibles, 404 real, límite 413 del proxy y formulario de recuperación. El flujo administrativo crea organización y mascota técnica, carga una foto, comprueba privacidad previa a aprobación, publica desde la UI, abre la ficha dinámica sin rebuild, registra una solicitud y retira el animal del catálogo. El cierre archiva mascotas y desactiva organizaciones/cuentas técnicas creadas para ese escenario.

Las comprobaciones de accesibilidad con axe y ausencia de desbordamiento se ejecutan en tema claro y neón. Las capturas revisadas están en `reports/previews/intelligence-{matching-desktop,catalog-mobile,account-desktop,admin-desktop}.png`. En móvil se conserva una tarjeta por fila. Esta revisión automatizada y visual no sustituye pruebas con lectores de pantalla y personas usuarias.

Durante iteraciones se corrigieron problemas reales del contrato API, variante de fotos, códigos HTTP de fichas, convivencia combinada, agrupación de otras especies y desbordamiento del formulario móvil con nombres largos. Las repeticiones agotaron el presupuesto persistente de registros: antes de la corrida final se detuvo la API y se borraron exclusivamente los contadores `rate_limits` de la base local, previa comprobación de entorno `development` y ruta dentro del workspace. No se modificaron los límites de producción ni se borraron perfiles o solicitudes.

## Reproducción

Preparar entorno, migrar y cargar únicamente el seed de desarrollo según `README.md`. Iniciar frontend/API por separado. Ejecutar desde la raíz:

```powershell
npm run check
npm run test
npm run build
npm run test:e2e
```

Para los escenarios administrativos, exportar `E2E_ADMIN_EMAIL` y `E2E_ADMIN_PASSWORD` de una cuenta local autorizada antes de Playwright. El archivo local `.env.e2e` generado para esta sesión está ignorado y no forma parte de la entrega pública. El escenario administrativo se omite si estas variables faltan: no equivale a una aprobación del flujo. No ejecutar estas pruebas contra datos de producción.

Desde `backend/`, con modelos preparados:

```powershell
$env:RUN_AI_INTEGRATION='1'
$env:MODEL_CACHE_DIR=(Resolve-Path .data/models).Path
.venv/Scripts/python.exe -m pytest -q
```

Sin el opt-in se omiten las dos pruebas reales de IA. Para repetir E2E esperar las ventanas de los límites si se han agotado; no desactivar las defensas para obtener un resultado verde.

## Mediciones y límites de validación

Se ejecutó el benchmark con 100, 1.000 y 10.000 perfiles ficticios, embeddings reales de doce plantillas repetidas y cinco repeticiones calientes por escenario. La última corrida usa las fuentes definitivas; sus diez hashes SHA-256 coinciden con el JSON. A 10.000 perfiles: búsqueda Lance+BM25 p50 42,9 ms; matching sin Horizon 896,1 ms y con Horizon 1.762,6 ms; pico RSS 986.177.536 bytes, aproximadamente 940,5 MiB. Metodología y exclusiones completas en `PERFORMANCE.md`; no representa una carga HTTP, corpus diverso ni medición del VPS.

Docker Desktop/CLI están instalados, pero el daemon Linux no estuvo accesible. Se validó la composición y se revisaron rutas, versiones y disponibilidad de ruedas Linux; **no se ejecutaron builds ni contenedores Docker, Coolify ni Antel**. Quedan por verificar allí instalación Linux, recursos/cgroups, AVX2 visible, TLS, proxies, backups/restauración operativos y rendimiento bajo concurrencia. Tampoco se validó entrega SMTP real ni se envió el sitemap a un buscador. La indexación pública requiere dominio publicado y no tiene un plazo garantizado.

Antes de recoger datos reales deben configurarse responsable/contacto de privacidad, conservación y procedimiento de derechos. MFA administrativo, mensajería general y funcionalidades sociales quedan fuera de esta etapa y no se presentan como disponibles.
