from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError

from app.core.security import current_user, get_db, modifying_user, rate_limit, user_public
from app.db.models import AdoptionApplication, AdopterProfile, ApplicationHistory, Favorite, Membership, Organization, PersonProfile, Pet, utcnow
from app.schemas.contracts import AdopterProfileInput, ApplicationInput, FavoriteInput, PersonProfileInput
from app.services.pets import audit, available_query, pet_public, pets_public

router = APIRouter(tags=["adopters"])


@router.get("/me")
def me(user=Depends(current_user), db=Depends(get_db)):
    return user_public(db, user)


@router.get("/me/dashboard")
def dashboard(user=Depends(current_user), db=Depends(get_db)):
    from app.services.profiles import completion, person_public
    home = db.get(AdopterProfile, user.id)
    favorites = list(db.scalars(available_query().join(Favorite, Favorite.pet_id == Pet.id).where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc())))
    sent = list(db.scalars(select(AdoptionApplication).where(AdoptionApplication.user_id == user.id).order_by(AdoptionApplication.created_at.desc())))
    org_query = select(Organization).where(Organization.active.is_(True))
    if user.role != "admin":
        org_query = org_query.where(Organization.id.in_(select(Membership.organization_id).where(Membership.user_id == user.id)))
    orgs = list(db.scalars(org_query)) if user.role in {"admin", "responsible"} else []
    organizations = []
    from sqlalchemy import func
    for org in orgs:
        organizations.append({"id": org.id, "name": org.name, "locality": org.locality, "description": org.description, "is_demo": org.is_demo,
            "pets": db.scalar(select(func.count()).select_from(Pet).where(Pet.organization_id == org.id, Pet.publication_status != "archived")) or 0,
            "applications": db.scalar(select(func.count()).select_from(AdoptionApplication).join(Pet).where(Pet.organization_id == org.id)) or 0})
    return {"identity": person_public(db, user), "household": home.data if home else None, "household_updated_at": home.updated_at.isoformat() if home else None,
            "completion": completion(home.data if home else None), "favorites": pets_public(db, favorites),
            "applications": [application_public(db, row) for row in sent], "organizations": organizations}


@router.patch("/me/identity")
def update_identity(body: PersonProfileInput, user=Depends(modifying_user), db=Depends(get_db)):
    from app.services.profiles import person_public
    row = db.get(PersonProfile, user.id)
    if not row:
        row = PersonProfile(user_id=user.id)
        db.add(row)
    user.name = body.display_name
    row.data, row.updated_at = body.model_dump(exclude={"display_name"}), utcnow()
    household = db.get(AdopterProfile, user.id)
    if household:
        household.data = {**household.data, "display_name": body.display_name, "location": body.location}
        household.updated_at = utcnow()
    db.flush()
    audit(db, user, "profile.identity_updated", user.id)
    return person_public(db, user)


@router.get("/me/profile")
def profile(user=Depends(current_user), db=Depends(get_db)):
    row = db.get(AdopterProfile, user.id)
    return {"profile": row.data if row else None, "updated_at": row.updated_at.isoformat() if row else None}


@router.put("/me/profile")
def save_profile(body: AdopterProfileInput, user=Depends(modifying_user), db=Depends(get_db)):
    row = db.get(AdopterProfile, user.id)
    if not row:
        row = AdopterProfile(user_id=user.id)
        db.add(row)
    row.data, row.updated_at = body.model_dump(mode="json"), utcnow()
    identity = db.get(PersonProfile, user.id)
    if identity:
        identity.data = {**identity.data, "location": body.location}
        identity.updated_at = utcnow()
    audit(db, user, "profile.updated", user.id)
    return {"profile": row.data, "updated_at": row.updated_at.isoformat()}


@router.delete("/me/profile")
def remove_profile(user=Depends(modifying_user), db=Depends(get_db)):
    db.execute(delete(AdopterProfile).where(AdopterProfile.user_id == user.id))
    audit(db, user, "profile.deleted", user.id)
    return {"ok": True}


