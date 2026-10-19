# Contrato REST de Patitas Intelligence

Base: `/api/v1`. OpenAPI generado por FastAPI: `/api/v1/openapi.json`; documentación interactiva: `/api/v1/docs`. El navegador usa `/api/v1` en el mismo origen. Astro redirige al backend interno; no se incluyen secretos ni direcciones Docker en componentes.

## Formato, sesión y errores

JSON UTF-8. Los listados paginados devuelven `{items,total,page,page_size,pages}`. Las páginas comienzan en 1. El catálogo admite hasta 48 resultados por página. Los errores usan `{error:{code,message,details?}}`; `details` contiene campos y mensajes de validación, nunca contraseñas ni valores privados completos.

1. `GET /auth/session` obtiene una sesión y `csrf_token`.
2. Todas las mutaciones autenticadas y las operaciones de acceso envían `X-CSRF-Token`, cookie de sesión y, desde el navegador, credenciales incluidas.
3. El servidor verifica el origen contra la lista configurada. Al ingresar, registrarse o salir cambia la sesión y el cliente conserva el nuevo CSRF.

Respuesta de sesión: `{authenticated,user,csrf_token,recovery_available?}`. Usuario: `{id,email,display_name,role,is_demo,organization_ids}`. Los campos privados se sirven sólo al titular o a responsables autorizados.

## Acceso local de testing

`GET /auth/demo-users` devuelve `{enabled,items:[{id,display_name,role,description}]}`. Sin el flag explícito devuelve `enabled:false` y lista vacía. `POST /auth/demo-login` recibe `{user_id}` y devuelve una sesión normal nueva. Exige CSRF/origen y limita cambios a 120 por minuto. Solo admite usuarios activos, `is_demo=true`, IDs de la lista de fixtures y el rol previsto; no permite entrar a una cuenta real usando su ID. La sesión anterior se revoca y la nueva conserva las autorizaciones habituales por organización.

Requiere `DEMO_LOGIN_ENABLED=true` y entorno `development` o `testing`. Configurar ese flag en cualquier otro entorno se rechaza al iniciar. Los fixtures se crean mediante el comando offline `python -m app.cli seed-testing`; no se generan usuarios ni datos desde una petición pública.

## Catálogo público

