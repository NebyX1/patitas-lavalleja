# Patitas Intelligence: compatibilidad explicable

## Alcance y responsabilidad

El motor `backend/app/domain/matching/` funciona sin modelos, sin entrenamiento histórico y sin datos de adopciones inventados. Su índice expresa un ajuste orientativo entre observaciones registradas y posibilidades del hogar. No es una probabilidad de adopción exitosa, diagnóstico ni decisión automática de aprobación. Una persona responsable revisa las condiciones y la solicitud.

SQLite conserva observaciones, autor, contexto, fecha, confianza y versión. Los embeddings nunca crean compatibilidades conductuales. Los campos desconocidos no se transforman en observaciones positivas ni en incompatibilidades.

## Primera capa: condiciones indispensables

`evaluate_match(pet, profile)` devuelve `eligible`, `needs_review`, `blocked` o `unavailable`:

- Publicación distinta de `published` o adopción distinta de `available`: `unavailable`.
- Si se eligieron especies aceptadas explícitas, una especie distinta queda bloqueada para esa búsqueda. Una lista vacía significa apertura a diferentes especies.
- El grupo `other` acepta especies publicadas distintas de perros y gatos, por ejemplo conejos y aves.
- `household_confirmed` exige confirmar la composición del hogar: listas vacías sin confirmación quedan pendientes de revisión, no certifican ausencia de otros animales o niños.
- Incompatibilidad observada aplicable a perros, gatos, aves, conejos, pequeños mamíferos u otra categoría presente en el hogar: `blocked`.
- Lo mismo se aplica a niños pequeños, escolares, adolescentes y otras categorías extensibles de convivencia.
- Espacio exterior seguro expresamente indispensable, cuidados especiales expresamente indispensables o necesidad observada de ser mascota única pueden bloquear si el hogar declara que no puede cumplirlos.
- Convivencia condicional, desconocida o no evaluada: `needs_review`. Un dato `not_applicable` no certifica convivencia cuando esa categoría sí está presente en el hogar consultante.
- Una compatibilidad positiva antigua sin observación que la respalde también requiere revisión; no genera una afirmación de antecedentes positivos.
- Cuidados indispensables todavía sin confirmar, presentación gradual requerida y diferencias importantes de actividad o compañía: revisión explícita.

No se deduce que un perro grande necesita patio. La condición debe estar registrada en `requirements`. Tamaño y edad preferidos son señales suaves. Elegir ampliar especies aceptadas requiere una modificación expresa del visitante, nunca una relajación silenciosa.

## Segunda capa: funciones difusas

Los parámetros y pesos se centralizan en `matching/rules.py`, versión inicial `2026-10-18.1`. Son parámetros de ingeniería que necesitan revisión con protectoras y profesionales; no se presentan como calibración científica.

La pertenencia de actividad suficiente es `min(1, minutos_ofrecidos / minutos_necesarios)`. Ofrecer 60 minutos para una necesidad estimada de 70 produce 0,857, no una incompatibilidad binaria. El ajuste de compañía vale 1 dentro del tiempo a solas observado y disminuye linealmente durante las seis horas posteriores. La energía usa cercanía gradual en la escala 0–5. El módulo también contiene funciones triangulares y trapezoidales verificadas para extender reglas sin otra biblioteca.

La inferencia agrega pertenencias conocidas mediante una media ponderada de consecuentes continuos, equivalente a un sistema Sugeno de orden cero con consecuentes 0/1 para las reglas de suficiencia e insuficiencia. No se imputan valores a observaciones faltantes: se excluyen del denominador y se informa lo que falta.

Adecuación del hogar: actividad 0,32; compañía 0,25; entrenamiento 0,13; capacidad de cuidados 0,17; condiciones específicas del entorno 0,13. Afinidad humana: energía 0,35; especie 0,15; tamaño 0,10; etapa 0,10; rasgos deseados 0,20; cercanía por localidad 0,10. El índice estructurado combina hogar 70% y afinidad 30%; si solo existe una dimensión, se conserva esa dimensión y se muestra la incompletitud. Sin dimensiones conocidas, el índice es `null`.

La completitud y confianza informativa cuentan campos conocidos y categorías observadas; están separadas del índice. Un ajuste alto con pocos datos sigue mostrando baja confianza y condiciones por confirmar. Las razones positivas, alertas y desconocidos salen directamente de reglas y datos; no se generan con un LLM.

## Tercera capa: recuperación y ranking

1. La API obtiene fichas publicadas de organizaciones activas desde SQLite.
2. Evalúa reglas y funciones difusas. Los bloqueados/no disponibles no entran en inferencia.
3. Bekko convierte la consulta pública en vector normalizado de 384 dimensiones. La caché de consultas guarda hasta 128 vectores durante 300 segundos, solo en memoria.
4. LanceDB combina búsqueda exacta cosine y BM25 con español, stemming y normalización de acentos. BM25 local acotado mantiene encontrables las fichas nuevas aún sin embedding.
5. RRF fusiona posiciones, usando `k=60`, y normaliza por el máximo teórico. Nunca se suman directamente cosine, BM25 y logits.
6. El conjunto neural reserva al menos la mitad para los mejores candidatos estructurados. Incluye hasta `RERANK_POOL_SIZE`, inicialmente 12. El resto de candidatos estructurados continúa participando del ranking final.
7. Horizon reordena parejas consulta/descripción en lotes de cuatro. Su señal también se normaliza por posición; no es probabilidad de convivencia.
8. Ranking final: 80% estructura, 12% recuperación, 8% reranking. Los componentes ausentes se excluyen y los pesos disponibles se renormalizan. `eligible` se presenta antes de `needs_review`; ninguna señal neural cambia elegibilidad.
9. La API vuelve a consultar SQLite después de la inferencia. Si una ficha cambia de versión, estado u organización activa, el resultado obsoleto se omite.

