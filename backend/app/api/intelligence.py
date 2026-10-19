import asyncio
import json
import threading

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from starlette.concurrency import run_in_threadpool

from app.core.security import administrator, current_user, get_db, modifying_admin, modifying_user, rate_limit
from app.db.models import AdopterProfile, MaintenanceJob, OutboxEvent, Pet, RuleVersion, utcnow
from app.schemas.contracts import AdopterProfileInput, MatchInput
from app.services.pets import available_query, pet_public, pets_public

router = APIRouter(tags=["intelligence"])


@router.post("/matches/evaluate")
@router.post("/matches/search")
async def evaluate(body: MatchInput, request: Request, user=Depends(modifying_user), db=Depends(get_db)):
    # SQLite may wait for a concurrent session transaction to commit. Keep that
    # wait off the event loop so the other request can finish its dependencies.
    await run_in_threadpool(rate_limit, request, "match", 30, 60)
    profile = body.profile.model_dump()
    from app.domain.matching.engine import evaluate_match
    if body.pet_id:
        pet = db.scalar(available_query().where(Pet.id == body.pet_id))
        if not pet:
            raise HTTPException(404, "La ficha no está publicada.")
        public = pet_public(db, pet)
        return {"pet": public, "match": evaluate_match(public, profile)}
    actor_id = user.id
    candidates = pets_public(db, db.scalars(available_query().where(Pet.adoption_status == "available")))
    db.rollback()  # Never hold a SQLite read transaction across model inference.
    # The service applies strict eligibility before semantic inference and always reports degradation.
    if "application/x-ndjson" in request.headers.get("accept", ""):
        return streamed_search(request, candidates, profile, body.query, body.limit, actor_id)
    result = await run_in_threadpool(request.app.state.intelligence.search, candidates, profile, body.query, body.limit)
    return revalidate_search(request, result)


def revalidate_search(request, result, actor_id=None):
    with request.app.state.db_factory() as fresh:
        if actor_id and current_user(request, fresh).id != actor_id:
            raise HTTPException(401, "Tu sesión cambió. Volvé a ingresar para buscar.")
        current = {pet.id: pet.profile_version for pet in fresh.scalars(available_query().where(Pet.adoption_status == "available"))}
    before = len(result.get("results", []))
    result["results"] = [row for row in result.get("results", []) if current.get(row["pet"]["id"]) == row["pet"]["profile_version"]]
    if len(result["results"]) != before:
        result.setdefault("meta", {})["availability_changed"] = True
        result["meta"].setdefault("warnings", []).append("Algunas fichas cambiaron durante la búsqueda. Podés volver a buscar para actualizar los resultados.")
    return result


def streamed_search(request, candidates, profile, query, limit, actor_id):
    """Request-scoped progress: aggregate stages only, with no private model inputs."""
    async def events():
        loop = asyncio.get_running_loop()
        queue = asyncio.Queue(maxsize=20)
        stopped = threading.Event()

        class SearchCancelled(Exception):
            pass

        def emit(event):
            if stopped.is_set():
                raise SearchCancelled()
            # The pipeline emits at most eleven progress records and one result.
            def enqueue():
                if not stopped.is_set():
                    queue.put_nowait(event)
            loop.call_soon_threadsafe(enqueue)

        async def work():
            try:
                result = await run_in_threadpool(request.app.state.intelligence.search, candidates, profile, query, limit, progress=emit)
                if stopped.is_set():
                    return
                result = await run_in_threadpool(revalidate_search, request, result, actor_id)
                await queue.put({"type": "result", "data": result})
            except SearchCancelled:
                pass
            except HTTPException as exc:
                if not stopped.is_set():
                    await queue.put({"type": "error", "code": f"http_{exc.status_code}", "message": str(exc.detail)})
            except Exception:
                if not stopped.is_set():
                    await queue.put({"type": "error", "code": "search_unavailable", "message": "No pudimos completar la búsqueda. Podés volver a intentar."})

        worker = asyncio.create_task(work())
        request.app.state.search_tasks.add(worker)
        worker.add_done_callback(request.app.state.search_tasks.discard)
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=10)
                except TimeoutError:
                    yield '{"type":"heartbeat"}\n'
                    continue
                yield json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"
                if event["type"] in {"result", "error"}:
                    break
        finally:
            # An in-flight native inference finishes; the next stage is stopped.
            stopped.set()

    return StreamingResponse(events(), media_type="application/x-ndjson", headers={"X-Accel-Buffering": "no"})