| Método y ruta                     | Resultado                                                                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /pets`                       | Catálogo publicado de organizaciones activas; disponibilidad `available` por defecto.                                                                                              |
| `GET /pets/{id}`                  | Ficha pública completa, incluyendo disponibilidad real. Una ficha adoptada puede conservar su enlace; borradores, retiradas editoriales y organizaciones inactivas no se publican. |
| `GET /filters`                    | `{species,locations,departments,organizations:[{id,name}],compatibility_categories}`.                                                                                              |
| `GET /media/{photo_id}/{variant}` | Fotografía WebP autorizada. Variantes `card`, `detail`, `full`.                                                                                                                    |

Parámetros combinables de catálogo: `species`, `location`, `department`, `stage`, `size`, `sex`, `energy=low|medium|high`, `query`, `sort=default|name|age|senior|recent`, `page`, `page_size`, `organization_id`, `compatibility_category`, `compatibility_categories`, `compatibility_status=compatible|conditional|unknown|incompatible|not_applicable`, `trait`, `special_care`, `secure_outdoor`, `availability=available|under_review|reserved|adopted|withdrawn|all`, `ids` separados por comas (hasta 100, con resultados paginados).

`compatibility_categories` admite hasta doce categorías separadas por comas (máximo 600 caracteres). Se aplica AND: cada categoría debe cumplir el estado común `compatibility_status`. El parámetro anterior `compatibility_category` sigue funcionando y se suma a la selección. Ejemplo: `species=dog&energy=low&compatibility_categories=cats,young_children&compatibility_status=compatible` exige observaciones compatibles tanto con gatos como con niños pequeños. Un estado desconocido o una evaluación faltante no satisface este filtro positivo. Si el estado solicitado es `unknown`, cada categoría admite una fila desconocida o ausencia de evaluación.

`query` busca nombre, localidad, historia y rasgos sin distinguir mayúsculas ni tildes. Los filtros operan sobre SQLite; no se filtra un array ficticio en el navegador. Energía baja representa observaciones 0–2, media 3 y alta 4–5. La ausencia de observaciones no satisface un filtro positivo. Convivencia `unknown` incluye evaluaciones explícitamente desconocidas y categorías sin evaluación registrada.

`species=other` representa la pestaña «Otras especies»: selecciona todas las especies publicadas diferentes de `dog` y `cat`. Las consultas específicas como `species=rabbit` o `species=bird` mantienen coincidencia exacta.

### Ficha pública

Conserva el contrato visual del portal: `id,name,species,age,months,stage,size,sex,location,tag,tagIcon,tagColor,energy,pos,quote,traits,story,needs,dogs,cats,children,smallSpace,care,alt`. Añade `department,breed,adult_size,weight_kg,organization_id,organization,publication_status,adoption_status,profile_version,is_demo,personality,requirements,compatibilities,photos,created_at,updated_at`.

`photos` contiene `{id,alt,position,variants:{card:{url,width,height},detail:{...},full:{...}}}`. Nunca expone rutas de disco. Para perfiles nuevos sin imagen se utiliza el recurso visual de ausencia de fotografía, sin inventar una foto del animal.

`personality` conserva observaciones naturales y dimensiones observadas opcionales 0–5: sociabilidad, independencia, compañía, juego, afecto, curiosidad, exploración, sensibilidad a ruidos, adaptación e interacción. Los valores desconocidos son `null`.

`requirements` permite `activity_minutes`, `mental_stimulation_minutes`, `max_hours_alone`, `secure_outdoor_required`, `special_care`, `special_care_required`, `training_level` (0–5 o null), `training_notes`, `small_space_compatible`, `mobility_needs`, `grooming`, `treatment`, `only_pet`, `gradual_introduction`, `mandatory_care` y `environment`.

Cada convivencia contiene `{category,status,observation,responsible,confidence,evaluated_at,context,recommendations}`. Las categorías son extensibles. Las canónicas incluyen `dogs,cats,birds,rabbits,small_mammals,other_pets,young_children,school_children,teenagers,adults,frequent_visitors,busy_home,quiet_home`. El estado admite los cinco valores del filtro; confianza es 0–1 o null. Una observación desconocida no es una garantía.

## Acceso y perfiles

| Método y ruta                       | Cuerpo o respuesta                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/register`               | `{email,password,display_name}`; crea exclusivamente rol `adopter` y devuelve sesión.                                        |
| `POST /auth/login`                  | `{email,password}`; devuelve sesión nueva.                                                                                   |
| `POST /auth/logout`                 | Revoca la sesión y devuelve sesión anónima nueva.                                                                            |
| `POST /auth/password-reset/request` | `{email}`; mensaje indistinguible para correos existentes e inexistentes. Sin SMTP configurado devuelve 503 explícito.       |
| `POST /auth/password-reset/confirm` | `{token,password}`; token de un uso y 30 minutos. Revoca todas las sesiones de la cuenta.                                    |
| `GET /me`                           | Usuario actual.                                                                                                              |
| `GET /me/dashboard`                 | Presentación privada, hogar, completitud, favoritos, solicitudes con evaluación y organizaciones autorizadas con contadores. |
| `PATCH /me/identity`                | `{display_name,headline,biography,location,avatar_color}`; edita la presentación del titular, nunca su rol o permisos.       |
| `GET /me/profile`                   | `{profile:null                                                                                                               | objeto,updated_at:null | fecha}`. |
| `PUT /me/profile`                   | Perfil estructurado directo; devuelve el mismo sobre.                                                                        |
| `DELETE /me/profile`                | Elimina el cuestionario guardado del titular.                                                                                |

El correo de recuperación abre `/login/#reset_token=TOKEN`. El panel lee y limpia el fragmento y envía el token únicamente en el cuerpo de confirmación. El fragmento evita incluirlo en la URL enviada al servidor para cargar la página. Los enlaces anteriores a `/cuenta/#reset_token=TOKEN` siguen funcionando y se trasladan al panel de recuperación.

Perfil humano: `display_name,species[],sizes[],stages[],activity_level,activity_minutes,hours_away,experience,training_commitment,housing_type,secure_outdoor,household_animals[],children_age_groups[],household_confirmed,special_care_capacity,preferred_traits[],location,department,flexibility,preferences_text,home_activity,frequent_visitors,willing_to_travel,accept_seniors`. Todos pueden quedar sin completar mediante null, listas vacías o texto vacío según OpenAPI. La lista vacía de convivientes sólo queda confirmada mediante `household_confirmed=true`; omitirla requiere revisión. No se aceptan nombres ni fechas de nacimiento de menores. `housing_type` admite null. Horas fuera: 0–24; actividad: 0–1440 minutos; dimensiones de preferencias: 0–5.

