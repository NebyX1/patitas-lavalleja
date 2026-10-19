# Datos y persistencia

SQLite es la fuente de verdad. LanceDB contiene un índice derivado y reconstruible de texto y vectores públicos; nunca cuentas ni respuestas privadas de adoptantes. Las imágenes WebP viven en un volumen independiente del código, con metadatos y autorizaciones en SQLite.

## Entidades implementadas

| Tabla                     | Responsabilidad e integridad                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                   | ID estable, correo único normalizado, alias, Argon2id, rol `adopter/responsible/admin`, actividad y marca ficticia.                                 |
| `sessions`                | Digest HMAC de token opaco, CSRF, cuenta opcional y expiración. FK con borrado en cascada.                                                          |
| `password_resets`         | Digest de token de un uso, cuenta, expiración y consumo.                                                                                            |
| `organizations`           | Organización, ubicación, descripción, actividad y etiqueta de demostración.                                                                         |
| `memberships`             | Clave compuesta cuenta/organización; permite autorizar cada recurso.                                                                                |
| `adopter_profiles`        | Un documento estructurado por cuenta; respuestas privadas separadas de identidad y datos públicos animales.                                         |
| `person_profiles`         | Presentación privada por cuenta: frase, biografía, localidad y color de avatar; alias y rol permanecen en `users`.                                  |
| `pets`                    | Identidad, organización y creador, campos indexables de catálogo, datos descriptivos JSON, estados, versión, fechas e indicador ficticio.           |
| `compatibilities`         | Filas extensibles por categoría; restricción única mascota/categoría, estado, observación, evaluador, fecha, confianza, contexto y recomendaciones. |
| `photos`                  | ID seguro, mascota, variantes con rutas internas y dimensiones, bytes, texto alternativo y posición.                                                |
| `favorites`               | Clave única cuenta/mascota y fecha; FK en cascada.                                                                                                  |
| `adoption_applications`   | Cuenta, mascota, consentimiento/datos privados aportados, estado, fechas y marca ficticia. Una solicitud por pareja evita duplicados accidentales.  |
| `application_history`     | Estado, actor, nota y fecha de cada cambio.                                                                                                         |
| `application_assessments` | Orientaciones persistentes por solicitud con actor, fecha, versión animal, hash del hogar y resultado explicable; índice por solicitud/fecha.       |
| `audit_logs`              | Actor, operación, recurso, detalle acotado y fecha. No copia perfiles privados completos.                                                           |
| `index_events`            | Outbox persistente, versión de mascota, acción, estado, intentos y próxima fecha de reintento. Unicidad mascota/versión/acción.                     |
| `rate_limits`             | Contadores por ventana con claves HMAC y expiración; no almacena IP ni correo sin hash para estos presupuestos.                                     |
| `cleanup_jobs`            | Intención durable de eliminación de archivos.                                                                                                       |
| `maintenance_jobs`        | Estado durable y resultado de reconstrucciones del índice.                                                                                          |
| `rule_versions`           | Instantánea versionada de pesos del motor estructurado e híbrido.                                                                                   |
| `schema_migrations`       | Versión aplicada y checksum de cada SQL inmutable.                                                                                                  |

Observaciones de personalidad y cuidados se conservan como datos naturales y dimensiones opcionales en `pets.data`; la matriz de convivencia sí tiene filas independientes y trazables. Los valores ausentes permanecen ausentes: ni la búsqueda semántica ni el reranker completan observaciones conductuales.

## Publicación y disponibilidad

Son ejes separados. Publicación: `draft → pending → published/rejected`, con archivo `archived`. Sólo un administrador aprueba publicación y necesita una revisión previa. Una corrección de responsable en ficha publicada vuelve a `pending`. La edición autorizada de un administrador conserva el estado y deja auditoría.

Disponibilidad: `available`, `under_review`, `reserved`, `adopted`, `withdrawn`. Catálogo y matching consultan SQLite y organizaciones activas. El detalle puede conservar enlaces de animales adoptados sin ofrecerlos como disponibles. Concretar una solicitud cambia al animal a adoptado dentro de la misma transacción.

## Escrituras y sincronización

Cada conexión activa claves externas, WAL, `busy_timeout=15000` y `synchronous=NORMAL`. Decisiones de lectura/modificación, consumo de recuperaciones, permisos administrativos críticos y solicitudes usan `BEGIN IMMEDIATE` con transacciones cortas. Las conversiones WebP y la inferencia ocurren fuera de transacciones de escritura.

Una actualización de mascota incrementa `profile_version` y registra `index_events` en la misma transacción. El trabajador reclama eventos, prepara texto y vector, verifica nuevamente versión/disponibilidad, actualiza LanceDB y marca el evento. Los reintentos son idempotentes; un evento antiguo queda superado por la nueva versión. Los eventos `processing` tienen una concesión temporal recuperable. Retirar o archivar un animal impide recomendarlo aunque el índice aún conserve una fila antigua.

La reconstrucción vuelve a derivar texto y vectores desde SQLite; sólo elimina el almacén derivado. Las tareas administrativas quedan registradas y sus fallos no se presentan como éxito. La recuperación automática depende de mantener el volumen de SQLite y ejecutar una sola instancia escritora.

La evaluación de una solicitud libera la lectura inicial antes de inferir. Luego abre una transacción corta `BEGIN IMMEDIATE`, vuelve a verificar cuenta activa, rol, pertenencia, pareja, versión animal y hash del hogar, y guarda el informe con auditoría. Cada evaluación crea una fila nueva. La API devuelve la última y marca `stale` cuando el hogar se edita/elimina o cambia la ficha; no conserva una copia del cuestionario en el informe ni lo incorpora a LanceDB. La orientación no escribe estados de adopción.

## Migraciones, respaldo y demostración

Migraciones: `backend/migrations/001_initial.sql`, `002_maintenance_rules.sql` y `003_person_profiles_assessments.sql`. El ejecutor verifica secuencia y checksum, aplica en transacción y rechaza esquemas futuros. No modifica datos al volver a ejecutarse. No existe un downgrade automático destructivo: para rollback de una migración incompatible se restaura un respaldo consistente y la versión compatible del código.

`python -m app.cli backup RUTA_NUEVA` utiliza la API de backup de SQLite y permite respaldar la base activa sin copiar por separado archivos WAL. Rechaza sobrescribir el origen o un respaldo existente. El respaldo completo también necesita fotografías: para consistencia entre archivos y base se debe detener temporalmente la escritura y respaldar ambos volúmenes. LanceDB se puede reconstruir; los modelos preparados se conservan en su caché persistente.

`seed-demo` y `reset-demo --confirm` sólo se permiten en desarrollo/testing y requieren el servidor detenido por el bloqueo de escritor. No se crean credenciales conocidas. Las fichas y organización ficticias están etiquetadas; las cuentas reales no pueden enviarles solicitudes. `reset-demo` elimina exclusivamente filas ficticias y sus archivos asociados.
