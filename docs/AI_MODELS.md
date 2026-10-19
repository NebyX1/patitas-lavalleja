# Modelos locales y CPU

Investigación y verificación local: 18 de octubre de 2026. Se usan modelos locales auditados, sin GPU, APIs externas de inferencia ni modelos generativos.

## Artefactos y licencias

| Componente | Identificador | Revisión fijada | Licencia | Artefacto |
|---|---|---|---|---|
| Embedding | `hotchpotch/bekko-embedding-v1-a8m` | `c721113d59a1d91b447450324f51c4b3332c924a` | MIT | `openvino/openvino_model.xml` y `.bin` |
| Embedding alternativo | mismo Bekko | misma revisión | MIT | `onnx/model.onnx` |
| Reranker | `Horizon-Labs/multilingual-reranker-small` | `c2ec8fb3e499725b168bbed2164bfee095360f77` | Apache-2.0 | `onnx/model_quantized.onnx` |

Se descargan tokenizer/configuración de la misma revisión. El preparador escribe manifiestos SHA-256 y verifica tamaño y hashes LFS publicados. El runtime valida identidad, revisión y presencia/tamaño de artefactos locales; no descarga ni sustituye modelos cuando falta uno.

Tamaños descargados y verificados: Bekko OpenVINO y configuración 164.601.354 bytes; Horizon 302.819.568 bytes; total mínimo 467.420.922 bytes. El fallback Bekko ONNX agrega 130.099.079 bytes: total con ambas rutas 597.520.001 bytes, más manifiestos. No se descargan Safetensors, formatos experimentales ni repositorios completos.

## Bekko

El artefacto oficial usa `input_ids` y `attention_mask`, ambos int64; produce `last_hidden_state[B,T,384]`. El cargador aplica media enmascarada y normalización L2, según la configuración de pooling. Consulta y documento pasan por el mismo procedimiento, sin prefijos asimétricos. El runtime limita cada entrada a 512 tokens para mantener acotado el costo CPU, dentro del contexto admitido por el modelo. Las representaciones públicas priorizan historia, preferencias, actividad y convivencia observada.

Se prefiere OpenVINO sobre CPU, con un stream e `AI_THREADS` configurables. Se comprueba AVX2 en el proceso que ejecuta el modelo: ejecutar la preparación/benchmark dentro del contenedor vuelve a medir sus instrucciones visibles. La detección de Windows no demuestra AVX2 en una VM de Antel.

Si OpenVINO no puede cargar o no hay AVX2, se intenta ONNX del mismo Bekko si fue preparado explícitamente. Si también falta o falla, el servicio informa degradación y conserva reglas y recuperación textual. No cambia silenciosamente a otro modelo. Las exportaciones experimentales `qint8_not_recommended` no se utilizan.

## Horizon

El cargador usa ONNX Runtime con `CPUExecutionProvider`. Forma parejas consulta/documento, limita la consulta a 120 tokens y la pareja a 384, truncando el segundo texto para conservar el contexto entrenado. Lee un logit por pareja y aplica sigmoid para relevancia textual. El ranking final usa posiciones normalizadas y nunca presenta sigmoid como probabilidad de adopción.

Lotes de cuatro y candidatos inicialmente limitados a 12. Carga perezosa, una instancia por configuración de proceso y semáforo compartido con Bekko/indexación. Espera máxima de dos segundos para adquirir inferencia; carga limitada por `MODEL_LOAD_TIMEOUT`; presupuesto de inferencia de hasta 30 segundos, cancelable mediante OpenVINO u ONNX RunOptions. Una carga que excede timeout conserva su future, evitando iniciar cargadores duplicados.

## Dependencias y preparación

`backend/requirements-ai.txt` fija NumPy 2.4.6, tokenizers 0.23.3, ONNX Runtime 1.31.0, OpenVINO 2026.4.1, LanceDB 0.40.0, PyArrow 26.0.0 y psutil 7.2.2. Se instalaron y verificaron sobre Python 3.11 Windows x64. La inferencia directa evita Torch y diferencias entre los ejemplos de Transformers de ambos repositorios. Las ruedas Linux existen, pero deben validarse en la imagen de despliegue real.

Desde `backend/`:

```powershell
.venv\Scripts\python.exe scripts/prepare_models.py --model-dir .data/models
# Preparación adicional para probar o usar fallback ONNX Bekko:
.venv\Scripts\python.exe scripts/prepare_models.py --model-dir .data/models --only bekko --onnx-fallback
```

```sh
# Dentro de un contenedor con el volumen persistente de modelos montado:
python scripts/prepare_models.py --model-dir /data/models --onnx-fallback
```

Preparar una vez y conservar el volumen. Los reinicios solo leen archivos locales. Si se preparan artefactos después de un intento fallido de carga, reiniciar el backend para limpiar su estado de carga. Configuración para usar ambos modelos:

```dotenv
AI_ENABLED=true
RERANK_ENABLED=true
EMBEDDING_BACKEND=openvino
AI_MAX_CONCURRENT=1
AI_THREADS=2
RERANK_POOL_SIZE=12
MODEL_LOAD_TIMEOUT=120
MODEL_CACHE_DIR=/data/models
LANCEDB_PATH=/data/lance
```

Usar un solo worker Uvicorn para evitar duplicar modelos y accesos al índice. El pico local medido fue aproximadamente 940 MiB con el benchmark completo; reservar al menos 2 GiB para el backend con IA y medir el VPS antes de dimensionar producción. No son requisitos mínimos garantizados.

## Verificación real y fuentes

`RUN_AI_INTEGRATION=1 python -m pytest tests/test_ai_real.py -q` comprueba vectores reales normalizados de 384, orden relevante de Horizon y recuperación Lance con esos vectores. Incluye consulta larga y comparación numérica entre las rutas OpenVINO/ONNX Bekko. Los tests de reglas usan dobles solo donde se indica; no se presentan como inferencia real.

Fuentes primarias: [Bekko y sus instrucciones](https://huggingface.co/hotchpotch/bekko-embedding-v1-a8m), [Horizon y su límite entrenado](https://huggingface.co/Horizon-Labs/multilingual-reranker-small), [OpenVINO CPU](https://docs.openvino.ai/nightly/openvino-workflow/running-inference/inference-devices-and-modes/cpu-device.html), [LanceDB Python](https://lancedb.github.io/lancedb/python/python/). Los resultados propios están en `docs/PERFORMANCE.md` y `reports/performance/`.