La presentación admite nombre de 1–80 caracteres, frase de hasta 100, biografía de hasta 1.200, localidad de hasta 80 y color `peach|lime|lilac|blue`. Editar nombre/localidad sincroniza esos datos con el hogar ya existente; no crea un cuestionario ni confirma condiciones. El dashboard es exclusivo del titular, sin rutas públicas para buscar personas. La completitud del hogar es un indicador de campos respondidos, independiente de la evaluación de una pareja.

## Favoritos y solicitudes

- `GET /me/favorites`: `{items,pet_ids,total}` con fichas publicadas actualmente. `POST /me/favorites` recibe `{pet_id}` y es idempotente; `DELETE /me/favorites/{pet_id}` retira el favorito.
- `POST /adoptions/applications`: `{pet_id,message,consent:true,phone?,locality?}`. Exige cuenta, consentimiento y disponibilidad actual. El mensaje tiene 10–5000 caracteres. Una restricción única y transacción de escritura evitan duplicados por persona/mascota, incluso ante peticiones simultáneas.
- `GET /me/applications`: `{items,total}`. Incluye ID, mascota, nombre, estado, fechas, `is_demo`, datos aportados e historial de estados del titular.

Cada solicitud incluye `assessment:null|objeto`: la última orientación guardada por el equipo, visible también en el dashboard del solicitante.

Las cuentas reales no pueden enviar solicitudes sobre fichas ficticias. No existe aceptación ni rechazo automático por matching. Estados: `received`, `under_review`, `information_requested`, `meeting_scheduled`, `approved`, `rejected`, `closed`, `completed`. Las transiciones del flujo se validan y una adopción concretada actualiza la disponibilidad de la mascota en la misma transacción.

## Matching

`POST /matches/evaluate` y `POST /matches/search` reciben `{profile,query?,limit?,pet_id?}`. Requieren sesión autenticada, CSRF y origen permitido, con límite de frecuencia. Las respuestas usan `Cache-Control: no-store`. No guardan el cuestionario a menos que se envíe expresamente a `/me/profile`. Si se especifica `pet_id`, se devuelve `{pet,match}` para esa ficha publicada. Sin ID, se devuelven `{results:[{pet,match}],total,excluded,meta}`. Un visitante anónimo recibe 401, incluso si llama directamente a la API.

Sin `pet_id`, `Accept: application/x-ndjson` habilita progreso en vivo por la misma ruta. Cada línea es un registro JSON: `{type:"progress",stage,state,elapsed_ms,...conteos}`, `{type:"heartbeat"}`, `{type:"result",data:RESULTADO}` o `{type:"error",code,message}`. Las etapas son `structured`, `embedding`, `retrieval`, `reranker` y `ranking`; los estados son `running`, `complete`, `unavailable`, `disabled` y `not_used`. Los registros de progreso contienen únicamente estados y conteos agregados, sin textos del hogar, vectores ni información de otras personas. Los errores posteriores al inicio del stream se notifican dentro del protocolo y no producen resultados parciales.

La sesión y la publicación/versionado de las fichas se revalidan antes del resultado. La respuesta incluye `X-Accel-Buffering: no`; el proxy transmite el cuerpo sin acumularlo. Al desconectar se deja de programar la siguiente etapa; una inferencia nativa ya iniciada termina dentro de los límites existentes. Los consumidores JSON anteriores conservan su contrato.

`POST /me/pets/{pet_id}/compatibility` analiza la ficha visible usando exclusivamente el hogar guardado de la cuenta activa. No acepta un perfil ni una identidad del cliente como fuente de evaluación. Requiere sesión/CSRF, responde 409 si falta el hogar y 404 si la ficha no es pública. Usa el mismo motor bidireccional, con reglas antes de IA; informa `pet_id,pet_version,created_at,profile_updated_at,decision,label,summary,match,meta,availability,conversation_points,notice`. El estado real de disponibilidad se informa aparte. No guarda una evaluación de responsable, no crea solicitudes y no cambia su estado. Revalida sesión, versión y hash del hogar después de inferir; cambios de datos producen 409 y una sesión revocada produce 401. Límite de 20 análisis por minuto por cuenta.

Los resultados distinguen `eligible`, `needs_review`, `blocked` y `unavailable`; los bloqueados no se recomiendan. La afinidad de preferencias y la capacidad del hogar permanecen separadas. Los puntajes desconocidos pueden ser null. `meta` informa componentes, degradación, advertencias, versión de reglas y duración. Después de inferencia se vuelve a verificar publicación, disponibilidad, organización y versión en una transacción nueva de SQLite. Un fallo de IA conserva reglas y búsqueda textual, con aviso explícito.

## Administración y responsables

Todas las rutas requieren sesión y permisos reales. Un responsable sólo administra organizaciones a las que pertenece; un administrador puede actuar sobre todas.