@router.post("/me/pets/{pet_id}/compatibility")
async def personal_compatibility(pet_id: str, request: Request, user=Depends(modifying_user), db=Depends(get_db)):
    from app.services.assessment import assess_application
    from app.services.profiles import profile_hash

    pet = db.scalar(available_query().where(Pet.id == pet_id))
    if not pet:
        raise HTTPException(404, "La ficha no está publicada.")
    home = db.get(AdopterProfile, user.id)
    if not home:
        raise HTTPException(409, "Completá y guardá tu perfil de hogar para analizar la compatibilidad.")
    actor_id, version = user.id, pet.profile_version
    profile = dict(home.data)
    fingerprint = profile_hash(profile)
    public = pet_public(db, pet)
    db.rollback()
    await run_in_threadpool(rate_limit, request, "personal-compatibility", 20, 60, actor_id)
    result = await run_in_threadpool(assess_application, request.app.state.intelligence, public, profile)

    def verify():
        with request.app.state.db_factory() as fresh:
            actor = current_user(request, fresh)
            current = fresh.scalar(available_query().where(Pet.id == pet_id))
            current_home = fresh.get(AdopterProfile, actor_id)
            if actor.id != actor_id or not current or current.profile_version != version or profile_hash(current_home.data if current_home else {}) != fingerprint:
                raise HTTPException(409, "Tu hogar o la ficha cambiaron durante el análisis. Volvé a analizar con los datos actuales.")
            return current_home.updated_at.isoformat() + "Z"

    updated_at = await run_in_threadpool(verify)
    return {**result, "pet_id": pet_id, "pet_version": version,
            "created_at": utcnow().isoformat() + "Z", "profile_updated_at": updated_at,
            "notice": "Orientación sobre tu hogar y este animal: no reserva ni aprueba una adopción. Los índices no son probabilidades de éxito."}


@router.get("/system/ai")
def ai_status(request: Request, _=Depends(administrator)):
    return request.app.state.intelligence.status()


@router.get("/system/index")
def index_status(_=Depends(administrator), db=Depends(get_db)):
    from sqlalchemy import func
    counts = db.execute(select(OutboxEvent.status, func.count()).group_by(OutboxEvent.status)).all()
    jobs = [{"id": row.id, "kind": row.kind, "status": row.status, "detail": row.detail, "error": row.error, "updated_at": row.updated_at.isoformat()}
            for row in db.scalars(select(MaintenanceJob).order_by(MaintenanceJob.created_at.desc()).limit(10))]
    return {"events": dict(counts), "jobs": jobs, "source_of_truth": "sqlite", "rules_versions": list(db.scalars(select(RuleVersion.version)))}


@router.post("/system/index/rebuild", status_code=202)
async def rebuild(request: Request, user=Depends(modifying_admin), db=Depends(get_db)):
    if not request.app.state.settings.ai_enabled:
        raise HTTPException(503, "La indexación está desactivada. Prepará los modelos y habilitá IA.")
    from sqlalchemy import text
    db.rollback()
    db.execute(text("BEGIN IMMEDIATE"))
    if db.scalar(select(MaintenanceJob.id).where(MaintenanceJob.status.in_(["queued", "running"]))):
        raise HTTPException(409, "Ya hay una reconstrucción en curso.")
    row = MaintenanceJob(kind="index_rebuild", status="queued")
    db.add(row)
    db.flush()
    from app.services.pets import audit
    audit(db, user, "index.rebuild_requested", row.id)
    db.commit()
    job_id = row.id

    async def run_job():
        factory = request.app.state.db_factory
        with factory() as local:
            job = local.get(MaintenanceJob, job_id)
            job.status, job.updated_at = "running", utcnow()
            local.commit()
        try:
            from app.jobs.indexer import rebuild_index
            result = await run_in_threadpool(rebuild_index, factory, request.app.state.settings)
            with factory() as local:
                job = local.get(MaintenanceJob, job_id)
                job.status = "failed" if result.get("failed", 0) else "completed"
                job.detail, job.updated_at = result, utcnow()
                if result.get("failed", 0):
                    job.error = "La reconstrucción terminó con eventos pendientes. Revisá la preparación de modelos y los reintentos."
                local.commit()
        except Exception as exc:
            with factory() as local:
                job = local.get(MaintenanceJob, job_id)
                job.status, job.error, job.updated_at = "failed", f"La reconstrucción no se completó ({type(exc).__name__}). Revisá la preparación de modelos y los eventos pendientes.", utcnow()
                local.commit()

    task = asyncio.create_task(run_job())
    request.app.state.maintenance_tasks.add(task)
    task.add_done_callback(request.app.state.maintenance_tasks.discard)
    return {"job_id": job_id, "status": "queued"}
