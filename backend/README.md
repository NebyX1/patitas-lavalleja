# API de Patitas Intelligence

Aplicación FastAPI independiente: Python 3.11, SQLAlchemy 2 y una SQLite. Directorio de trabajo de estos comandos: `backend/`.

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
Copy-Item .env.example .env
.venv\Scripts\python.exe -m app.cli migrate
.venv\Scripts\python.exe scripts/prepare_models.py --model-dir .data/models --onnx-fallback
.venv\Scripts\python.exe -m app.cli seed-demo
.venv\Scripts\python.exe -m app.cli create-admin --email TU_CORREO --name "Tu nombre"
.venv\Scripts\python.exe asgi.py --port 8010
```

En Linux usar `.venv/bin/python` y `cp`. El administrador se crea explícitamente y su contraseña se pide en la terminal (12+ caracteres); también se admite `PATITAS_ADMIN_PASSWORD` en un proceso controlado. No hay contraseñas ni cuentas públicas por defecto. Seed y reset están restringidos a desarrollo/testing.

La configuración de ejemplo habilita IA, pero no descarga los modelos al iniciar. El catálogo y el motor estructurado funcionan con degradación explícita si faltan artefactos. `MODEL_CACHE_DIR` debe coincidir con la preparación.

OpenAPI: `http://127.0.0.1:8010/api/v1/docs`. Salud: `/api/v1/health/live` y `/api/v1/health/ready`. El navegador usa el proxy del frontend en `http://localhost:4321/api/v1` para compartir cookies/origen.

```powershell
.venv\Scripts\python.exe -m app.cli backup data/backups/antes-de-actualizar.sqlite3
.venv\Scripts\python.exe -m app.cli index-pending
.venv\Scripts\python.exe -m app.cli rebuild-index
.venv\Scripts\python.exe -m pytest -q
```

El backup usa la API consistente de SQLite incluso con WAL activo. Las demás tareas CLI requieren detener el servidor que posee el lock del volumen. La reconstrucción también se puede solicitar desde el panel con trabajo persistente y diagnóstico privado.

Los comandos opt-in de inferencia real y benchmarks están en [AI_MODELS](../docs/AI_MODELS.md) y [PERFORMANCE](../docs/PERFORMANCE.md). Los tests unitarios usan directorios temporales y dobles donde corresponde; no suplantan las pruebas de modelos reales.

[API](../docs/API.md) · [Datos](../docs/DATA_MODEL.md) · [Seguridad](../docs/SECURITY.md) · [Matching](../docs/AI_MATCHING.md) · [Despliegue](../docs/deployment.md)
