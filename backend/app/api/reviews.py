from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from app.core.security import current_user, get_db, modifying_user, rate_limit
from app.db.models import AdoptionApplication, AdopterProfile, ApplicationAssessment, Pet, User
from app.services.pets import audit, pet_public, require_manage
from app.services.profiles import latest_assessment, person_public, profile_hash

router = APIRouter(prefix="/admin/applications", tags=["compatibility review"])


def authorized_application(db, application_id, user):
    row = db.get(AdoptionApplication, application_id)
    if not row:
        raise HTTPException(404, "La solicitud no existe.")
    pet = db.get(Pet, row.pet_id)
    if not pet:
        raise HTTPException(404, "La ficha no existe.")
    require_manage(db, user, pet)
    return row, pet


@router.get("/{application_id}/review")
def review(application_id: str, user=Depends(current_user), db=Depends(get_db)):
    row, pet = authorized_application(db, application_id, user)
    applicant = db.get(User, row.user_id)
    home = db.get(AdopterProfile, row.user_id)
    return {"application_id": row.id, "applicant": person_public(db, applicant), "household": home.data if home else None,
            "household_updated_at": home.updated_at.isoformat() if home else None, "pet": pet_public(db, pet), "assessment": latest_assessment(db, row, pet)}


@router.post("/{application_id}/compatibility")
async def evaluate(application_id: str, request: Request, user=Depends(modifying_user), db=Depends(get_db)):
    row, pet = authorized_application(db, application_id, user)
    actor_id, applicant_id, pet_id, version = user.id, row.user_id, pet.id, pet.profile_version
    home = db.get(AdopterProfile, applicant_id)
    profile = dict(home.data) if home else {}
    fingerprint = profile_hash(profile)
    public = pet_public(db, pet)
    db.rollback()
    await run_in_threadpool(rate_limit, request, "application-assessment", 20, 60, actor_id)
    from app.services.assessment import assess_application
    result = await run_in_threadpool(assess_application, request.app.state.intelligence, public, profile)
    def persist():
        with request.app.state.db_factory() as fresh:
            fresh.execute(text("BEGIN IMMEDIATE"))
            actor = fresh.get(User, actor_id)
            if not actor or not actor.active:
                raise HTTPException(403, "Tu cuenta ya no puede realizar esta revisión.")
            current, current_pet = authorized_application(fresh, application_id, actor)
            current_home = fresh.get(AdopterProfile, current.user_id)
            if current.user_id != applicant_id or current.pet_id != pet_id or current_pet.profile_version != version or profile_hash(current_home.data if current_home else {}) != fingerprint:
                raise HTTPException(409, "El perfil o la ficha cambiaron durante la evaluación. Volvé a evaluar con los datos actuales.")
            saved = ApplicationAssessment(application_id=application_id, evaluator_id=actor_id, pet_version=version, profile_hash=fingerprint, result=result)
            fresh.add(saved)
            fresh.flush()
            audit(fresh, actor, "application.compatibility_evaluated", application_id, assessment_id=saved.id, decision=result["decision"])
            fresh.commit()
            return latest_assessment(fresh, current, current_pet)
    return await run_in_threadpool(persist)
