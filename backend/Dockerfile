FROM python:3.11.17-slim-trixie
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=2 OPENBLAS_NUM_THREADS=2 MKL_NUM_THREADS=2 TOKENIZERS_PARALLELISM=false \
    HF_HUB_DISABLE_TELEMETRY=1 DO_NOT_TRACK=1 \
    DATABASE_URL=sqlite:////data/db/patitas.sqlite3 MEDIA_DIR=/data/media \
    LANCEDB_PATH=/data/lance MODEL_CACHE_DIR=/data/models
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 patitas && useradd --uid 10001 --gid 10001 --create-home patitas \
    && mkdir -p /data/db /data/media /data/lance /data/models && chown -R patitas:patitas /data
COPY requirements.lock.txt ./
RUN pip install --no-cache-dir -r requirements.lock.txt
COPY --chown=patitas:patitas app ./app
COPY --chown=patitas:patitas scripts ./scripts
COPY --chown=patitas:patitas migrations ./migrations
COPY --chown=patitas:patitas asgi.py docker-entrypoint.sh ./
RUN chmod 755 /app/docker-entrypoint.sh
USER patitas
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/ready', timeout=4)"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["python", "asgi.py", "--host", "0.0.0.0", "--port", "8000"]
