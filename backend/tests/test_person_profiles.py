import pytest
from sqlalchemy import func, select

from app.db.models import AdoptionApplication, AdopterProfile, ApplicationAssessment, Membership, Pet
from conftest import create_published, login


def applicant(client, email="person@example.test"):
    session = client.get("/api/v1/auth/session").json()
    response = client.post("/api/v1/auth/register", json={"email": email, "password": "Profile-test-password-2026", "display_name": "Persona de prueba"}, headers={"Origin": "http://localhost:4321", "X-CSRF-Token": session["csrf_token"]})
    assert response.status_code == 201, response.text
    return {"Origin": "http://localhost:4321", "X-CSRF-Token": response.json()["csrf_token"]}


def prepared_application(system, *, incompatible=False):
    client, app = system
    admin = login(client)
    pet = create_published(client, admin, energy=2, size="Pequeño", traits=["tranquilo"], requirements={"activity_minutes": 30, "max_hours_alone": 6, "training_level": 1},
        compatibilities=[{"category": "cats", "status": "incompatible" if incompatible else "compatible"}])
    headers = applicant(client)
    profile = {"species": ["dog"], "sizes": ["Pequeño"], "stages": ["adult"], "activity_level": 2, "activity_minutes": 45, "hours_away": 2,
               "experience": "experienced", "training_commitment": 4, "housing_type": "house", "secure_outdoor": True, "household_confirmed": True,
               "household_animals": ["cats"] if incompatible else [], "special_care_capacity": True, "preferred_traits": ["tranquilo"], "location": "Minas", "preferences_text": "Busco compañía tranquila para paseos diarios y una buena convivencia."}
    assert client.put("/api/v1/me/profile", json=profile, headers=headers).status_code == 200
    response = client.post("/api/v1/adoptions/applications", json={"pet_id": pet["id"], "message": "Nos gustaría conversar sobre la adaptación a nuestro hogar.", "consent": True}, headers=headers)
    assert response.status_code == 201, response.text
    return response.json(), pet, headers


def test_identity_is_editable_private_and_preserves_permissions(system):
    client, _ = system
    headers = applicant(client)
    assert client.put("/api/v1/me/profile", json={"species": ["cat"], "location": "Minas"}, headers=headers).status_code == 200
    body = {"display_name": "Ana de prueba", "headline": "Un hogar tranquilo", "biography": "Disfruto los paseos y la compañía de los animales.", "location": "Mariscala", "avatar_color": "lilac"}
    saved = client.patch("/api/v1/me/identity", json=body, headers=headers)
    assert saved.status_code == 200, saved.text
    assert saved.json()["role"] == "adopter" and saved.json()["avatar_color"] == "lilac"
    assert client.get("/api/v1/auth/session").json()["user"]["display_name"] == body["display_name"]
    dashboard = client.get("/api/v1/me/dashboard").json()
    assert dashboard["identity"]["biography"] == body["biography"]
    assert dashboard["household"]["species"] == ["cat"] and dashboard["household"]["location"] == "Mariscala"
    assert client.put("/api/v1/me/profile", json={**dashboard["household"], "location": "Solís de Mataojo"}, headers=headers).status_code == 200
    assert client.get("/api/v1/me/dashboard").json()["identity"]["location"] == "Solís de Mataojo"
    assert client.patch("/api/v1/me/identity", json={**body, "role": "admin"}, headers=headers).status_code == 422
    assert client.patch("/api/v1/me/identity", json={**body, "avatar_color": "url(javascript:bad)"}, headers=headers).status_code == 422
    assert client.patch("/api/v1/me/identity", json=body).status_code == 403
    login(client, "responsible@example.test")
    own = client.get("/api/v1/me/dashboard").json()
    assert own["identity"]["display_name"] == "Responsable"
    assert own["household"] is None and own["identity"]["biography"] == ""
    assert [org["id"] for org in own["organizations"]] == ["org"]


