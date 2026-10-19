import io
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
from PIL import Image
import pytest
from sqlalchemy import func, select

from app.db.models import AdoptionApplication, AdopterProfile, AuthSession, Compatibility, Membership, Organization, OutboxEvent, Pet, Photo, User
from conftest import create_published, login, pet_payload


def test_matching_does_not_block_concurrent_login_commit(system, monkeypatch):
    import threading
    from app.api import auth, intelligence

    client, _ = system
    authenticated = login(client, "responsible@example.test")
    session = client.get("/api/v1/auth/session").json()
    writer_ready, match_started = threading.Event(), threading.Event()
    original_audit, original_limit = auth.audit, intelligence.rate_limit

    def hold_login_until_matching(db, user, action, *args, **kwargs):
        original_audit(db, user, action, *args, **kwargs)
        if action == "account.login":
            writer_ready.set()
            assert match_started.wait(5), "Matching never started"

    def signal_matching(*args, **kwargs):
        match_started.set()
        return original_limit(*args, **kwargs)

    monkeypatch.setattr(auth, "audit", hold_login_until_matching)
    monkeypatch.setattr(intelligence, "rate_limit", signal_matching)
    with ThreadPoolExecutor(max_workers=2) as pool:
        signing_in = pool.submit(client.post, "/api/v1/auth/login",
            json={"email": "admin@example.test", "password": "Secure-test-password-2026"},
            headers={"Origin": "http://localhost:4321", "X-CSRF-Token": session["csrf_token"]})
        assert writer_ready.wait(5), "Login never acquired its transaction"
        matching = pool.submit(client.post, "/api/v1/matches/search", json={"profile": {"species": ["dog"]}}, headers=authenticated)
        assert signing_in.result(timeout=8).status_code == 200
        assert matching.result(timeout=8).status_code == 200


def test_registration_csrf_origin_cookie_profile_and_revocation(system):
    client, app = system
    assert client.post("/api/v1/auth/register", json={"email": "new@example.test", "password": "Another-secure-password", "display_name": "Mi perfil"}).status_code == 403
    session = client.get("/api/v1/auth/session")
    assert "HttpOnly" in session.headers["set-cookie"] and "Path=/api" in session.headers["set-cookie"]
    token = session.json()["csrf_token"]
    payload = {"email": "new@example.test", "password": "Another-secure-password", "display_name": "Mi perfil"}
    assert client.post("/api/v1/auth/register", json=payload, headers={"X-CSRF-Token": token, "Origin": "https://evil.example"}).status_code == 403
    response = client.post("/api/v1/auth/register", json=payload, headers={"X-CSRF-Token": token})
    assert response.status_code == 201, response.text
    user_id = response.json()["user"]["id"]
    headers = {"X-CSRF-Token": response.json()["csrf_token"]}
    profile = {"species": ["dog"], "household_animals": ["cats"], "hours_away": 5, "activity_minutes": 60}
    assert client.put("/api/v1/me/profile", json=profile, headers=headers).json()["profile"]["hours_away"] == 5
    assert client.get("/api/v1/me/profile").json()["profile"]["household_animals"] == ["cats"]
    assert client.put("/api/v1/me/profile", json={"hours_away": 99}, headers=headers).status_code == 422
    assert client.delete("/api/v1/me/profile", headers=headers).status_code == 200
    assert client.get("/api/v1/me/profile").json()["profile"] is None
    with app.state.db_factory() as db:
        user = db.get(User, user_id)
        assert user.password_hash.startswith("$argon2id$") and payload["password"] not in user.password_hash
    assert client.post("/api/v1/auth/logout", headers=headers).status_code == 200
    assert client.get("/api/v1/me").status_code == 401


