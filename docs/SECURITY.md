# Seguridad, privacidad y operación

## Autenticación y autorización

Las contraseñas se derivan con Argon2id, memoria de 19 MiB, dos iteraciones y paralelismo uno para mantener consumo acotado en CPU virtual. Se exige un mínimo de doce caracteres al registrar o cambiar contraseña. Los hashes no se exponen por API.

La cookie `patitas_session` contiene un token aleatorio opaco y usa `HttpOnly`, `Path=/api` y SameSite configurado (`lax` por defecto). SQLite conserva su HMAC SHA-256, no el token. La sesión se rota en registro, acceso y salida. Salir la revoca inmediatamente; cambios de contraseña, desactivación o cambios de permisos revocan sesiones relevantes. Producción exige `SECRET_KEY` de al menos 32 caracteres y `COOKIE_SECURE=true`.

Las rutas de autenticación confirman la transacción antes de devolver la cookie o el resultado. Así, una consulta inmediata de sesión ve el registro, la rotación o la revocación ya persistidos, sin depender de la limpieza posterior de las dependencias HTTP.

Cada mutación con cookies exige un CSRF asociado a sesión y verifica `Origin` cuando se suministra; `Sec-Fetch-Site: cross-site` se rechaza. Los orígenes admitidos son explícitos, sin comodines. Los formularios no guardan contraseñas ni tokens de sesión en localStorage.

El acceso se concentra en `/login/`. El perfil y la búsqueda inteligente redirigen allí cuando falta sesión; una cuenta conectada vuelve a su perfil o al destino interno solicitado. El parámetro `next` rechaza destinos externos, barras invertidas, caracteres de control y retornos a login/API. Cambiar de usuario en la interfaz requiere cerrar sesión. La autorización efectiva del matching sigue en FastAPI.

Roles: visitante explora el catálogo público; una cuenta autenticada puede usar búsqueda inteligente y analizar compatibilidad; adoptante registra perfil, favoritos y solicitudes; responsable sólo gestiona mascotas y solicitudes de sus organizaciones; administrador aprueba publicaciones y administra organizaciones, miembros, cuentas y auditoría. Los controles se realizan en backend en cada recurso. No se puede quitar al último administrador activo. El segundo factor administrativo no está implementado en esta etapa; no se presenta como una protección disponible.

## Acceso ficticio para testing local

El laboratorio local incorpora acceso sin contraseña a trece cuentas ficticias mediante `DEMO_LOGIN_ENABLED=true`. La opción está desactivada por defecto y la configuración rechaza activarla fuera de `development/testing`. La ruta verifica lista explícita de IDs, cuenta activa, bandera ficticia y rol previsto, exige CSRF/origen, limita solicitudes y rota/revoca sesiones. Mantiene autorización por recurso; no acepta IDs de cuentas reales. El seed offline es aditivo y no puede ejecutarse en producción. Nunca habilitar este laboratorio sobre un servicio público con datos reales. Los perfiles y solicitudes del laboratorio permanecen marcados como ficticios.

## Recuperación de acceso

La recuperación requiere SMTP configurado; sin él responde 503 explícito antes de consultar cuentas. Con SMTP, la respuesta es genérica para evitar enumeración de correos. Los enlaces contienen tokens aleatorios válidos treinta minutos, almacenados mediante HMAC y consumidos una sola vez en una transacción serializada. Usan `/login/#reset_token=TOKEN`: el fragmento se interpreta y limpia en el navegador y no se envía al servidor al cargar la página; la confirmación transmite el token en el cuerpo HTTPS. Los enlaces anteriores a `/cuenta/` se trasladan a login mediante fragmento y siguen funcionando. Confirmar un cambio revoca todas las sesiones de la cuenta. SMTP de producción exige STARTTLS; las credenciales permanecen en entorno backend. No se devuelven tokens de recuperación en respuestas de desarrollo ni en logs.

## Entrada, límites y archivos

Pydantic valida tamaños, categorías, rangos y campos admitidos; SQLAlchemy usa parámetros SQL. La búsqueda normaliza tildes y mayúsculas mediante una función SQLite, sin interpolar texto del visitante en SQL. Las sentencias del índice sólo reciben IDs y filtros validados.

Hay límites persistentes en acceso/registro, recuperación, matching, solicitudes y fotografías. Los presupuestos se separan por IP o usuario/correo según el caso y almacenan HMAC, con respuestas 429 y `Retry-After`. Son presupuestos locales de una instancia, no protección distribuida frente a ataques volumétricos. El proxy del despliegue también debe limitar conexiones y tamaño de cargas. Debe configurarse `PROXY_TRUSTED_IPS` a la red o proxy real para que clientes no puedan falsificar su IP mediante cabeceras reenviadas.