def test_responsible_assesses_pair_without_automating_adoption_and_owner_can_read(system):
    client, app = system
    application, pet, _ = prepared_application(system)
    route = f"/api/v1/admin/applications/{application['id']}"
    assert client.get(route + "/review").status_code == 403
    outside = login(client, "outsider@example.test")
    assert client.post(route + "/compatibility", headers=outside).status_code == 403
    responsible = login(client, "responsible@example.test")
    assert client.get(route + "/review").json()["household"]["activity_minutes"] == 45
    assert client.post(route + "/compatibility").status_code == 403
    response = client.post(route + "/compatibility", headers=responsible)
    assert response.status_code == 200, response.text
    report = response.json()
    assert report["decision"] == "favorable" and report["meta"]["degraded"] is True
    assert report["match"]["home_score"] == 100 and report["match"]["preference_score"] == 100
    assert report["stale"] is False
    with app.state.db_factory() as db:
        assert db.get(AdoptionApplication, application["id"]).status == "received"
        assert db.get(Pet, pet["id"]).adoption_status == "available"
        assert db.scalar(select(func.count()).select_from(ApplicationAssessment)) == 1
        home = db.scalar(select(AdopterProfile))
        home.data = {**home.data, "hours_away": 10}
        db.commit()
    assert client.get(route + "/review").json()["assessment"]["stale"] is True
    # Only the applicant sees their own assessment in their personal dashboard.
    session = client.get("/api/v1/auth/session").json()
    signed = client.post("/api/v1/auth/login", json={"email": "person@example.test", "password": "Profile-test-password-2026"}, headers={"X-CSRF-Token": session["csrf_token"]})
    assert signed.status_code == 200
    own = client.get("/api/v1/me/dashboard").json()
    assert own["applications"][0]["assessment"]["id"] == report["id"]
    assert own["applications"][0]["assessment"]["stale"] is True


def test_confirmed_incompatibilities_bypass_neural_ranking_and_never_reject_application(system, monkeypatch):
    client, app = system
    application, _, _ = prepared_application(system, incompatible=True)
    def forbidden(*args, **kwargs):
        raise AssertionError("Neural ranking must not run for a blocked pair")
    monkeypatch.setattr(app.state.intelligence, "search", forbidden)
    headers = login(client, "responsible@example.test")
    response = client.post(f"/api/v1/admin/applications/{application['id']}/compatibility", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["decision"] == "incompatible"
    assert response.json()["match"]["eligibility"] == "blocked"
    with app.state.db_factory() as db:
        assert db.get(AdoptionApplication, application["id"]).status == "received"


def test_missing_household_remains_insufficient_even_when_pet_is_reserved(system):
    client, app = system
    application, pet, owner = prepared_application(system)
    assert client.delete("/api/v1/me/profile", headers=owner).status_code == 200
    with app.state.db_factory() as db:
        db.get(Pet, pet["id"]).adoption_status = "reserved"
        db.commit()
    headers = login(client, "responsible@example.test")
    response = client.post(f"/api/v1/admin/applications/{application['id']}/compatibility", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["decision"] == "insufficient_information"
    assert response.json()["availability"]["adoption_status"] == "reserved"
    assert response.json()["match"]["home_score"] is None


@pytest.mark.parametrize("change", ["profile", "permissions"])
def test_assessment_revalidates_profile_and_permissions_after_inference(system, monkeypatch, change):
    client, app = system
    application, _, _ = prepared_application(system)
    original = app.state.intelligence.search
    def during_search(*args, **kwargs):
        result = original(*args, **kwargs)
        with app.state.db_factory() as db:
            if change == "profile":
                row = db.scalar(select(AdopterProfile))
                row.data = {**row.data, "hours_away": 12}
            else:
                db.delete(db.get(Membership, ("responsible", "org")))
            db.commit()
        return result
    monkeypatch.setattr(app.state.intelligence, "search", during_search)
    headers = login(client, "responsible@example.test")
    response = client.post(f"/api/v1/admin/applications/{application['id']}/compatibility", headers=headers)
    assert response.status_code == (409 if change == "profile" else 403), response.text
    with app.state.db_factory() as db:
        assert db.scalar(select(func.count()).select_from(ApplicationAssessment)) == 0