@router.get("/me/favorites")
def favorites(user=Depends(current_user), db=Depends(get_db)):
    rows = db.scalars(available_query().join(Favorite, Favorite.pet_id == Pet.id).where(Favorite.user_id == user.id).order_by(Favorite.created_at.desc())).all()
    return {"items": pets_public(db, rows), "pet_ids": [pet.id for pet in rows], "total": len(rows)}


@router.post("/me/favorites", status_code=201)
def add_favorite(body: FavoriteInput, user=Depends(modifying_user), db=Depends(get_db)):
    pet = db.scalar(available_query().where(Pet.id == body.pet_id))
    if not pet:
        raise HTTPException(404, "La ficha no está publicada.")
    from sqlalchemy.dialects.sqlite import insert
    db.execute(insert(Favorite).values(user_id=user.id, pet_id=pet.id, created_at=utcnow()).on_conflict_do_nothing())
    return {"ok": True, "pet_id": pet.id}


@router.delete("/me/favorites/{pet_id}")
def remove_favorite(pet_id: str, user=Depends(modifying_user), db=Depends(get_db)):
    db.execute(delete(Favorite).where(Favorite.user_id == user.id, Favorite.pet_id == pet_id))
    return {"ok": True}


def application_public(db, row, include_private=False):
    pet = db.get(Pet, row.pet_id)
    result = {"id": row.id, "pet_id": row.pet_id, "pet_name": pet.name if pet else "Ficha retirada", "status": row.status,
              "is_demo": row.is_demo, "created_at": row.created_at.isoformat(), "updated_at": row.updated_at.isoformat(), **row.data}
    if include_private:
        from app.db.models import User
        user = db.get(User, row.user_id)
        result.update(user_id=row.user_id, applicant={"id": user.id, "display_name": user.name, "email": user.email} if user else None)
    result["history"] = [{"status": h.status, "note": h.note, "created_at": h.created_at.isoformat()}
                         for h in db.scalars(select(ApplicationHistory).where(ApplicationHistory.application_id == row.id).order_by(ApplicationHistory.created_at))]
    from app.services.profiles import latest_assessment
    result["assessment"] = latest_assessment(db, row, pet)
    return result


@router.post("/adoptions/applications", status_code=201)
def apply(body: ApplicationInput, request: Request, user=Depends(modifying_user), db=Depends(get_db)):
    rate_limit(request, "applications", 10, 3600, user.id)
    user_id = user.id
    db.rollback()
    db.execute(text("BEGIN IMMEDIATE"))
    from app.db.models import User
    user = db.get(User, user_id)
    pet = db.scalar(available_query().where(Pet.id == body.pet_id))
    if not pet or pet.adoption_status != "available":
        raise HTTPException(409, "Esta mascota no recibe solicitudes en este momento.")
    if pet.is_demo and not user.is_demo:
        raise HTTPException(409, "Esta ficha es ficticia. No se reciben solicitudes reales sobre animales de demostración.")
    previous = db.scalar(select(AdoptionApplication).where(AdoptionApplication.user_id == user.id, AdoptionApplication.pet_id == pet.id))
    if previous:
        raise HTTPException(409, "Ya enviaste una solicitud para esta mascota.")
    row = AdoptionApplication(user_id=user.id, pet_id=pet.id, data=body.model_dump(exclude={"pet_id"}), is_demo=pet.is_demo)
    db.add(row)
    db.flush()
    db.add(ApplicationHistory(application_id=row.id, actor_id=user.id, status="received"))
    audit(db, user, "application.created", row.id, pet_id=pet.id)
    return application_public(db, row)


@router.get("/me/applications")
def applications(user=Depends(current_user), db=Depends(get_db)):
    rows = db.scalars(select(AdoptionApplication).where(AdoptionApplication.user_id == user.id).order_by(AdoptionApplication.created_at.desc())).all()
    return {"items": [application_public(db, row) for row in rows], "total": len(rows)}
