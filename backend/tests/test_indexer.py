from datetime import timedelta

import pytest
from sqlalchemy import select

from app.db.models import Base, Organization, OutboxEvent, Pet, User, utcnow
from app.db.session import make_engine, make_session_factory
from app.jobs.indexer import process_outbox, rebuild_index

from test_ai import settings


@pytest.fixture
def indexed_database(tmp_path):
    engine = make_engine("sqlite:///" + str(tmp_path / "outbox.sqlite3"))
    Base.metadata.create_all(engine)
    factory = make_session_factory(engine)
    with factory() as db:
        db.add(User(id="owner", email="owner@example.invalid", name="Prueba", password_hash="not-a-password", role="admin"))
        db.add(Organization(id="org", name="Organización ficticia", is_demo=True))
        db.flush()
        db.add(Pet(id="sample", organization_id="org", created_by_id="owner", name="Animal ficticio", species="dog", location="Minas", size="Mediano", sex="Macho", energy=3, data={"story": "Paseos tranquilos", "requirements": {}}, publication_status="published", adoption_status="available", profile_version=1, is_demo=True))
        db.add(OutboxEvent(pet_id="sample", profile_version=1, event_type="upsert"))
        db.commit()
    yield factory
    engine.dispose()


class FakeModels:
    def embed(self, texts):
        return [[1.0] + [0.0] * 383 for _ in texts]


def test_outbox_idempotency_and_full_rebuild(tmp_path, indexed_database, monkeypatch):
    monkeypatch.setattr("app.jobs.indexer.get_models", lambda _: FakeModels())
    config = settings(tmp_path, ai_enabled=True)
    first = process_outbox(indexed_database, config)
    assert first["processed"] == 1
    assert process_outbox(indexed_database, config)["processed"] == 0
    with indexed_database() as db:
        event = db.scalar(select(OutboxEvent))
        assert event.status == "processed" and event.attempts == 1
    rebuilt = rebuild_index(indexed_database, config)
    assert rebuilt["processed"] == 1
    from app.ai.store import VectorStore
    assert VectorStore(config).status()["rows"] == 1


def test_outbox_failure_is_retryable_not_processed(tmp_path, indexed_database):
    result = process_outbox(indexed_database, settings(tmp_path, ai_enabled=False))
    assert result["failed"] == 1
    with indexed_database() as db:
        event = db.scalar(select(OutboxEvent))
        assert event.status == "failed"
        assert event.next_attempt_at > utcnow()
        assert event.processed_at is None


def test_obsolete_event_cannot_restore_old_version(tmp_path, indexed_database, monkeypatch):
    monkeypatch.setattr("app.jobs.indexer.get_models", lambda _: FakeModels())
    with indexed_database() as db:
        pet = db.get(Pet, "sample")
        pet.profile_version = 2
        db.add(OutboxEvent(pet_id=pet.id, profile_version=2, event_type="upsert"))
        db.commit()
    config = settings(tmp_path, ai_enabled=True)
    result = process_outbox(indexed_database, config)
    assert result["superseded"] == 1 and result["processed"] == 1
    from app.ai.store import VectorStore
    rows = VectorStore(config).search(vector=[1.0] + [0.0] * 383)["vector"]
    assert len(rows) == 1 and rows[0]["profile_version"] == 2


def test_withdrawal_removes_vector_without_model_inference(tmp_path, indexed_database, monkeypatch):
    monkeypatch.setattr("app.jobs.indexer.get_models", lambda _: FakeModels())
    config = settings(tmp_path, ai_enabled=True)
    process_outbox(indexed_database, config)
    with indexed_database() as db:
        pet = db.get(Pet, "sample")
        pet.profile_version = 2
        pet.adoption_status = "withdrawn"
        db.add(OutboxEvent(pet_id=pet.id, profile_version=2, event_type="upsert"))
        db.commit()
    assert process_outbox(indexed_database, config)["processed"] == 1
    from app.ai.store import VectorStore
    assert VectorStore(config).status()["rows"] == 0


def test_expired_processing_lease_recovers_after_crash(tmp_path, indexed_database, monkeypatch):
    monkeypatch.setattr("app.jobs.indexer.get_models", lambda _: FakeModels())
    with indexed_database() as db:
        event = db.scalar(select(OutboxEvent))
        event.status = "processing"
        event.next_attempt_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert process_outbox(indexed_database, settings(tmp_path, ai_enabled=True))["processed"] == 1
