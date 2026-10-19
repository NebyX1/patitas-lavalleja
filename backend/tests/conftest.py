from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.security import hash_password
from app.db.models import Membership, Organization, User
from app.main import create_app


@pytest.fixture
def system(tmp_path):
    settings = Settings(_env_file=None, environment="testing", database_url=f"sqlite:///{tmp_path / 'db.sqlite3'}", secret_key="test-secret-" * 5,
                        media_dir=tmp_path / "media", lancedb_path=tmp_path / "lance", model_cache_dir=tmp_path / "models", ai_enabled=False)
    app = create_app(settings)
    with TestClient(app, base_url="http://testserver") as client:
        with app.state.db_factory() as db:
            admin = User(id="admin", email="admin@example.test", name="Administrador", role="admin", password_hash=hash_password("Secure-test-password-2026"))
            responsible = User(id="responsible", email="responsible@example.test", name="Responsable", role="responsible", password_hash=hash_password("Secure-test-password-2026"))
            outsider = User(id="outsider", email="outsider@example.test", name="Otra organización", role="responsible", password_hash=hash_password("Secure-test-password-2026"))
            db.add_all([admin, responsible, outsider, Organization(id="org", name="Organización de pruebas"), Organization(id="other-org", name="Otra organización")])
            db.flush()
            db.add_all([Membership(user_id="responsible", organization_id="org"), Membership(user_id="outsider", organization_id="other-org")])
            db.commit()
        yield client, app


def login(client, email="admin@example.test"):
    session = client.get("/api/v1/auth/session").json()
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "Secure-test-password-2026"}, headers={"X-CSRF-Token": session["csrf_token"], "Origin": "http://localhost:4321"})
    assert response.status_code == 200, response.text
    return {"X-CSRF-Token": response.json()["csrf_token"], "Origin": "http://localhost:4321"}


def pet_payload(**overrides):
    return {"organization_id": "org", "name": "Compañero", "species": "dog", "location": "Minas", "story": "Una historia conocida por el equipo responsable.", "needs": "Un hogar con compañía y paseos regulares.", **overrides}


def create_published(client, headers, **overrides):
    for item in overrides.get("compatibilities", []):
        if item.get("status") in {"compatible", "incompatible", "conditional"} and not item.get("observation"):
            item["observation"] = "Observación sintética registrada por el equipo de pruebas."
    response = client.post("/api/v1/admin/pets", json=pet_payload(**overrides), headers=headers)
    assert response.status_code == 201, response.text
    pet = response.json()
    assert client.post(f"/api/v1/admin/pets/{pet['id']}/submit", headers=headers).status_code == 200
    response = client.post(f"/api/v1/admin/pets/{pet['id']}/publication", json={"status": "published"}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()
