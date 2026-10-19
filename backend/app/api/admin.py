from math import ceil

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from sqlalchemy import delete, func, select, text

from app.api.me import application_public
from app.core.security import administrator, current_user, get_db, modifying_admin, modifying_user, rate_limit, user_public
from app.db.models import AdoptionApplication, ApplicationHistory, AuditLog, AuthSession, CleanupJob, Membership, Organization, Pet, Photo, User, new_id, utcnow
from app.schemas.contracts import ApplicationStatusInput, MembershipInput, OrganizationInput, PetInput, PetStatusInput, PublicationInput, UserUpdate
from app.services.pets import apply_pet, audit, can_manage, pet_public, queue_index, require_manage

router = APIRouter(prefix="/admin", tags=["administration"])


def paginated(db, statement, page, page_size, mapper):
    total = db.scalar(select(func.count()).select_from(statement.order_by(None).subquery())) or 0
    return {"items": [mapper(row) for row in db.scalars(statement.offset((page - 1) * page_size).limit(page_size))],
            "total": total, "page": page, "page_size": page_size, "pages": ceil(total / page_size)}


def management_query(user):
    statement = select(Pet)
    if user.role == "responsible":
        statement = statement.where(Pet.organization_id.in_(select(Membership.organization_id).where(Membership.user_id == user.id)))
    elif user.role != "admin":
        raise HTTPException(403, "Esta sección requiere un responsable o administrador.")
    return statement


def managed_pet(db, pet_id, user):
    row = db.get(Pet, pet_id)
    if not row:
        raise HTTPException(404, "No encontramos esta ficha.")
    require_manage(db, user, row)
    return row


def begin_write(db):
    # Serialize read/modify/write decisions across HTTP threads and future tools.
    db.rollback()
    db.execute(text("BEGIN IMMEDIATE"))


@router.get("/pets")
def pets(page: int = Query(default=1, ge=1), page_size: int = Query(default=24, ge=1, le=48), user=Depends(current_user), db=Depends(get_db)):
    return paginated(db, management_query(user).order_by(Pet.updated_at.desc()), page, page_size, lambda row: pet_public(db, row))


@router.get("/pets/{pet_id}")
def pet(pet_id: str, user=Depends(current_user), db=Depends(get_db)):
    return pet_public(db, managed_pet(db, pet_id, user))


@router.post("/pets", status_code=201)
def create_pet(body: PetInput, user=Depends(modifying_user), db=Depends(get_db)):
    if body.id and db.get(Pet, body.id):
        raise HTTPException(409, "El identificador ya existe.")
    row = Pet(id=body.id or new_id(), created_by_id=user.id, publication_status="draft", profile_version=1)
    apply_pet(db, row, body, user, creating=True)
    db.flush()
    return pet_public(db, row)


@router.put("/pets/{pet_id}")
def update_pet(pet_id: str, body: PetInput, user=Depends(modifying_user), db=Depends(get_db)):
    begin_write(db)
    row = managed_pet(db, pet_id, user)
    if body.id and body.id != row.id:
        raise HTTPException(422, "El identificador de la ficha es estable.")
    apply_pet(db, row, body, user)
    db.flush()
    return pet_public(db, row)


@router.post("/pets/{pet_id}/submit")
def submit(pet_id: str, user=Depends(modifying_user), db=Depends(get_db)):
    begin_write(db)
    row = managed_pet(db, pet_id, user)
    if row.publication_status not in {"draft", "rejected", "pending"}:
        raise HTTPException(409, "La ficha debe estar en borrador para solicitar revisión.")
    if not row.data.get("story") or not row.data.get("needs"):
        raise HTTPException(422, "Completá la historia y las necesidades antes de solicitar revisión.")
    row.publication_status = "pending"
    row.profile_version += 1
    row.updated_at = utcnow()
    queue_index(db, row)
    audit(db, user, "pet.submitted", row.id)
    db.flush()
    return pet_public(db, row)


@router.post("/pets/{pet_id}/publication")
def publication(pet_id: str, body: PublicationInput, user=Depends(modifying_admin), db=Depends(get_db)):
    begin_write(db)
    row = managed_pet(db, pet_id, user)
    if body.status == "published" and row.publication_status not in {"pending", "published"}:
        raise HTTPException(409, "La ficha debe enviarse a revisión antes de aprobarse.")
    row.publication_status = body.status
    row.profile_version += 1
    row.updated_at = utcnow()
    queue_index(db, row, "upsert" if body.status == "published" else "delete")
    audit(db, user, "pet.publication_changed", row.id, status=body.status, note=body.note)
    db.flush()
    return pet_public(db, row)


@router.patch("/pets/{pet_id}/status")
def adoption_status(pet_id: str, body: PetStatusInput, user=Depends(modifying_user), db=Depends(get_db)):
    begin_write(db)
    row = managed_pet(db, pet_id, user)
    row.adoption_status = body.status
    row.profile_version += 1
    row.updated_at = utcnow()
    queue_index(db, row)
    audit(db, user, "pet.availability_changed", row.id, status=body.status, note=body.note)
    db.flush()
    return pet_public(db, row)


