import pytest
from sqlalchemy import delete, func, select

from app.db.models import AdopterProfile, ApplicationAssessment, AuthSession, Pet
from conftest import create_published, login


def prepare(system):
    client, app = system
    headers = login(client)
    pet = create_published(client, headers, energy=2, size="Pequeño", traits=["tranquilo"],
                           requirements={"activity_minutes": 30, "max_hours_alone": 6, "training_level": 1})
    profile = {"species": ["dog"], "sizes": ["Pequeño"], "stages": ["adult"], "activity_level": 2,
               "activity_minutes": 45, "hours_away": 2, "experience": "experienced", "training_commitment": 4,
               "housing_type": "house", "secure_outdoor": True, "household_confirmed": True,
               "special_care_capacity": True, "preferred_traits": ["tranquilo"], "location": "Minas",
               "preferences_text": "Busco compañía tranquila y paseos diarios."}
    assert client.put("/api/v1/me/profile", json=profile, headers=headers).status_code == 200
    return client, app, headers, pet


def test_all_matching_routes_require_authenticated_session_and_csrf(system):
    client, _ = system
    for path, body in [("/matches/search", {"profile": {}}), ("/matches/evaluate", {"profile": {}, "pet_id": "any"}),
                       ("/me/pets/any/compatibility", {})]:
        response = client.post("/api/v1" + path, json=body)
        assert response.status_code == 401, response.text
        assert response.headers["cache-control"] == "no-store"
    headers = login(client)
    for path in ("/matches/search", "/matches/evaluate"):
        assert client.post("/api/v1" + path, json={"profile": {}}).status_code == 403
        assert client.post("/api/v1" + path, json={"profile": {}}, headers={**headers, "Origin": "https://untrusted.test"}).status_code == 403
        result = client.post("/api/v1" + path, json={"profile": {}}, headers=headers)
        assert result.status_code == 200 and result.headers["cache-control"] == "no-store"


def test_personal_analysis_uses_only_saved_home_without_creating_application_report(system):
    client, app, headers, pet = prepare(system)
    route = f"/api/v1/me/pets/{pet['id']}/compatibility"
    assert client.post(route).status_code == 403
    # Client-supplied profile/user IDs cannot impersonate another household.
    response = client.post(route, json={"user_id": "outsider", "profile": {"activity_minutes": 0, "hours_away": 24}}, headers=headers)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["decision"] == "favorable" and result["match"]["home_score"] == 100
    assert result["pet_id"] == pet["id"] and result["meta"]["degraded"] is True
    assert result["profile_updated_at"].endswith("Z") and response.headers["cache-control"] == "no-store"
    with app.state.db_factory() as db:
        assert db.scalar(select(func.count()).select_from(ApplicationAssessment)) == 0
        assert db.get(Pet, pet["id"]).adoption_status == "available"
    outsider = login(client, "outsider@example.test")
    assert client.post(route, headers=outsider).status_code == 409


def test_private_or_withdrawn_profiles_are_revalidated_and_missing_home_is_explicit(system):
    client, app, headers, pet = prepare(system)
    route = f"/api/v1/me/pets/{pet['id']}/compatibility"
    with app.state.db_factory() as db:
        db.get(Pet, pet["id"]).publication_status = "draft"
        db.commit()
    assert client.post(route, headers=headers).status_code == 404
    with app.state.db_factory() as db:
        db.get(Pet, pet["id"]).publication_status = "published"
        db.get(Pet, pet["id"]).adoption_status = "reserved"
        db.commit()
    result = client.post(route, headers=headers)
    assert result.status_code == 200
    assert result.json()["availability"]["adoption_status"] == "reserved"
    assert client.delete("/api/v1/me/profile", headers=headers).status_code == 200
    assert client.post(route, headers=headers).status_code == 409


@pytest.mark.parametrize("change", ["home", "pet", "session"])
def test_personal_analysis_rechecks_current_data_and_session_after_inference(system, monkeypatch, change):
    client, app, headers, pet = prepare(system)
    original = app.state.intelligence.search

    def changed_during_inference(*args, **kwargs):
        result = original(*args, **kwargs)
        with app.state.db_factory() as db:
            if change == "home":
                row = db.get(AdopterProfile, "admin")
                row.data = {**row.data, "hours_away": 23}
            elif change == "pet":
                row = db.get(Pet, pet["id"])
                row.profile_version += 1
                row.publication_status = "draft"
            else:
                db.execute(delete(AuthSession).where(AuthSession.user_id == "admin"))
            db.commit()
        return result

    monkeypatch.setattr(app.state.intelligence, "search", changed_during_inference)
    response = client.post(f"/api/v1/me/pets/{pet['id']}/compatibility", headers=headers)
    assert response.status_code == (401 if change == "session" else 409), response.text
