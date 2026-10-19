import pytest
from sqlalchemy import func, select

from app.core.config import Settings
from app.db.models import AdopterProfile, AuthSession, Favorite, Membership, Organization, Pet, User
from app.services.testing import seed_testing


def headers(client):
    session = client.get("/api/v1/auth/session").json()
    return {"Origin": "http://localhost:4321", "X-CSRF-Token": session["csrf_token"]}


def test_demo_access_is_opt_in_and_never_enabled_in_production(system):
    client, app = system
    assert client.get("/api/v1/auth/demo-users").json() == {"enabled": False, "items": []}
    assert client.post("/api/v1/auth/demo-login", json={"user_id": "admin"}, headers=headers(client)).status_code == 404
    with pytest.raises(ValueError, match="exclusively"):
        Settings(_env_file=None, environment="production", secret_key="secure-secret-" * 4, cookie_secure=True, demo_login_enabled=True)
    production = app.state.settings.model_copy(update={"environment": "production"})
    with pytest.raises(ValueError, match="exclusively"):
        seed_testing(production, app.state.db_factory)


def test_testing_seed_identity_switch_permissions_and_actual_matching(system):
    client, app = system
    app.state.settings.demo_login_enabled = True
    created = seed_testing(app.state.settings, app.state.db_factory)
    assert created == {"users_created": 13, "organizations_created": 4, "pets_created": 48, "profiles_created": 8, "is_demo": True}
    listed = client.get("/api/v1/auth/demo-users").json()
    assert listed["enabled"] and len(listed["items"]) == 13
    assert "admin" not in {item["id"] for item in listed["items"]}
    with app.state.db_factory() as db:
        assert db.scalar(select(func.count()).select_from(Pet).where(Pet.is_demo.is_(True))) == 48
        assert db.scalar(select(func.count()).select_from(Membership).where(Membership.user_id.like("demo-user-%"))) == 4
        assert db.get(AdopterProfile, "demo-user-hugo").data["household_confirmed"] is False
        assert {pet.adoption_status for pet in db.scalars(select(Pet))} == {"available", "reserved", "adopted", "withdrawn", "under_review"}

    payload = {"user_id": "demo-user-ana"}
    assert client.post("/api/v1/auth/demo-login", json=payload).status_code == 403
    bad_origin = {**headers(client), "Origin": "https://untrusted.example"}
    assert client.post("/api/v1/auth/demo-login", json=payload, headers=bad_origin).status_code == 403
    assert client.post("/api/v1/auth/demo-login", json={"user_id": "admin"}, headers=headers(client)).status_code == 404

    def choose(name):
        previous_cookie = client.cookies.get("patitas_session")
        response = client.post("/api/v1/auth/demo-login", json={"user_id": f"demo-user-{name}"}, headers=headers(client))
        assert response.status_code == 200, response.text
        assert response.json()["user"]["is_demo"]
        if previous_cookie:
            assert client.cookies.get("patitas_session") != previous_cookie
        return response.json()

    choose("ana")
    assert client.get("/api/v1/me/profile").json()["profile"]["hours_away"] == 2
    ana_favorites = client.get("/api/v1/me/favorites").json()["pet_ids"]
    assert client.get("/api/v1/admin/pets").status_code == 403
    choose("bruno")
    assert client.get("/api/v1/me/profile").json()["profile"]["activity_minutes"] == 120
    assert client.get("/api/v1/me/favorites").json()["pet_ids"] != ana_favorites
    choose("carla")
    profile = client.get("/api/v1/me/profile").json()["profile"]
    response = client.post("/api/v1/matches/search", json={"profile": profile, "query": profile["preferences_text"]}, headers=headers(client))
    assert response.status_code == 200, response.text
    matching = response.json()
    assert matching["excluded"]["blocked"] > 0
    assert matching["results"]
    for item in matching["results"]:
        assert item["pet"]["species"] == "cat"
        assert item["match"]["eligibility"] in {"eligible", "needs_review"}
        assert not any(row["status"] == "incompatible" and row["category"] in {"cats", "young_children"} for row in item["pet"]["compatibilities"])
    choose("elena")
    profile = client.get("/api/v1/me/profile").json()["profile"]
    response = client.post("/api/v1/matches/search", json={"profile": profile}, headers=headers(client))
    assert {item["pet"]["species"] for item in response.json()["results"]} <= {"rabbit", "bird"}
    assert response.json()["results"]
    choose("lucia")
    own = client.get("/api/v1/admin/pets").json()["items"]
    assert own and {pet["organization_id"] for pet in own} == {"demo-org-serrano"}
    assert client.get("/api/v1/admin/pets/demo-animal-02-01").status_code == 403
    choose("sofia")
    assert client.get("/api/v1/admin/users").status_code == 200

    # Additive seed must preserve edits, saved answers, existing sessions and favorites.
    with app.state.db_factory() as db:
        db.get(Pet, "demo-animal-01-01").name = "Editado durante testing"
        db.get(AdopterProfile, "demo-user-ana").data = {"species": ["cat"]}
        sessions_before = db.scalar(select(func.count()).select_from(AuthSession))
        db.commit()
    again = seed_testing(app.state.settings, app.state.db_factory)
    assert all(again[key] == 0 for key in ("users_created", "organizations_created", "pets_created", "profiles_created"))
    with app.state.db_factory() as db:
        assert db.get(Pet, "demo-animal-01-01").name == "Editado durante testing"
        assert db.get(AdopterProfile, "demo-user-ana").data == {"species": ["cat"]}
        assert db.scalar(select(func.count()).select_from(AuthSession)) == sessions_before
        db.get(User, "demo-user-ana").is_demo = False
        db.commit()
    assert client.post("/api/v1/auth/demo-login", json=payload, headers=headers(client)).status_code == 404