@router.delete("/pets/{pet_id}")
def archive_pet(pet_id: str, user=Depends(modifying_user), db=Depends(get_db)):
    begin_write(db)
    row = managed_pet(db, pet_id, user)
    row.publication_status = "archived"
    row.profile_version += 1
    queue_index(db, row, "delete")
    audit(db, user, "pet.archived", row.id)
    return {"ok": True}


@router.get("/organizations")
def organizations(page: int = Query(default=1, ge=1), page_size: int = Query(default=48, ge=1, le=100), user=Depends(current_user), db=Depends(get_db)):
    statement = select(Organization)
    if user.role != "admin":
        statement = statement.where(Organization.id.in_(select(Membership.organization_id).where(Membership.user_id == user.id)))
    def public(row):
        return {"id": row.id, "name": row.name, "description": row.description, "locality": row.locality, "department": row.department, "active": row.active, "is_demo": row.is_demo}
    return paginated(db, statement.order_by(Organization.name), page, page_size, public)


@router.post("/organizations", status_code=201)
def create_organization(body: OrganizationInput, user=Depends(modifying_admin), db=Depends(get_db)):
    row = Organization(**body.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "organization.created", row.id)
    return {"id": row.id, **body.model_dump(), "is_demo": row.is_demo}


@router.put("/organizations/{organization_id}")
def update_organization(organization_id: str, body: OrganizationInput, user=Depends(modifying_admin), db=Depends(get_db)):
    row = db.get(Organization, organization_id)
    if not row:
        raise HTTPException(404, "La organización no existe.")
    changed = row.active != body.active
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    if changed:
        for pet in db.scalars(select(Pet).where(Pet.organization_id == row.id)):
            pet.profile_version += 1
            queue_index(db, pet, "upsert" if body.active else "delete")
    audit(db, user, "organization.updated", row.id)
    return {"id": row.id, **body.model_dump(), "is_demo": row.is_demo}


@router.post("/organizations/{organization_id}/members", status_code=201)
def add_member(organization_id: str, body: MembershipInput, user=Depends(modifying_admin), db=Depends(get_db)):
    org, member = db.get(Organization, organization_id), db.get(User, body.user_id)
    if not org or not member:
        raise HTTPException(404, "La organización o la cuenta no existe.")
    from sqlalchemy.dialects.sqlite import insert
    db.execute(insert(Membership).values(user_id=member.id, organization_id=org.id).on_conflict_do_nothing())
    if member.role == "adopter":
        member.role = "responsible"
        db.execute(delete(AuthSession).where(AuthSession.user_id == member.id))
    audit(db, user, "organization.member_added", org.id, user_id=member.id)
    return {"ok": True}


@router.delete("/organizations/{organization_id}/members/{user_id}")
def remove_member(organization_id: str, user_id: str, actor=Depends(modifying_admin), db=Depends(get_db)):
    db.execute(delete(Membership).where(Membership.organization_id == organization_id, Membership.user_id == user_id))
    audit(db, actor, "organization.member_removed", organization_id, user_id=user_id)
    return {"ok": True}


@router.get("/users")
def users(page: int = Query(default=1, ge=1), page_size: int = Query(default=24, ge=1, le=100), _=Depends(administrator), db=Depends(get_db)):
    return paginated(db, select(User).order_by(User.created_at.desc()), page, page_size, lambda row: {**user_public(db, row), "active": row.active})


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UserUpdate, actor=Depends(modifying_admin), db=Depends(get_db)):
    actor_id = actor.id
    db.rollback()
    db.execute(text("BEGIN IMMEDIATE"))
    actor = db.get(User, actor_id)
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(404, "La cuenta no existe.")
    if row.role == "admin" and row.active and (body.role not in {None, "admin"} or body.active is False):
        if (db.scalar(select(func.count()).select_from(User).where(User.role == "admin", User.active.is_(True))) or 0) <= 1:
            raise HTTPException(409, "Debe quedar al menos un administrador activo.")
    for key, value in body.model_dump(exclude_none=True).items():
        setattr(row, key, value)
    db.execute(delete(AuthSession).where(AuthSession.user_id == row.id))
    audit(db, actor, "account.permissions_changed", row.id, **body.model_dump(exclude_none=True))
    return {**user_public(db, row), "active": row.active}


@router.get("/applications")
def applications(page: int = Query(default=1, ge=1), page_size: int = Query(default=24, ge=1, le=48), user=Depends(current_user), db=Depends(get_db)):
    allowed = management_query(user).with_only_columns(Pet.id)
    statement = select(AdoptionApplication).where(AdoptionApplication.pet_id.in_(allowed)).order_by(AdoptionApplication.created_at.desc())
    return paginated(db, statement, page, page_size, lambda row: application_public(db, row, True))


