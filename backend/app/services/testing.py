"""Local QA fixture creation. Additive and idempotent; never rewrites edited records."""
from copy import deepcopy
from pathlib import Path
import secrets

from app.core.security import hash_password
from app.data.testing_scenarios import ANIMAL_NAMES, ARCHETYPES, TEST_ORGANIZATIONS, TEST_USERS
from app.db.models import AdoptionApplication, AdopterProfile, ApplicationHistory, Favorite, Membership, Organization, PersonProfile, Pet, Photo, User, utcnow
from app.schemas.contracts import AdopterProfileInput, PetInput
from app.services.pets import apply_pet
from app.storage.service import ImageStore


def seed_testing(settings, factory):
    if settings.environment not in {"development", "testing"}:
        raise ValueError("Testing fixtures are available exclusively in development/testing")
    result = {"users_created": 0, "organizations_created": 0, "pets_created": 0, "profiles_created": 0, "is_demo": True}
    store = ImageStore(settings)
    image_root = Path(__file__).resolve().parents[3] / "public" / "images" / "pets"
    with factory() as db:
        for values in TEST_ORGANIZATIONS:
            if not db.get(Organization, values["id"]):
                db.add(Organization(**values, description="Asociación enteramente ficticia para probar permisos, búsqueda y recomendaciones. No representa una protectora real.", is_demo=True))
                result["organizations_created"] += 1
        for item in TEST_USERS:
            if not db.get(User, item["id"]):
                db.add(User(id=item["id"], name=item["name"], email=f"{item['id']}@example.test", password_hash=hash_password(secrets.token_urlsafe(40)), role=item["role"], is_demo=True))
                result["users_created"] += 1
        db.flush()
        for item in TEST_USERS:
            user = db.get(User, item["id"])
            if not user.is_demo:
                raise ValueError("Testing identifiers must never refer to real accounts")
            if not db.get(PersonProfile, user.id):
                index = next(i for i, value in enumerate(TEST_USERS) if value["id"] == user.id)
                db.add(PersonProfile(user_id=user.id, data={
                    "headline": item["name"].split("·")[-1].strip(), "biography": item["description"],
                    "location": item.get("profile", {}).get("location", next((org["locality"] for org in TEST_ORGANIZATIONS if org["id"] == item.get("organization_id")), "Minas")),
                    "avatar_color": ["peach", "lime", "lilac", "blue"][index % 4]}))
            org_id = item.get("organization_id")
            if org_id and not db.get(Membership, (user.id, org_id)):
                db.add(Membership(user_id=user.id, organization_id=org_id))
            if "profile" in item and not db.get(AdopterProfile, user.id):
                profile = AdopterProfileInput.model_validate({"display_name": item["name"], "household_confirmed": True, "flexibility": 3, **item["profile"]})
                db.add(AdopterProfile(user_id=user.id, data=profile.model_dump(mode="json")))
                result["profiles_created"] += 1
        actor = db.get(User, "demo-user-sofia")
        for group, org in enumerate(TEST_ORGANIZATIONS):
            for index, archetype in enumerate(ARCHETYPES):
                pet_id = f"demo-animal-{group + 1:02d}-{index + 1:02d}"
                if db.get(Pet, pet_id):
                    continue
                name = ANIMAL_NAMES[group][index]
                requirements = deepcopy(archetype["requirements"])
                energy = archetype["energy"]
                matrix = dict(archetype["matrix"])
                if group == 2 and index in {2, 3}:
                    matrix = {category: "unknown" for category in matrix}
                if group == 3 and index == 6:
                    matrix["young_children"] = "incompatible"
                months = archetype["months"] + (group * 2 if archetype["stage"] != "young" else group)
                status = {(1, 4): "under_review", (2, 1): "reserved", (2, 9): "adopted", (3, 2): "withdrawn"}.get((group, index), "available")
                publication = {(3, 4): "draft", (3, 8): "pending"}.get((group, index), "published")
                intro = f"{name} es un perfil ficticio de {org['name']}, en {org['locality']}. "
                body = PetInput(
                    organization_id=org["id"], name=name, species=archetype["species"], location=org["locality"],
                    age=f"{months} meses" if months < 12 else f"{months // 12} años", months=months, stage=archetype["stage"], size=archetype["size"],
                    sex="Hembra" if (index + group) % 2 == 0 else "Macho", energy=energy, tag=archetype["tag"],
                    tagColor=["#e4edae", "#e9ddf4", "#f7dec4", "#c6e0d1"][group], quote=archetype["tag"],
                    story=intro + archetype["story"], needs=archetype["story"] + " Las condiciones y observaciones son sintéticas y se usan únicamente para testing.",
                    traits=["tranquilo", "cariñoso"] if energy < 3 else ["juguetón", "curioso", "explorador"],
                    personality={"sociability": 2 if requirements.get("only_pet") else 4, "independence": 4 if index == 6 else 1 if index == 3 else 3,
                                 "companionship": 5 if index == 3 else 3, "playfulness": energy, "affection": 4, "curiosity": min(5, energy + 1),
                                 "noise_sensitivity": 5 if index in {4, 8} else 2, "adaptability": 2 if index == 4 else 4,
                                 "observations": "Personalidad ficticia creada para contrastar hogares y necesidades; no es una evaluación real."},
                    requirements=requirements, smallSpace=requirements.get("small_space_compatible"),
                    compatibilities=[{"category": category, "status": value, "observation": "Escenario sintético: " + archetype["story"],
                                      "responsible": "Equipo ficticio de pruebas", "confidence": None if value == "unknown" else 0.85,
                                      "evaluated_at": utcnow() if value != "unknown" else None,
                                      "context": "Datos inventados para testing; no describen un animal real.",
                                      "recommendations": "Adaptación gradual y supervisada." if value == "conditional" else ""} for category, value in matrix.items()],
                    care=requirements.get("mandatory_care", []), alt=f"Fotografía ilustrativa reutilizada para {name}, animal ficticio de pruebas.",
                    adoption_status=status, is_demo=True,
                )
                pet = Pet(id=pet_id, created_by_id=actor.id, publication_status="draft", profile_version=1)
                apply_pet(db, pet, body, actor, creating=True)
                pet.publication_status = publication
                image_path = image_root / f"{archetype.get('image', '')}-960.webp"
                if image_path.is_file():
                    photo = store.save(image_path.read_bytes(), "image/webp")
                    db.add(Photo(id=photo.id, pet_id=pet.id, variants=photo.variants, alt=body.alt, position=0, size_bytes=photo.bytes_total))
                result["pets_created"] += 1
        db.flush()
        for number, item in enumerate(user for user in TEST_USERS if user["role"] == "adopter"):
            for index in (0, 6):
                pet_id = f"demo-animal-{number % 4 + 1:02d}-{index + 1:02d}"
                if not db.get(Favorite, (item["id"], pet_id)):
                    db.add(Favorite(user_id=item["id"], pet_id=pet_id))
        examples = [("ana", "01-01", "under_review"), ("bruno", "01-02", "meeting_scheduled"), ("carla", "02-08", "received"), ("diego", "03-07", "information_requested")]
        for person, suffix, state in examples:
            application_id = f"demo-application-{person}"
            if not db.get(AdoptionApplication, application_id):
                user_id = f"demo-user-{person}"
                row = AdoptionApplication(id=application_id, user_id=user_id, pet_id=f"demo-animal-{suffix}", status=state,
                    data={"message": "Solicitud completamente ficticia para probar la revisión humana y los permisos de las asociaciones.", "phone": "", "locality": "Minas", "consent": True}, is_demo=True)
                db.add(row)
                db.flush()
                db.add(ApplicationHistory(application_id=row.id, actor_id=user_id, status="received", note="Solicitud sintética de testing."))
                if state != "received":
                    db.add(ApplicationHistory(application_id=row.id, actor_id=actor.id, status=state, note="Estado ficticio para probar el panel de gestión."))
        db.commit()
    return result
