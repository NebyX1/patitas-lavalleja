import hashlib
from pathlib import Path
import sqlite3

import pytest
from sqlalchemy import select, text

from app.core.config import Settings
from app.db.migrations import MIGRATIONS_DIR, migrate
from app.db.models import Compatibility, Organization, OutboxEvent, Pet, User
from app.db.session import make_engine, make_session_factory


def test_migrations_are_idempotent_preserve_data_and_enable_foreign_keys(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'db.sqlite3'}")
    assert migrate(engine) == 3
    factory = make_session_factory(engine)
    with factory() as db:
        db.add(User(id="kept", email="kept@example.test", name="Conservar", role="adopter", password_hash="not-a-real-login"))
        db.commit()
        assert db.scalar(text("PRAGMA journal_mode")) == "wal"
        assert db.scalar(text("PRAGMA foreign_keys")) == 1
        assert db.scalar(text("PRAGMA busy_timeout")) == 15000
    assert migrate(engine) == 3
    with factory() as db:
        assert db.get(User, "kept").name == "Conservar"
        db.add(Compatibility(pet_id="missing", category="cats", status="compatible"))
        from sqlalchemy.exc import IntegrityError
        with pytest.raises(IntegrityError):
            db.commit()
    engine.dispose()


def test_failed_migration_rolls_back_ddl_and_detects_newer_or_modified_schema(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'db.sqlite3'}")
    scripts = tmp_path / "migrations"
    scripts.mkdir()
    (scripts / "001_invalid.sql").write_text("CREATE TABLE marker(id INTEGER);\nSELECT missing_column;\n")
    with pytest.raises(sqlite3.OperationalError):
        migrate(engine, scripts)
    with engine.connect() as db:
        assert db.scalar(text("SELECT COUNT(*) FROM sqlite_master WHERE name='marker'")) == 0
    assert migrate(engine) == 3
    (scripts / "001_invalid.sql").write_text("CREATE TABLE marker(id INTEGER);\n")
    (scripts / "002_same.sql").write_text((MIGRATIONS_DIR / "002_maintenance_rules.sql").read_text())
    (scripts / "003_same.sql").write_text((MIGRATIONS_DIR / "003_person_profiles_assessments.sql").read_text())
    with pytest.raises(RuntimeError, match="modified"):
        migrate(engine, scripts)
    with engine.begin() as db:
        db.execute(text("INSERT INTO schema_migrations(version,sha256) VALUES(99,'future')"))
    with pytest.raises(RuntimeError, match="newer"):
        migrate(engine)
    engine.dispose()


def test_production_requires_explicit_secret_and_secure_cookie():
    with pytest.raises(ValueError):
        Settings(_env_file=None, environment="production")
    settings = Settings(_env_file=None, environment="production", secret_key="safe-test-secret-" * 3, cookie_secure=True, public_site_url="https://patitas.lavalleja.uy")
    assert settings.cookie_secure


def test_restart_persists_profile_and_revocable_session(tmp_path):
    from fastapi.testclient import TestClient
    from app.main import create_app
    settings = Settings(_env_file=None, environment="testing", database_url=f"sqlite:///{tmp_path / 'restart.sqlite3'}", secret_key="restart-test-" * 5,
                        media_dir=tmp_path / "media", lancedb_path=tmp_path / "lance", model_cache_dir=tmp_path / "models", ai_enabled=False)
    with TestClient(create_app(settings)) as client:
        anonymous = client.get("/api/v1/auth/session").json()
        session = client.post("/api/v1/auth/register", json={"email": "restart@example.test", "password": "Persistent-password-2026", "display_name": "Persistencia"}, headers={"X-CSRF-Token": anonymous["csrf_token"]}).json()
        token = session["csrf_token"]
        assert client.put("/api/v1/me/profile", json={"species": ["cat"], "housing_type": None}, headers={"X-CSRF-Token": token}).status_code == 200
        cookies = dict(client.cookies)
    with TestClient(create_app(settings), cookies=cookies) as client:
        assert client.get("/api/v1/me").json()["display_name"] == "Persistencia"
        assert client.get("/api/v1/me/profile").json()["profile"]["species"] == ["cat"]
        assert client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": token}).status_code == 200
    with TestClient(create_app(settings), cookies=cookies) as client:
        assert client.get("/api/v1/me").status_code == 401


def test_cli_demo_guard_and_consistent_online_backup(tmp_path):
    import json
    import os
    import subprocess
    import sys
    folder = Path(__file__).resolve().parents[1]
    source, destination = tmp_path / "cli.sqlite3", tmp_path / "backup.sqlite3"
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{source}", "ENVIRONMENT": "testing", "MEDIA_DIR": str(tmp_path / "media"), "SECRET_KEY": "cli-safe-test-secret-" * 3}
    def command(*args):
        return subprocess.run([sys.executable, "-m", "app.cli", *args], cwd=folder, env=env, capture_output=True, text=True, timeout=30)
    assert command("migrate").returncode == 0
    assert command("backup", str(destination)).returncode == 0
    with sqlite3.connect(destination) as connection:
        assert connection.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 3
    assert command("backup", str(destination)).returncode == 1
    env.update(ENVIRONMENT="production", COOKIE_SECURE="true")
    response = command("seed-demo")
    assert response.returncode == 1 and "exclusively" in response.stderr