@router.patch("/applications/{application_id}")
def update_application(application_id: str, body: ApplicationStatusInput, user=Depends(modifying_user), db=Depends(get_db)):
    begin_write(db)
    row = db.get(AdoptionApplication, application_id)
    if not row:
        raise HTTPException(404, "La solicitud no existe.")
    pet = managed_pet(db, row.pet_id, user)
    transitions = {"received": {"under_review", "information_requested", "rejected", "closed"}, "under_review": {"information_requested", "meeting_scheduled", "approved", "rejected", "closed"}, "information_requested": {"under_review", "meeting_scheduled", "rejected", "closed"}, "meeting_scheduled": {"under_review", "approved", "rejected", "closed"}, "approved": {"completed", "closed"}, "rejected": {"under_review", "closed"}, "closed": set(), "completed": set()}
    if body.status != row.status and body.status not in transitions[row.status]:
        raise HTTPException(409, "El cambio de estado no corresponde al flujo de la solicitud.")
    if body.status == "completed" and pet.adoption_status in {"adopted", "withdrawn"}:
        raise HTTPException(409, "La mascota ya no está disponible para concretar esta adopción.")
    if body.status != row.status:
        row.status, row.updated_at = body.status, utcnow()
        db.add(ApplicationHistory(application_id=row.id, actor_id=user.id, status=body.status, note=body.note))
        if body.status == "completed":
            pet.adoption_status = "adopted"
            pet.profile_version += 1
            queue_index(db, pet)
        audit(db, user, "application.status_changed", row.id, status=body.status)
    db.flush()
    return application_public(db, row, True)


@router.get("/audit")
def audits(page: int = Query(default=1, ge=1), page_size: int = Query(default=30, ge=1, le=100), _=Depends(administrator), db=Depends(get_db)):
    return paginated(db, select(AuditLog).order_by(AuditLog.id.desc()), page, page_size,
                     lambda row: {"id": row.id, "actor_id": row.actor_id, "action": row.action, "resource_id": row.resource_id, "detail": row.detail, "created_at": row.created_at.isoformat()})


@router.post("/pets/{pet_id}/photos", status_code=201)
async def upload_photo(pet_id: str, request: Request, file: UploadFile = File(...), alt: str = Form(default="", max_length=500), user=Depends(modifying_user), db=Depends(get_db)):
    rate_limit(request, "upload", 20, 3600, user.id)
    row = managed_pet(db, pet_id, user)
    if (db.scalar(select(func.count()).select_from(Photo).where(Photo.pet_id == row.id)) or 0) >= 8:
        raise HTTPException(409, "Cada ficha admite hasta ocho fotografías.")
    data = await file.read(request.app.state.settings.media_max_input_bytes + 1)
    await file.close()
    from starlette.concurrency import run_in_threadpool
    converted = await run_in_threadpool(request.app.state.media.save, data, file.content_type)
    try:
        begin_write(db)
        row = managed_pet(db, pet_id, user)
        if (db.scalar(select(func.count()).select_from(Photo).where(Photo.pet_id == row.id)) or 0) >= 8:
            raise HTTPException(409, "Cada ficha admite hasta ocho fotografías.")
        photo = Photo(id=converted.id, pet_id=row.id, variants=converted.variants, alt=alt or row.data.get("alt") or f"Fotografía de {row.name}", position=(db.scalar(select(func.max(Photo.position)).where(Photo.pet_id == row.id)) or 0) + 1, size_bytes=converted.bytes_total)
        db.add(photo)
        row.profile_version += 1
        if user.role != "admin" and row.publication_status == "published":
            row.publication_status = "pending"
        queue_index(db, row)
        audit(db, user, "pet.photo_uploaded", row.id, photo_id=photo.id)
        db.flush()
        db.commit()
    except BaseException:
        db.rollback()
        await run_in_threadpool(request.app.state.media.delete, converted.id)
        raise
    return {"id": photo.id, "pet": pet_public(db, row)}


@router.delete("/pets/{pet_id}/photos/{photo_id}")
def delete_photo(pet_id: str, photo_id: str, request: Request, user=Depends(modifying_user), db=Depends(get_db)):
    begin_write(db)
    pet = managed_pet(db, pet_id, user)
    photo = db.get(Photo, photo_id)
    if not photo or photo.pet_id != pet.id:
        raise HTTPException(404, "La fotografía no existe.")
    # Persist deletion intent before touching files, so a failed delete remains recoverable.
    db.add(CleanupJob(path=photo.id))
    db.delete(photo)
    pet.profile_version += 1
    queue_index(db, pet)
    audit(db, user, "pet.photo_deleted", pet.id, photo_id=photo.id)
    db.commit()
    try:
        request.app.state.media.delete(photo_id)
        db.execute(delete(CleanupJob).where(CleanupJob.path == photo_id))
    except OSError:
        pass
    return {"ok": True}
