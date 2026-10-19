# Rendimiento CPU: metodología y mediciones

Medición ejecutada el 18 de octubre de 2026; datos originales en `reports/performance/local-cpu.json`. Host Windows x64, AMD Ryzen 5 5500, 6 núcleos/12 hilos, 17.041.395.712 bytes de RAM y AVX2 visible. Python 3.11; dos hilos de inferencia, un slot, OpenVINO Bekko, Horizon ONNX cuantizado y pool de 12 candidatos. No representa el hardware del VPS de Antel.

## Qué se midió

El script genera 100, 1.000 y 10.000 perfiles explícitamente ficticios desde doce plantillas públicas repetidas. Sus vectores se calculan con Bekko real una vez por plantilla; no son vectores aleatorios. Este diseño mide el crecimiento de la búsqueda exacta, BM25 y evaluación estructurada; no mide el costo de vectorizar 10.000 descripciones diferentes ni calidad de recomendaciones en una población real.

Se realizan cinco repeticiones después de calentamiento. El microbenchmark de embedding desactiva la caché de consulta; matching repetido usa caché caliente. p95 se interpola sobre cinco observaciones: es una exploración local, no un percentil estable de carga de producción. El tiempo de matching incluye reglas, texto, recuperación y reranking, con candidatos ya extraídos en memoria. No incluye transporte HTTP ni lectura completa de perfiles/observaciones desde SQLite. Se mide RSS del proceso cada 50 ms y CPU acumulada. La máquina también aloja herramientas de desarrollo. El JSON conserva hashes SHA-256 de las fuentes utilizadas durante la medición y la versión de reglas.

## Resultados observados

| Perfiles | Lance exacto + BM25 p50 / p95 | Matching sin Horizon p50 / p95 | Matching con Horizon p50 / p95 |
|---:|---:|---:|---:|
| 100 | 10,0 / 26,4 ms | 17,9 / 18,8 ms | 878,7 / 986,5 ms |
| 1.000 | 22,4 / 35,5 ms | 83,9 / 110,4 ms | 976,9 / 1.026,7 ms |
| 10.000 | 42,9 / 51,5 ms | 896,1 / 955,0 ms | 1.762,6 / 1.797,2 ms |

Bekko sobre un documento: p50 9,0 ms, p95 11,2 ms. Horizon sobre doce parejas: p50 700,2 ms, p95 715,3 ms. Primera carga Bekko más doce documentos: 1.512,6 ms. Primera carga Horizon más doce parejas: 4.630,7 ms.

Pico RSS observado: **986.177.536 bytes, aproximadamente 940 MiB**. El proceso consumió 63,6 segundos de CPU durante 40,3 segundos de reloj, equivalente a 158,1% tomando un núcleo como 100%. Esto refleja dos hilos de inferencia, indexación y bibliotecas nativas. No confundir este indicador con 158,1% de toda la máquina.

El benchmark bloqueó correctamente 59, 584 y 5.834 perfiles por especie no aceptada o incompatibilidad ficticia confirmada con gatos; ningún puntaje neural los recuperó. Los componentes reales reportaron disponibles en las búsquedas medidas. No se ejecutó ANN ni se asignaron valores de éxito de adopción.

## Reproducir

Preparar primero los modelos según `AI_MODELS.md`. Desde `backend/`:

```powershell
.venv\Scripts\python.exe scripts/benchmark_cpu.py --counts 100 1000 10000 --repetitions 5 --threads 2 --output ../reports/performance/local-cpu.json
```

```sh
python scripts/benchmark_cpu.py --model-dir /data/models --work-dir /data/benchmarks --output /data/reports/antel-vps.json --counts 100 1000 10000 --repetitions 30 --threads 2
```

El script escribe las observaciones y metadatos realmente producidos. Los archivos Lance de la prueba quedan en `.data/benchmarks`, aislados de la aplicación. Puede ejecutarse con `--backend onnx` después de preparar el fallback; debe compararse sobre el mismo hardware/configuración y sin otros benchmarks simultáneos.

## Límites pendientes

Falta medir sobre CPU virtual de Antel: instrucciones disponibles dentro del contenedor, límites de memoria/cgroups, latencia bajo concurrencia, volumen de fotografías, consultas de API completas, corpus semánticamente diverso, decisiones revisadas por protectoras y restauración operativa de producción. Antes de ajustar pools o agregar ANN, repetir estos escenarios y medir. El costo creciente del matching con 10.000 perfiles justifica mejorar la selección estructurada y consultas SQLite antes de aumentar modelos o servicios.
