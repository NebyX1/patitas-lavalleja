import asyncio
from contextlib import asynccontextmanager, suppress
import logging
from pathlib import Path
import time

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import admin, auth, catalog, intelligence, me, reviews
from app.core.config import Settings, get_settings
from app.core.runtime import RuntimeLock
from app.core.security import current_user, get_db, load_secret, session_row
from app.db.migrations import migrate
from app.db.models import CleanupJob, MaintenanceJob, Organization, Pet, Photo, RuleVersion
from app.db.session import make_engine, make_session_factory
from app.services.pets import can_manage
from app.storage.service import ImageStorageError, ImageStore

log = logging.getLogger("patitas")


class BodyTooLarge(HTTPException):
    def __init__(self):
        super().__init__(413, "La solicitud supera el tamaño permitido.")


class SafetyHeaders:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        cap = 13 * 1024 * 1024 if b"multipart/form-data" in headers.get(b"content-type", b"") else 64 * 1024
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            length = cap + 1
        error = JSONResponse({"error": {"code": "body_too_large", "message": "La solicitud supera el tamaño permitido."}}, status_code=413)
        if length > cap:
            return await error(scope, receive, send)
        consumed, started, body_complete = 0, False, False
        deadline = time.monotonic() + (60 if cap > 65536 else 20)

        async def limited_receive():
            nonlocal consumed, body_complete
            # After upload, StreamingResponse only listens for disconnects.
            # Its lifetime must not inherit the JSON-body upload deadline.
            if body_complete:
                return await receive()
            try:
                value = await asyncio.wait_for(receive(), timeout=max(0.001, min(15, deadline - time.monotonic())))
            except TimeoutError:
                raise HTTPException(408, "La carga tardó demasiado. Volvé a intentarlo.") from None
            consumed += len(value.get("body", b""))
            if consumed > cap:
                raise BodyTooLarge()
            if value["type"] == "http.request" and not value.get("more_body", False):
                body_complete = True
            return value

        async def secured_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                no_cache = scope["path"].startswith(("/api/v1/auth", "/api/v1/me", "/api/v1/admin", "/api/v1/system", "/api/v1/matches"))
                message["headers"] = [*message.get("headers", []), (b"x-content-type-options", b"nosniff"), (b"x-frame-options", b"DENY"), (b"referrer-policy", b"strict-origin-when-cross-origin")]
                if no_cache:
                    message["headers"].append((b"cache-control", b"no-store"))
            await send(message)
        try:
            await self.app(scope, limited_receive, secured_send)
        except BodyTooLarge:
            if not started:
                await error(scope, receive, send)
            else:
                raise


