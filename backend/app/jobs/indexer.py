"""Recoverable SQLite -> LanceDB outbox, one bounded worker per deployment."""

from __future__ import annotations

from datetime import timedelta
import threading

from sqlalchemy import or_, select

from app.ai.models import AIUnavailable, get_models
from app.ai.store import VectorStore
from app.ai.text import build_animal_text
from app.db.models import Organization, OutboxEvent, Pet, utcnow

_RUN_LOCK = threading.Lock()


def _finish(db_factory, event_id: int, error: str | None = None) -> None:
    with db_factory() as db:
        event = db.get(OutboxEvent, event_id)
        if event is None:
            return
        if error is None:
            event.status = "processed"
            event.processed_at = utcnow()
            event.error = ""
            event.next_attempt_at = None
        else:
            event.status = "failed"
            # Operational failures contain no animal text or adopter input.
            event.error = error[:500]
            event.next_attempt_at = utcnow() + timedelta(seconds=min(1800, 15 * 2 ** min(event.attempts, 7)))
        db.commit()


def process_outbox(db_factory, settings, *, batch_size: int = 8) -> dict:
    result = {"processed": 0, "failed": 0, "superseded": 0, "busy": False}
    if not _RUN_LOCK.acquire(blocking=False):
        result["busy"] = True
        return result
    try:
        from app.services.pets import pet_public

        store = None
        models = get_models(settings)
        for _ in range(max(1, min(batch_size, 32))):
            with db_factory() as db:
                now = utcnow()
                due = or_(
                    (OutboxEvent.status.in_(["pending", "failed"])) & (or_(OutboxEvent.next_attempt_at.is_(None), OutboxEvent.next_attempt_at <= now)),
                    (OutboxEvent.status == "processing") & (OutboxEvent.next_attempt_at <= now),
                )
                event = db.scalar(select(OutboxEvent).where(due).order_by(OutboxEvent.id).limit(1))
                if event is None:
                    break
                event_id, pet_id, version = event.id, event.pet_id, event.profile_version
                event.status = "processing"
                event.attempts += 1
                event.next_attempt_at = now + timedelta(minutes=5)
                pet = db.get(Pet, pet_id)
                stale = pet is not None and pet.profile_version != version
                payload = pet_public(db, pet) if pet is not None and not stale else None
                organization = db.get(Organization, pet.organization_id) if pet is not None else None
                organization_active = organization is not None and organization.active
                operation = event.event_type
                db.commit()
            if stale:
                _finish(db_factory, event_id)
                result["superseded"] += 1
                continue
            try:
                if store is None:
                    store = VectorStore(settings)
                if payload is None or not organization_active or operation == "delete" or payload["publication_status"] != "published" or payload["adoption_status"] != "available":
                    store.delete(pet_id)
                else:
                    # Publish public text even if embeddings need preparation.
                    # A null vector is explicitly absent, never a fake embedding.
                    store.upsert(payload, None)
                    if not settings.ai_enabled:
                        raise AIUnavailable("IA desactivada: texto indexado; embedding pendiente.")
                    vector = models.embed([build_animal_text(payload)])[0]
                    with db_factory() as db:
                        current = db.get(Pet, pet_id)
                        current_org = db.get(Organization, current.organization_id) if current else None
                        current_valid = current is not None and current_org is not None and current_org.active and current.profile_version == version and current.publication_status == "published" and current.adoption_status == "available"
                    if current_valid:
                        store.upsert(payload, vector)
                    else:
                        # A concurrent edit has its own versioned outbox event.
                        # Never write the old vector after availability changes.
                        result["superseded"] += 1
                _finish(db_factory, event_id)
                result["processed"] += 1
            except Exception as exc:
                message = str(exc) if isinstance(exc, AIUnavailable) else f"Indexación pendiente ({type(exc).__name__})."
                _finish(db_factory, event_id, message)
                result["failed"] += 1
        return result
    finally:
        _RUN_LOCK.release()


def rebuild_index(db_factory, settings) -> dict:
    """Reset only derived Lance data, enqueue authoritative SQLite versions."""
    from app.services.pets import pet_public

    with _RUN_LOCK:
        store = VectorStore(settings)
        with db_factory() as db:
            pets = db.scalars(select(Pet).join(Organization).where(Organization.active.is_(True), Pet.publication_status == "published", Pet.adoption_status == "available")).all()
            total = len(pets)
            public_profiles = [pet_public(db, pet) for pet in pets]
            for pet in pets:
                event = db.scalar(select(OutboxEvent).where(OutboxEvent.pet_id == pet.id, OutboxEvent.profile_version == pet.profile_version, OutboxEvent.event_type == "upsert"))
                if event is None:
                    event = OutboxEvent(pet_id=pet.id, profile_version=pet.profile_version, event_type="upsert")
                    db.add(event)
                event.status = "pending"
                event.attempts = 0
                event.error = ""
                event.next_attempt_at = None
                event.processed_at = None
            db.commit()
        # Derived writes occur only after the SQLite transaction has closed.
        store.reset()
        for start in range(0, len(public_profiles), 512):
            store.upsert_many([(pet, None) for pet in public_profiles[start:start + 512]])
    result = {"total": total, "processed": 0, "failed": 0}
    while True:
        batch = process_outbox(db_factory, settings, batch_size=8)
        result["processed"] += batch["processed"]
        result["failed"] += batch["failed"]
        if batch["processed"] + batch["failed"] + batch["superseded"] == 0:
            break
    return result