Cuerpos JSON: 64 KiB. Multipart: protección global de 13 MiB; imagen de entrada por defecto 12 MiB y 24 megapíxeles. La lectura permite hasta quince segundos entre fragmentos, veinte segundos totales para JSON y sesenta para multipart. Se inspecciona el contenido real, se rechazan archivos animados y MIME incoherente, se verifican dimensiones y decodificación, se corrige EXIF, se convierte ICC a sRGB y se eliminan metadatos antes de generar WebP de 480/960/1600 px. Cada variante tiene tope de bytes y puede reducir resolución. Una sola conversión simultánea limita picos de memoria. Hay cuota configurable y máximo ocho fotos por ficha, con verificación transaccional después de la conversión para evitar carreras.

Los nombres de archivo son UUID aleatorios. Las rutas se resuelven dentro del volumen autorizado y nunca se devuelven al cliente. El backend sólo sirve fotos de fichas públicas u objetos privados cuyo responsable está autenticado. El borrado deja intención recuperable en SQLite. La limpieza de carpetas huérfanas aplica una hora de gracia y valida UUID y directorio raíz; no borra imágenes referenciadas.

## Privacidad y recomendaciones

Los perfiles humanos, correos, contactos y respuestas de solicitudes son privados. Sólo se muestran al titular y a responsables autorizados de esa solicitud. El índice vectorial no contiene adoptantes ni sus datos de contacto. El cuestionario temporal se procesa en memoria sin guardarlo como perfil registrado. No se solicitan nombres, fotografías ni fechas de nacimiento de niños.

La presentación personal se modifica únicamente mediante `/me/identity`, con campos explícitos y sin aceptar roles ni URLs arbitrarias de avatar. No existe un directorio público de personas. El responsable obtiene la presentación y el hogar exclusivamente desde una solicitud de su organización. El informe compartido con el solicitante contiene razones derivadas y el nombre del evaluador; no expone cuentas de otros solicitantes. Las inferencias ocurren en CPU local y la autorización se revalida antes de guardar. Cambiar datos invalida la vigencia del informe, sin reabrir, aprobar ni rechazar solicitudes automáticamente.

Las rutas `/matches/search`, `/matches/evaluate` y `/me/pets/{id}/compatibility` requieren una sesión activa, CSRF y origen permitido; ocultar los controles no es el control de acceso. El análisis personal lee el hogar del titular desde SQLite y verifica de nuevo sesión, hogar y ficha al terminar la inferencia. Las respuestas no se cachean ni se publican en el índice. El informe personal es temporal y no se confunde con una revisión guardada por una asociación. El cliente descarta resultados y cancela peticiones al cambiar de cuenta o salir.

Las respuestas privadas usan `Cache-Control: no-store`. Los errores de validación exponen campos y mensajes, sin reproducir valores sensibles. La auditoría guarda operaciones y recursos, no contraseñas ni respuestas completas del cuestionario. La infraestructura debe evitar registrar cuerpos HTTP o parámetros de recuperación.

El usuario puede eliminar su perfil de compatibilidad y retirar favoritos. La eliminación de una cuenta completa, solicitudes y auditoría no tiene un endpoint automático; requiere el procedimiento autorizado del responsable del servicio, considerando obligaciones de conservación. No hay un borrado programado de solicitudes/auditoría ni una duración legal predeterminada implementada. Antes de producción, la Intendencia debe definir responsable de tratamiento, base y finalidades, destinatarios, plazos, canal de derechos y el procedimiento correspondiente a la normativa uruguaya aplicable. Esta documentación describe controles técnicos y no sustituye esa definición legal.

Referencias oficiales para revisar esa política y el procedimiento de derechos: [URCDP: información para las personas](https://www.gub.uy/unidad-reguladora-control-datos-personales/personas) y [Ley 18.331, artículo 15](https://www.impo.com.uy/bases/leyes/18331-2008/15). La política debe validarla el responsable del servicio; esta implementación no certifica cumplimiento legal.

La puntuación orienta una conversación y no garantiza convivencia ni decide adopciones. Las incompatibilidades observadas aplicables no pueden ser anuladas por similitud semántica. Los estados desconocidos exigen confirmación. La capacidad de atender necesidades del animal tiene prioridad sobre preferencias suaves. Las fichas ficticias permanecen etiquetadas y bloquean solicitudes reales.

## Operación y límites conocidos

- Un worker Uvicorn y una réplica por volumen de SQLite/LanceDB; un bloqueo del volumen evita escritores adicionales. El frontend puede desplegarse por separado.
- Las transacciones no abarcan inferencia ni conversión de fotografías. Los modelos permanecen locales y con concurrencia/hilos acotados. No se descargan desde rutas HTTP.
- Readiness verifica SQLite; los diagnósticos internos de IA e indexación requieren administrador. Una IA degradada no equivale a ausencia de animales compatibles.
- Los backups de SQLite utilizan su API consistente. Para respaldar fotografías junto con la base debe pausarse la escritura. El disco y los backups contienen información privada: los permisos del host, cifrado del volumen/respaldo y política de acceso son responsabilidad del despliegue.
- El borrado editorial archiva fichas y conserva solicitudes e historial. No se requiere eliminar una fila para retirarla del catálogo.
- Mantener dependencias fijadas, revisar actualizaciones de seguridad y probar restauraciones antes de desplegar cambios de esquema. Nunca usar contraseñas de pruebas en producción ni ejecutar seeds ficticios allí.
