from fastapi import HTTPException
from sqlalchemy import select

from app.db.models import AuditLog, Compatibility, Membership, Organization, OutboxEvent, Pet, Photo, User, utcnow
from app.schemas.contracts import PetInput


def audit(db, actor: User | None, action: str, resource_id: str = "", **detail):
    db.add(AuditLog(actor_id=actor.id if actor else None, action=action, resource_id=resource_id, detail=detail))


def can_manage(db, user, organization_id):
    return user.role == "admin" or (user.role == "responsible" and db.get(Membership, (user.id, organization_id)) is not None)


def require_manage(db, user, pet):
    if not can_manage(db, user, pet.organization_id):
        raise HTTPException(403, "No tenés permisos sobre esta mascota.")


def queue_index(db, pet, event_type="upsert"):
    db.add(OutboxEvent(pet_id=pet.id, profile_version=pet.profile_version, event_type=event_type))


def pet_public(db, pet: Pet, *, _organizations=None, _compatibilities=None, _photos=None) -> dict:
    result = dict(pet.data)
    result.update(id=pet.id, name=pet.name, species=pet.species, location=pet.location, department=pet.department,
                  months=pet.months, size=pet.size, sex=pet.sex, energy=pet.energy, organization_id=pet.organization_id,
                  publication_status=pet.publication_status, adoption_status=pet.adoption_status,
                  profile_version=pet.profile_version, is_demo=pet.is_demo,
                  created_at=pet.created_at.isoformat(), updated_at=pet.updated_at.isoformat())
    org = _organizations.get(pet.organization_id) if _organizations is not None else db.get(Organization, pet.organization_id)
    result["organization"] = {"id": org.id, "name": org.name} if org else None
    result["compatibilities"] = [
        {"category": row.category, "status": row.status, "observation": row.observation,
         "responsible": row.responsible, "confidence": row.confidence,
         "evaluated_at": row.evaluated_at.isoformat() if row.evaluated_at else None,
         "context": row.context, "recommendations": row.recommendations}
        for row in (_compatibilities.get(pet.id, []) if _compatibilities is not None else db.scalars(select(Compatibility).where(Compatibility.pet_id == pet.id).order_by(Compatibility.category)))
    ]
    photos = []
    for row in (_photos.get(pet.id, []) if _photos is not None else db.scalars(select(Photo).where(Photo.pet_id == pet.id).order_by(Photo.position, Photo.created_at))):
        variants = {key: {"url": f"/api/v1/media/{row.id}/{key}", "width": value.get("width"), "height": value.get("height")}
                    for key, value in row.variants.items()}
        photos.append({"id": row.id, "alt": row.alt, "position": row.position, "variants": variants})
    result["photos"] = photos
    for category, display in (("dogs", "dogs"), ("cats", "cats")):
        row = next((x for x in result["compatibilities"] if x["category"] == category), None)
        result[display] = {"compatible": "Buena convivencia observada", "incompatible": "Incompatibilidad observada", "conditional": "Con adaptación y supervisión", "unknown": "A evaluar", "not_applicable": "No aplica"}[row["status"]] if row else "A evaluar"
    children = [row for row in result["compatibilities"] if row["category"] in {"young_children", "school_children", "teenagers"}]
    states = {row["status"] for row in children}
    if "incompatible" in states:
        result["children"] = "Incompatibilidad observada: confirmar el grupo de edad"
    elif "conditional" in states:
        result["children"] = "Con condiciones y supervisión según la edad"
    elif len(children) == 3 and states == {"compatible"}:
        result["children"] = "Buena convivencia observada por grupo de edad"
    elif "compatible" in states:
        result["children"] = "Evaluación parcial: confirmar el grupo de edad"
    else:
        result["children"] = "A evaluar"
    return result


def pets_public(db, pets) -> list[dict]:
    """Materialize related public records in bounded batches instead of N+1 queries."""
    pets = list(pets)
    results = []
    for start in range(0, len(pets), 400):
        chunk = pets[start:start + 400]
        ids, organization_ids = [pet.id for pet in chunk], {pet.organization_id for pet in chunk}
        organizations = {row.id: row for row in db.scalars(select(Organization).where(Organization.id.in_(organization_ids)))}
        compatibilities, photos = {}, {}
        for row in db.scalars(select(Compatibility).where(Compatibility.pet_id.in_(ids)).order_by(Compatibility.category)):
            compatibilities.setdefault(row.pet_id, []).append(row)
        for row in db.scalars(select(Photo).where(Photo.pet_id.in_(ids)).order_by(Photo.position, Photo.created_at)):
            photos.setdefault(row.pet_id, []).append(row)
        results.extend(pet_public(db, pet, _organizations=organizations, _compatibilities=compatibilities, _photos=photos) for pet in chunk)
    return results


def apply_pet(db, pet: Pet, body: PetInput, actor: User, *, creating=False):
    if not can_manage(db, actor, body.organization_id):
        raise HTTPException(403, "No tenés permisos sobre esta organización.")
    org = db.get(Organization, body.organization_id)
    if not org or not org.active:
        raise HTTPException(422, "La organización debe existir y estar activa.")
    if body.is_demo and not org.is_demo:
        raise HTTPException(422, "Los perfiles ficticios requieren una organización de pruebas.")
    if not creating and body.profile_version is not None and body.profile_version != pet.profile_version:
        raise HTTPException(409, "La ficha cambió. Recargá antes de guardar.")
    values = body.model_dump(mode="json", exclude={"id", "organization_id", "profile_version", "compatibilities", "is_demo", "adoption_status"})
    for key in ("name", "species", "location", "department", "months", "size", "sex", "energy"):
        setattr(pet, key, values[key])
    pet.organization_id = body.organization_id
    pet.data = values
    pet.is_demo = org.is_demo or body.is_demo
    pet.adoption_status = body.adoption_status
    pet.updated_at = utcnow()
    if not creating:
        pet.profile_version += 1
        if actor.role != "admin" and pet.publication_status == "published":
            pet.publication_status = "pending"
    db.add(pet)
    db.flush()
    for row in db.scalars(select(Compatibility).where(Compatibility.pet_id == pet.id)):
        db.delete(row)
    db.flush()
    for item in body.compatibilities:
        values = item.model_dump()
        if values["evaluated_at"]:
            values["evaluated_at"] = values["evaluated_at"].replace(tzinfo=None)
        elif values["status"] in {"compatible", "incompatible", "conditional"}:
            values["evaluated_at"] = utcnow()
        if not values["responsible"]:
            values["responsible"] = actor.name
        db.add(Compatibility(pet_id=pet.id, **values))
    queue_index(db, pet)
    audit(db, actor, "pet.created" if creating else "pet.updated", pet.id)


def available_query():
    return select(Pet).join(Organization).where(Pet.publication_status == "published", Organization.active.is_(True))