def test_roles_resource_permissions_publication_and_outbox(system):
    client, app = system
    headers = login(client, "responsible@example.test")
    response = client.post("/api/v1/admin/pets", json=pet_payload(), headers=headers)
    assert response.status_code == 201, response.text
    pet = response.json()
    assert client.get(f"/api/v1/pets/{pet['id']}").status_code == 404
    assert client.post(f"/api/v1/admin/pets/{pet['id']}/submit", headers=headers).status_code == 200
    assert client.post(f"/api/v1/admin/pets/{pet['id']}/publication", json={"status": "published"}, headers=headers).status_code == 403
    assert client.post("/api/v1/admin/pets", json=pet_payload(organization_id="other-org"), headers=headers).status_code == 403
    admin = login(client)
    approved = client.post(f"/api/v1/admin/pets/{pet['id']}/publication", json={"status": "published"}, headers=admin)
    assert approved.status_code == 200
    assert client.get(f"/api/v1/pets/{pet['id']}").status_code == 200
    outsider = login(client, "outsider@example.test")
    assert client.get(f"/api/v1/admin/pets/{pet['id']}").status_code == 403
    assert client.put(f"/api/v1/admin/pets/{pet['id']}", json=pet_payload(), headers=outsider).status_code == 403
    headers = login(client, "responsible@example.test")
    updated = client.put(f"/api/v1/admin/pets/{pet['id']}", json=pet_payload(name="Nuevo nombre", profile_version=3), headers=headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["publication_status"] == "pending"
    assert client.get(f"/api/v1/pets/{pet['id']}").status_code == 404
    assert client.put(f"/api/v1/admin/pets/{pet['id']}", json=pet_payload(profile_version=1), headers=headers).status_code == 409
    with app.state.db_factory() as db:
        assert db.scalar(select(func.count()).select_from(OutboxEvent).where(OutboxEvent.pet_id == pet["id"])) == 4


def test_sqlite_filters_unknown_matrix_and_pagination(system):
    client, app = system
    headers = login(client)
    cat_ok = create_published(client, headers, name="Paz", energy=1, traits=["Tranquilo"], compatibilities=[{"category": "cats", "status": "compatible", "observation": "Convivió con gatos bajo evaluación."}])
    cat_no = create_published(client, headers, name="Rayo", energy=5, compatibilities=[{"category": "cats", "status": "incompatible", "observation": "Incompatibilidad observada."}])
    unknown = create_published(client, headers, name="Desconocido", species="rabbit")
    assert client.get("/api/v1/pets", params={"compatibility_category": "cats", "compatibility_status": "compatible"}).json()["items"][0]["id"] == cat_ok["id"]
    result = client.get("/api/v1/pets", params={"compatibility_category": "cats", "compatibility_status": "unknown"}).json()
    assert [item["id"] for item in result["items"]] == [unknown["id"]]
    assert client.get("/api/v1/pets", params={"energy": "low", "trait": "Tranquilo", "query": "Paz"}).json()["total"] == 1
    assert client.get("/api/v1/pets", params={"query": "%' OR 1=1 --"}).json()["total"] == 0
    result = client.get("/api/v1/pets", params={"page_size": 2, "page": 2}).json()
    assert result["total"] == 3 and result["pages"] == 2 and len(result["items"]) == 1
    assert "rabbit" in client.get("/api/v1/filters").json()["species"]
    assert client.get("/api/v1/pets", params={"ids": cat_no["id"]}).json()["total"] == 1
    extra = create_published(client, headers, name="Simón", location="Solís de Mataojo")
    assert client.get("/api/v1/pets", params={"query": "SIMON"}).json()["items"][0]["id"] == extra["id"]
    assert client.get("/api/v1/pets", params={"query": "Solis"}).json()["items"][0]["id"] == extra["id"]


def test_combined_coexistence_filters_require_every_confirmed_category(system):
    client, app = system
    headers = login(client)
    def observations(cats, children):
        return [{"category": "cats", "status": cats}, {"category": "young_children", "status": children}]
    safe = create_published(client, headers, name="Tranquilo con ambos", energy=2, compatibilities=observations("compatible", "compatible"))
    create_published(client, headers, name="Falta evaluar niños", energy=2, compatibilities=observations("compatible", "unknown"))
    create_published(client, headers, name="Incompatible con gatos", energy=2, compatibilities=observations("incompatible", "compatible"))
    create_published(client, headers, name="Sólo gatos evaluados", energy=2, compatibilities=[{"category": "cats", "status": "compatible"}])
    create_published(client, headers, name="Alta actividad", energy=5, compatibilities=observations("compatible", "compatible"))
    create_published(client, headers, name="Otra especie", species="cat", energy=2, compatibilities=observations("compatible", "compatible"))
    params = {"species": "dog", "energy": "low", "compatibility_categories": "cats,young_children", "compatibility_status": "compatible"}
    response = client.get("/api/v1/pets", params=params)
    assert response.status_code == 200, response.text
    assert [pet["id"] for pet in response.json()["items"]] == [safe["id"]]
    # The legacy single category remains additive when combined with the plural parameter.
    params.update(compatibility_category="cats", compatibility_categories="young_children,cats")
    assert client.get("/api/v1/pets", params=params).json()["total"] == 1
    assert client.get("/api/v1/pets", params={"compatibility_categories": "cats,' OR 1=1"}).status_code == 422
    assert client.get("/api/v1/pets", params={"compatibility_categories": ",".join(f"category_{i}" for i in range(13))}).status_code == 422


def test_combined_unknown_filters_include_missing_but_never_positive_observations(system):
    client, app = system
    headers = login(client)
    missing = create_published(client, headers, name="Sin evaluación")
    explicit = create_published(client, headers, name="Una desconocida explícita", compatibilities=[{"category": "cats", "status": "unknown"}])
    create_published(client, headers, name="Una confirmada", compatibilities=[{"category": "cats", "status": "compatible"}])
    params = {"compatibility_categories": "cats,young_children", "compatibility_status": "unknown"}
    response = client.get("/api/v1/pets", params=params)
    assert response.status_code == 200, response.text
    assert {pet["id"] for pet in response.json()["items"]} == {missing["id"], explicit["id"]}


def test_other_species_bucket_includes_rabbits_and_birds_but_preserves_exact_species(system):
    client, app = system
    headers = login(client)
    rabbit = create_published(client, headers, name="Lila", species="rabbit")
    bird = create_published(client, headers, name="Pico", species="bird")
    create_published(client, headers, name="Perro", species="dog")
    create_published(client, headers, name="Gato", species="cat")
    bucket = client.get("/api/v1/pets", params={"species": "other"})
    assert bucket.status_code == 200, bucket.text
    assert {pet["id"] for pet in bucket.json()["items"]} == {rabbit["id"], bird["id"]}
    assert client.get("/api/v1/pets", params={"species": "rabbit"}).json()["items"][0]["id"] == rabbit["id"]
    assert client.get("/api/v1/pets", params={"species": "bird"}).json()["total"] == 1


def test_favorites_and_applications_are_persistent_and_human_reviewed(system):
    client, app = system
    headers = login(client)
    pet = create_published(client, headers)
    assert client.post("/api/v1/me/favorites", json={"pet_id": pet["id"]}, headers=headers).status_code == 201
    assert client.post("/api/v1/me/favorites", json={"pet_id": pet["id"]}, headers=headers).status_code == 201
    assert client.get("/api/v1/me/favorites").json()["pet_ids"] == [pet["id"]]
    response = client.post("/api/v1/adoptions/applications", json={"pet_id": pet["id"], "message": "Quiero conocer sus necesidades y conversar con el equipo.", "consent": True}, headers=headers)
    assert response.status_code == 201, response.text
    application = response.json()
    assert application["status"] == "received"
    assert client.post("/api/v1/adoptions/applications", json={"pet_id": pet["id"], "message": "Segunda solicitud accidental", "consent": True}, headers=headers).status_code == 409
    assert client.get("/api/v1/me/applications").json()["total"] == 1
    assert client.patch(f"/api/v1/admin/applications/{application['id']}", json={"status": "completed"}, headers=headers).status_code == 409
    for status in ("under_review", "approved", "completed"):
        response = client.patch(f"/api/v1/admin/applications/{application['id']}", json={"status": status}, headers=headers)
        assert response.status_code == 200, response.text
    assert client.get("/api/v1/pets").json()["total"] == 0
    assert client.get(f"/api/v1/pets/{pet['id']}").json()["adoption_status"] == "adopted"
    assert client.delete(f"/api/v1/me/favorites/{pet['id']}", headers=headers).status_code == 200
    assert client.get("/api/v1/me/favorites").json()["total"] == 0


def test_demo_flags_cannot_be_removed_and_real_applications_are_blocked(system):
    client, app = system
    headers = login(client)
    with app.state.db_factory() as db:
        db.get(Organization, "org").is_demo = True
        db.commit()
    pet = create_published(client, headers, is_demo=False)
    assert pet["is_demo"] is True
    response = client.post("/api/v1/adoptions/applications", json={"pet_id": pet["id"], "message": "Solicitud real que debe ser rechazada como demostración", "consent": True}, headers=headers)
    assert response.status_code == 409


def test_compatibility_requires_recorded_evidence_and_household_unknown_is_preserved(system):
    client, app = system
    headers = login(client)
    response = client.post("/api/v1/admin/pets", json=pet_payload(compatibilities=[{"category": "cats", "status": "compatible"}]), headers=headers)
    assert response.status_code == 422
    response = client.put("/api/v1/me/profile", json={"household_confirmed": None}, headers=headers)
    assert response.status_code == 200 and response.json()["profile"]["household_confirmed"] is None
    pet = create_published(client, headers, dogs="Perfecto con todos", cats="Compatible", children="Ideal con niños", compatibilities=[{"category": "school_children", "status": "compatible", "observation": "Evaluación sintética con niños de edad escolar."}])
    assert pet["dogs"] == pet["cats"] == "A evaluar"
    assert pet["children"] == "Evaluación parcial: confirmar el grupo de edad"


def test_media_upload_authorization_type_and_private_visibility(system):
    client, app = system
    headers = login(client, "responsible@example.test")
    pet = client.post("/api/v1/admin/pets", json=pet_payload(), headers=headers).json()
    assert client.post(f"/api/v1/admin/pets/{pet['id']}/photos", files={"file": ("evil.jpg", b"<script>evil</script>", "image/jpeg")}, headers=headers).status_code == 422
    payload = io.BytesIO()
    Image.new("RGB", (240, 160), "#efaf52").save(payload, format="JPEG")
    response = client.post(f"/api/v1/admin/pets/{pet['id']}/photos", files={"file": ("foto.jpg", payload.getvalue(), "image/jpeg")}, data={"alt": "Una foto de prueba"}, headers=headers)
    assert response.status_code == 201, response.text
    photo_id = response.json()["id"]
    assert client.get(f"/api/v1/media/{photo_id}/card").headers["content-type"] == "image/webp"
    client.post("/api/v1/auth/logout", headers=headers)
    assert client.get(f"/api/v1/media/{photo_id}/card").status_code == 404
    headers = login(client)
    assert client.post(f"/api/v1/admin/pets/{pet['id']}/submit", headers=headers).status_code == 200
    assert client.post(f"/api/v1/admin/pets/{pet['id']}/publication", json={"status": "published"}, headers=headers).status_code == 200
    assert client.get(f"/api/v1/media/{photo_id}/detail").status_code == 200
    assert client.delete(f"/api/v1/admin/pets/{pet['id']}/photos/{photo_id}", headers=headers).status_code == 200
    assert client.get(f"/api/v1/media/{photo_id}/detail").status_code == 404


def test_last_admin_and_role_change_revoke_sessions(system):
    client, app = system
    headers = login(client)
    assert client.patch("/api/v1/admin/users/admin", json={"role": "adopter"}, headers=headers).status_code == 409
    assert client.patch("/api/v1/admin/users/responsible", json={"role": "admin"}, headers=headers).status_code == 200
    assert client.patch("/api/v1/admin/users/admin", json={"active": False}, headers=headers).status_code == 200
    assert client.get("/api/v1/admin/users").status_code == 401


def test_recovery_unavailable_is_explicit_and_reset_is_single_use(system, monkeypatch):
    client, app = system
    headers = login(client)
    assert client.post("/api/v1/auth/password-reset/request", json={"email": "admin@example.test"}, headers=headers).status_code == 503
    app.state.settings.smtp_host = "smtp.example.test"
    app.state.settings.smtp_sender = "patitas@example.test"
    delivered = []
    monkeypatch.setattr("app.api.auth.send_recovery", lambda settings, email, token: delivered.append(token))
    assert client.post("/api/v1/auth/password-reset/request", json={"email": "admin@example.test"}, headers=headers).status_code == 200
    assert len(delivered) == 1
    response = client.post("/api/v1/auth/password-reset/confirm", json={"token": delivered[0], "password": "Changed-secure-password-2026"}, headers=headers)
    assert response.status_code == 200, response.text
    assert client.get("/api/v1/me").status_code == 401
    anonymous = client.get("/api/v1/auth/session").json()
    assert client.post("/api/v1/auth/password-reset/confirm", json={"token": delivered[0], "password": "Another-secure-password-2026"}, headers={"X-CSRF-Token": anonymous["csrf_token"]}).status_code == 400


def test_recovery_email_uses_fragment_accepted_by_account_panel(system, monkeypatch):
    from urllib.parse import urlsplit
    from app.core.security import send_recovery
    client, app = system
    settings = app.state.settings
    settings.smtp_host, settings.smtp_sender = "smtp.example.test", "patitas@example.test"
    messages, tls_calls = [], []
    class SMTPDouble:
        def __init__(self, host, port, timeout):
            assert host == "smtp.example.test" and timeout == 15
        def __enter__(self):
            return self
        def __exit__(self, *args):
            return False
        def starttls(self, context):
            tls_calls.append(context)
        def send_message(self, message):
            messages.append(message)
    monkeypatch.setattr("app.core.security.smtplib.SMTP", SMTPDouble)
    token = "test-only-recovery-token"
    assert send_recovery(settings, "recipient@example.test", token) is True
    assert len(messages) == 1 and tls_calls
    body = messages[0].get_content()
    link = next(line for line in body.splitlines() if line.startswith("http://"))
    assert link == f"http://localhost:4321/login/#reset_token={token}"
    assert urlsplit(link).query == "" and urlsplit(link).fragment == f"reset_token={token}"


def test_matching_uses_real_sqlite_gate_and_reports_degradation(system):
    client, app = system
    headers = login(client)
    safe = create_published(client, headers, name="Apto", compatibilities=[{"category": "cats", "status": "compatible"}])
    blocked = create_published(client, headers, name="Incompatible", compatibilities=[{"category": "cats", "status": "incompatible"}])
    result = client.post("/api/v1/matches/search", json={"profile": {"household_animals": ["cats"], "activity_minutes": 60}}, headers=headers)
    assert result.status_code == 200, result.text
    payload = result.json()
    assert payload["meta"]["degraded"] is True
    assert [row["pet"]["id"] for row in payload["results"]] == [safe["id"]]
    assert payload["excluded"]["blocked"] == 1
    assert client.get("/api/v1/system/ai").status_code == 200
    assert client.post("/api/v1/matches/evaluate", json={"profile": {"hours_away": 99}}, headers=headers).status_code == 422


def test_concurrent_duplicate_applications_have_one_winner(system):
    client, app = system
    headers = login(client)
    pet = create_published(client, headers)
    body = {"pet_id": pet["id"], "message": "Quiero conocer a esta mascota y conversar sus necesidades.", "consent": True}
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: client.post("/api/v1/adoptions/applications", json=body, headers=headers).status_code, range(2)))
    assert sorted(results) == [201, 409]
    with app.state.db_factory() as db:
        assert db.scalar(select(func.count()).select_from(AdoptionApplication)) == 1