def create_app(settings: Settings | None = None):
    settings = settings or get_settings()
    engine = make_engine(settings.database_url)
    factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(app):
        lock_path = Path(settings.database_url.removeprefix("sqlite:///")).parent / ".runtime.lock"
        lock = RuntimeLock(lock_path)
        task = None
        try:
            migrate(engine)
            app.state.media = ImageStore(settings)
            app.state.media.cleanup_pending()
            with factory() as db:
                app.state.media.cleanup_unreferenced(set(db.scalars(select(Photo.id))))
                for job in db.scalars(select(CleanupJob)):
                    if not db.get(Photo, job.path):
                        app.state.media.delete(job.path)
                    db.delete(job)
                for job in db.scalars(select(MaintenanceJob).where(MaintenanceJob.status.in_(["queued", "running"]))):
                    job.status, job.error = "failed", "La tarea se interrumpió durante un reinicio. Los eventos pendientes se conservan; podés volver a solicitar la reconstrucción."
                from app.domain.matching.rules import RULES_VERSION, HOME_WEIGHTS, PREFERENCE_WEIGHTS, HOME_SHARE, RANKING_WEIGHTS
                if not db.get(RuleVersion, RULES_VERSION):
                    db.add(RuleVersion(version=RULES_VERSION, parameters={"home_weights": HOME_WEIGHTS, "preference_weights": PREFERENCE_WEIGHTS, "home_share": HOME_SHARE, "ranking_weights": RANKING_WEIGHTS}))
                db.commit()
            from app.ai.search import IntelligenceService
            app.state.intelligence = IntelligenceService(settings)
            app.state.maintenance_tasks = set()
            app.state.search_tasks = set()

            async def index_loop():
                while True:
                    try:
                        if settings.ai_enabled:
                            from app.jobs.indexer import process_outbox
                            await run_in_threadpool(process_outbox, factory, settings)
                    except asyncio.CancelledError:
                        raise
                    except Exception as exc:
                        log.warning("Indexing temporarily unavailable (%s)", type(exc).__name__)
                    await asyncio.sleep(settings.index_poll_seconds)
            task = asyncio.create_task(index_loop())
            yield
        finally:
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
            if getattr(app.state, "maintenance_tasks", None):
                await asyncio.gather(*app.state.maintenance_tasks, return_exceptions=True)
            if getattr(app.state, "search_tasks", None):
                await asyncio.gather(*tuple(app.state.search_tasks), return_exceptions=True)
            if getattr(app.state, "intelligence", None):
                app.state.intelligence.close()
            engine.dispose()
            lock.close()

    app = FastAPI(title="Patitas Lavalleja Intelligence", version="1.0.0", lifespan=lifespan,
                  openapi_url="/api/v1/openapi.json", docs_url="/api/v1/docs", redoc_url=None)
    app.state.settings, app.state.engine, app.state.db_factory = settings, engine, factory
    app.state.secret = load_secret(settings)
    app.add_middleware(SafetyHeaders)
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
                       allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                       allow_headers=["Content-Type", "X-CSRF-Token"], expose_headers=["Retry-After"])

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_, exc):
        return JSONResponse({"error": {"code": f"http_{exc.status_code}", "message": str(exc.detail)}}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_, exc):
        return JSONResponse({"error": {"code": "validation_error", "message": "Revisá los datos de la solicitud.", "details": [{"field": ".".join(str(x) for x in item["loc"]), "message": item["msg"]} for item in exc.errors()]}}, status_code=422)

    @app.exception_handler(ImageStorageError)
    async def image_error(_, exc):
        return JSONResponse({"error": {"code": exc.code, "message": str(exc)}}, status_code=exc.status)

    @app.exception_handler(IntegrityError)
    async def integrity_error(_, exc):
        return JSONResponse({"error": {"code": "conflict", "message": "La operación entra en conflicto con datos existentes. Recargá e intentá de nuevo."}}, status_code=409)

    @app.exception_handler(OperationalError)
    async def storage_error(_, exc):
        log.error("Database temporarily unavailable (%s)", type(exc).__name__)
        return JSONResponse({"error": {"code": "database_unavailable", "message": "El servicio está temporalmente ocupado. Probá de nuevo."}}, status_code=503, headers={"Retry-After": "2"})

    @app.exception_handler(Exception)
    async def unexpected_error(_, exc):
        # Never stringify database or validation exceptions: they can contain private parameters.
        log.error("Unexpected API failure (%s)", type(exc).__name__)
        return JSONResponse({"error": {"code": "internal_error", "message": "No pudimos completar la operación. Probá de nuevo más tarde."}}, status_code=500)

    for router in (auth.router, catalog.router, me.router, admin.router, intelligence.router, reviews.router):
        app.include_router(router, prefix="/api/v1")

    @app.get("/api/v1/health/live", tags=["health"])
    def live():
        return {"status": "ok"}

    @app.get("/api/v1/health/ready", tags=["health"])
    @app.get("/api/health", include_in_schema=False)
    def ready():
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ready", "database": "sqlite", "ai_enabled": settings.ai_enabled}

    @app.get("/api/v1/media/{photo_id}/{variant}", tags=["media"])
    def media(photo_id: str, variant: str, request: Request, db=Depends(get_db)):
        photo = db.get(Photo, photo_id)
        pet = db.get(Pet, photo.pet_id) if photo else None
        organization = db.get(Organization, pet.organization_id) if pet else None
        public = bool(pet and pet.publication_status == "published" and organization and organization.active)
        if not public:
            session = session_row(request, db)
            from app.db.models import User
            user = db.get(User, session.user_id) if session and session.user_id else None
            if not pet or not user or not can_manage(db, user, pet.organization_id):
                raise HTTPException(404, "La fotografía no está disponible.")
        if variant not in photo.variants:
            raise HTTPException(404, "La variante no existe.")
        path = request.app.state.media.read_variant(photo.id, variant)
        return FileResponse(path, media_type="image/webp", headers={"Cache-Control": "public, max-age=86400" if public else "no-store"})

    return app


app = create_app()