| Método y ruta                                                | Permiso y comportamiento                                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/pets`, `GET /admin/pets/{id}`                    | Fichas autorizadas de cualquier estado. Listado paginado.                                                                          |
| `POST /admin/pets`                                           | Crea borrador. Requiere al menos `organization_id,name,species,location`; admite los campos enriquecidos de `PetInput` en OpenAPI. |
| `PUT /admin/pets/{id}`                                       | Reemplaza datos editables; acepta `profile_version` para detectar edición obsoleta (409).                                          |
| `POST /admin/pets/{id}/submit`                               | Envía borrador o rechazo a revisión; exige historia y necesidades.                                                                 |
| `POST /admin/pets/{id}/publication`                          | Sólo administrador: `{status:published                                                                                             | rejected     | archived,note?}`. Publicar requiere revisión previa. |
| `PATCH /admin/pets/{id}/status`                              | Responsable autorizado: `{status:available                                                                                         | under_review | reserved                                             | adopted | withdrawn,note?}`. |
| `DELETE /admin/pets/{id}`                                    | Archiva y retira del catálogo; conserva historial y solicitudes.                                                                   |
| `POST /admin/pets/{id}/photos`                               | Multipart `file`, `alt?`; máximo ocho fotos por ficha.                                                                             |
| `DELETE /admin/pets/{id}/photos/{photo_id}`                  | Elimina vínculo y conserva intención de limpieza recuperable.                                                                      |
| `GET /admin/organizations`                                   | Organizaciones autorizadas, sobre paginado.                                                                                        |
| `POST /admin/organizations`, `PUT /admin/organizations/{id}` | Administrador; `{name,description?,locality?,department?,active?}`.                                                                |
| `POST /admin/organizations/{id}/members`                     | Administrador; `{user_id}`. Asigna permisos de responsable y revoca sesiones si cambia rol.                                        |
| `DELETE /admin/organizations/{id}/members/{user_id}`         | Administrador.                                                                                                                     |
| `GET /admin/users`, `PATCH /admin/users/{id}`                | Administrador; cambio `{role?,active?}`. No permite quitar al último administrador activo.                                         |
| `GET /admin/applications`, `PATCH /admin/applications/{id}`  | Responsable autorizado; cambio `{status,note?}` con historial.                                                                     |
| `GET /admin/applications/{id}/review`                        | Presentación y hogar del solicitante de esa solicitud, ficha animal y última orientación; permisos por organización.               |
| `POST /admin/applications/{id}/compatibility`                | Genera y guarda una orientación con el motor existente. Exige CSRF; límite de 20 por minuto y responsable.                         |
| `GET /admin/audit`                                           | Administrador; listado paginado sin contraseñas, tokens ni contenido del cuestionario.                                             |

Editar una ficha publicada como responsable la devuelve a revisión. La edición explícita de un administrador conserva publicación; queda auditada. Las organizaciones de demostración fuerzan `is_demo=true` y una petición no puede convertir sus animales ficticios en reales.

La orientación devuelve `id,created_at,evaluated_by,pet_version,stale,decision,label,summary,match,meta,conversation_points,availability,notice`. `match.home_score` expresa Hogar → Animal y `match.preference_score` Animal → Persona; pueden ser `null`. Las decisiones orientativas son `favorable`, `review_required`, `incompatible` e `insufficient_information`. No cambian el estado de la solicitud ni la disponibilidad. `stale` compara versión animal y hash del hogar actual. Si los datos cambian durante la inferencia se rechaza con 409; si se retiran permisos, con 403. `meta` informa degradación y componentes realmente utilizados, sin afirmar IA disponible cuando faltan los pesos.

## Operación

- Públicos: `GET /health/live`, `GET /health/ready`; alias de readiness `/api/health`.
- Sólo administrador: `GET /system/ai`, `GET /system/index`.
- Sólo administrador con CSRF: `POST /system/index/rebuild`. Devuelve 202 inmediato `{job_id,status:queued}` y ejecuta una única tarea controlada. `/system/index.jobs` informa `queued/running/completed/failed`; los errores mantienen eventos pendientes. Un reinicio marca la tarea interrumpida y permite repetirla.

Los cuerpos JSON tienen un límite global de 64 KiB. Multipart tiene 13 MiB como protección global, con validación de imagen de 12 MiB por defecto. Registro, acceso, recuperación, matching, solicitudes y subidas tienen presupuestos de peticiones persistentes; 429 incluye `Retry-After`. Los valores operativos y OpenAPI corresponden al código vigente.