def test_rate_limit_and_body_size_are_bounded(system):
    client, app = system
    session = client.get("/api/v1/auth/session").json()
    headers = {"X-CSRF-Token": session["csrf_token"]}
    for _ in range(10):
        response = client.post("/api/v1/auth/login", json={"email": "missing@example.test", "password": "bad"}, headers=headers)
        assert response.status_code == 401
    response = client.post("/api/v1/auth/login", json={"email": "missing@example.test", "password": "bad"}, headers=headers)
    assert response.status_code == 429 and response.headers.get("Retry-After")
    response = client.post("/api/v1/matches/search", content=b"x" * 65537, headers={"Content-Type": "application/json"})
    assert response.status_code == 413
    response = client.post("/api/v1/matches/search", content=iter([b"x" * 40000, b"x" * 40000]), headers={"Content-Type": "application/json"})
    assert response.status_code == 413


def test_withdrawal_during_inference_is_revalidated(system, monkeypatch):
    client, app = system
    headers = login(client)
    pet = create_published(client, headers)
    def search(snapshot, profile, query, limit):
        with app.state.db_factory() as db:
            row = db.get(Pet, pet["id"])
            row.adoption_status = "withdrawn"
            row.profile_version += 1
            db.commit()
        return {"results": [{"pet": snapshot[0], "match": {"eligibility": "eligible"}}], "total": 1, "meta": {"warnings": []}}
    monkeypatch.setattr(app.state.intelligence, "search", search)
    response = client.post("/api/v1/matches/search", json={"profile": {}}, headers=headers)
    assert response.status_code == 200
    assert response.json()["results"] == []
    assert response.json()["meta"]["availability_changed"] is True