## Progreso visible de la búsqueda

El modal del cuestionario recibe eventos de las etapas reales del servicio mediante NDJSON. La interfaz presenta estas etapas con textos sobre el hogar, las preferencias, las historias disponibles y las afinidades; no muestra nombres de modelos, bibliotecas ni otros detalles de implementación. Informa las funciones no requeridas o indisponibles; el contador expresa etapas resueltas, sin simular porcentajes de inferencia. Los conteos de perfiles y candidatos provienen de las evaluaciones realizadas. Los informes y paneles de gestión también usan lenguaje de producto; los avisos de degradación y errores no reproducen diagnósticos internos ni metadatos recibidos desde la API.

La inferencia empieza de inmediato. La interfaz mantiene una presentación mínima de 1,4 segundos y una confirmación de 0,8 segundos para las búsquedas rápidas; esos tiempos son únicamente de lectura visual, no representan trabajo adicional de modelos. Escape o Cancelar interrumpe la petición y descarta su resultado; los errores permiten reintentar con las mismas respuestas. El modal contiene el foco y respeta el movimiento reducido y el tema neón.

En una ficha animal, el análisis personal reutiliza el modal con textos de esa pareja y una presentación mínima de 2,2 segundos más 0,8 segundos de confirmación. El endpoint de pareja conserva su respuesta JSON: mientras espera, la animación es indeterminada; al recibir el informe, muestra los estados confirmados con etiquetas sobre el hogar y las afinidades. Una incompatibilidad resuelta por reglas identifica las etapas adicionales como no requeridas. La espera visual también puede cancelarse después de recibir la respuesta, sin publicar un informe tardío. No se añade demora al servidor ni se modifica el cálculo.

## Revisión de una solicitud existente

`services/assessment.py` reutiliza este motor para evaluar una pareja concreta desde el panel responsable. Ejecuta primero las reglas estrictas y sólo usa el recorrido de IA cuando la pareja no está bloqueada. Las explicaciones y los dos ejes siguen derivados de observaciones/condiciones; ni los logits ni la similitud se convierten en una probabilidad. La ausencia de pesos conserva la evaluación estructurada e informa degradación.

Para una pareja concreta, disponibilidad y encaje son hechos separados: una reserva o revisión no impide conversar sobre convivencia. Se evalúa una copia en memoria con disponibilidad habilitada y se devuelve el estado real por separado, sin publicar borradores ni modificar SQLite. Este recorrido se usa en solicitudes existentes y en el análisis personal de una ficha pública. La búsqueda de candidatos disponibles mantiene su filtro de disponibilidad. La orientación del responsable se guarda con versión animal, hash del hogar, reglas y estado de modelos. Exige actualizarse cuando los datos cambian. El análisis personal es temporal, requiere sesión y usa el hogar guardado del titular.

`favorable` requiere elegibilidad, hogar ≥75, preferencias ≥50 cuando se conocen, hogar confirmado y completitud de pareja ≥0,45. Datos esenciales ausentes dan `insufficient_information`; una regla estricta bloqueante da `incompatible`; los demás casos dan `review_required`. Son umbrales de ingeniería para orientar revisión humana, no calibración con resultados reales de adopción.

## Sincronización y reconstrucción

Cada modificación de ficha registra un `OutboxEvent` en la misma transacción SQLite, con ID y versión. `jobs/indexer.py` reclama lotes de hasta ocho, con arrendamiento recuperable de cinco minutos. Los eventos antiguos se marcan como superados, sin restaurar versiones previas. La inferencia ocurre fuera de las transacciones de escritura. El índice usa upsert por ID; los reintentos son idempotentes. Un fallo conserva el evento como `failed`, con backoff exponencial hasta 30 minutos.

Las fichas retiradas, adoptadas o de organizaciones inactivas se eliminan del índice. Si la IA está desactivada, puede indexarse texto con vector `null`: nunca se fabrica un embedding. El evento queda pendiente de completar mediante reintento.

`python -m app.cli rebuild-index` elimina únicamente datos derivados de LanceDB y reconstruye desde SQLite. No elimina perfiles, solicitudes ni observaciones. La tabla incorpora un hash del identificador, revisión y dimensión del modelo: no mezcla espacios vectoriales incompatibles.

## Extender una regla

Para agregar convivencia con una nueva especie, registrar una categoría estable y sus observaciones en SQLite; agregar una etiqueta y, cuando corresponda, un alias en `matching/rules.py`. La misma categoría debe llegar en `household_animals`. El evaluador ya distingue compatible, incompatible, condicional y desconocido sin una migración por especie.

Para agregar una dimensión difusa, definir qué observación animal y qué respuesta del hogar la sustentan, crear su función de pertenencia y peso centralizado, y producir razones deterministas. Agregar casos de frontera, dato faltante y contradicción con una regla estricta. Versionar las reglas y conservar las anteriores en el historial de cambios. No usar una descripción vaga para inferir una necesidad clínica.

## Pruebas

`tests/test_matching.py` cubre incompatibilidades aplicables/no aplicables, categorías animales y edades infantiles, desconocidos, condiciones, actividad gradual, compañía, espacios, cuidados, preferencias suaves y estados. `test_ai.py` verifica fallback, exclusión de bloqueados, privacidad del texto y Lance real. `test_indexer.py` cubre idempotencia, reconstrucción, retirada, eventos obsoletos y recuperación del arrendamiento. La integración con modelos reales es optativa mediante `RUN_AI_INTEGRATION=1`.