def test_index_rebuild_returns_a_real_background_job(system, monkeypatch):
    import threading
    client, app = system
    headers = login(client)
    app.state.settings.ai_enabled = True
    gate = threading.Event()
    def rebuild(factory, settings):
        assert gate.wait(timeout=5)
        return {"total": 1, "processed": 1, "failed": 0}
    monkeypatch.setattr("app.jobs.indexer.rebuild_index", rebuild)
    response = client.post("/api/v1/system/index/rebuild", headers=headers)
    assert response.status_code == 202, response.text
    assert response.json()["status"] == "queued"
    assert client.post("/api/v1/system/index/rebuild", headers=headers).status_code == 409
    gate.set()
    for _ in range(20):
        status = client.get("/api/v1/system/index").json()["jobs"][0]
        if status["status"] == "completed":
            break
    assert status["status"] == "completed"
    assert status["detail"]["processed"] == 1


def test_concurrent_uploads_cannot_exceed_per_pet_quota(system):
    client, app = system
    headers = login(client)
    response = client.post("/api/v1/admin/pets", json=pet_payload(), headers=headers)
    pet_id = response.json()["id"]
    payload = io.BytesIO()
    Image.new("RGB", (240, 160), "orange").save(payload, format="JPEG")
    def upload(_):
        return client.post(f"/api/v1/admin/pets/{pet_id}/photos", files={"file": ("test.jpg", payload.getvalue(), "image/jpeg")}, headers=headers)
    for i in range(7):
        response = upload(i)
        assert response.status_code == 201, response.text
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(upload, range(2)))
    assert sorted(response.status_code for response in results) == [201, 409]
    with app.state.db_factory() as db:
        assert db.scalar(select(func.count()).select_from(Photo).where(Photo.pet_id == pet_id)) == 8
