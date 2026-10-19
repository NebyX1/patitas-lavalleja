from datetime import timedelta
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError

from app.core.security import check_password, create_session, csrf_session, digest, dummy_hash, get_db, hash_password, rate_limit, send_recovery, session_row, user_public
from app.db.models import AuthSession, PasswordReset, User, utcnow
from app.schemas.contracts import DemoLogin, Login, Registration, ResetPassword, ResetRequest
from app.services.pets import audit

router = APIRouter(prefix="/auth", tags=["authentication"])


def committed_session(db, row, user=None):
    # The request dependency can finish after response headers are sent. Make
    # the rotated cookie visible to the next request before returning it.
    payload = {"authenticated": user is not None, "user": user_public(db, user) if user else None, "csrf_token": row.csrf_token}
    db.commit()
    return payload


def demo_login_available(request):
    settings = request.app.state.settings
    return settings.demo_login_enabled and settings.environment in {"development", "testing"}


@router.get("/demo-users")
def demo_users(request: Request, db=Depends(get_db)):
    if not demo_login_available(request):
        return {"enabled": False, "items": []}
    from app.data.testing_scenarios import TEST_USERS
    rows = {row.id: row for row in db.scalars(select(User).where(User.id.in_([item["id"] for item in TEST_USERS]), User.is_demo.is_(True), User.active.is_(True)))}
    return {"enabled": True, "items": [
        {"id": row.id, "display_name": row.name, "role": row.role, "description": item["description"]}
        for item in TEST_USERS if (row := rows.get(item["id"])) and row.role == item["role"]
    ]}


@router.post("/demo-login")
def demo_login(body: DemoLogin, request: Request, response: Response, old=Depends(csrf_session), db=Depends(get_db)):
    if not demo_login_available(request):
        raise HTTPException(404, "El acceso de prueba no está habilitado.")
    from app.data.testing_scenarios import TEST_USERS
    expected = next((item for item in TEST_USERS if item["id"] == body.user_id), None)
    user = db.get(User, body.user_id) if expected else None
    if not user or not user.is_demo or not user.active or user.role != expected["role"]:
        raise HTTPException(404, "Ese perfil de prueba no está disponible.")
    rate_limit(request, "demo-login", 120, 60)
    row = create_session(request, response, db, user.id, old)
    audit(db, user, "account.demo_login", user.id)
    return committed_session(db, row, user)


@router.get("/session")
def session(request: Request, response: Response, db=Depends(get_db)):
    row = session_row(request, db) or create_session(request, response, db)
    user = db.get(User, row.user_id) if row.user_id else None
    response.headers["Cache-Control"] = "no-store"
    return {**committed_session(db, row, user), "recovery_available": bool(request.app.state.settings.smtp_host)}


@router.post("/register", status_code=201)
def register(body: Registration, request: Request, response: Response, old=Depends(csrf_session), db=Depends(get_db)):
    rate_limit(request, "register", 8, 900)
    user = User(email=body.email, name=body.display_name, password_hash=hash_password(body.password), role="adopter")
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Ya existe una cuenta con ese correo.") from None
    row = create_session(request, response, db, user.id, old)
    audit(db, user, "account.registered", user.id)
    return committed_session(db, row, user)


@router.post("/login")
def login(body: Login, request: Request, response: Response, old=Depends(csrf_session), db=Depends(get_db)):
    rate_limit(request, "login", 12, 900)
    rate_limit(request, "login-email", 10, 900, body.email)
    user = db.scalar(select(User).where(User.email == body.email))
    valid = check_password(user.password_hash if user else dummy_hash, body.password)
    if not user or not valid or not user.active:
        raise HTTPException(401, "Correo o contraseña inválidos.")
    row = create_session(request, response, db, user.id, old)
    audit(db, user, "account.login", user.id)
    return committed_session(db, row, user)


@router.post("/logout")
def logout(request: Request, response: Response, row=Depends(csrf_session), db=Depends(get_db)):
    user = db.get(User, row.user_id) if row.user_id else None
    audit(db, user, "account.logout")
    db.delete(row)
    new = create_session(request, response, db)
    return committed_session(db, new)


@router.post("/password-reset/request")
@router.post("/recovery", include_in_schema=False)
def recovery(body: ResetRequest, request: Request, _=Depends(csrf_session), db=Depends(get_db)):
    rate_limit(request, "recovery", 5, 900)
    if not request.app.state.settings.smtp_host or not request.app.state.settings.smtp_sender:
        raise HTTPException(503, "La recuperación por correo todavía no está configurada. Contactá al equipo responsable.")
    user = db.scalar(select(User).where(User.email == body.email.lower(), User.active.is_(True)))
    delivered = bool(request.app.state.settings.smtp_host)
    if user and delivered:
        token = secrets.token_urlsafe(36)
        row = PasswordReset(token_hash=digest(request, token), user_id=user.id, expires_at=utcnow() + timedelta(minutes=30))
        try:
            send_recovery(request.app.state.settings, user.email, token)
        except Exception:
            raise HTTPException(503, "El servicio de recuperación no está disponible. Probá más tarde.") from None
        db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
        db.add(row)
        audit(db, user, "account.recovery_requested", user.id)
    db.commit()
    return {"message": "Si el correo corresponde a una cuenta, recibirás instrucciones para recuperar el acceso.", "delivery_available": delivered}


@router.post("/password-reset/confirm")
@router.post("/reset-password", include_in_schema=False)
def reset_password(body: ResetPassword, request: Request, _=Depends(csrf_session), db=Depends(get_db)):
    rate_limit(request, "reset-password", 10, 900)
    # Lock before reading the one-use reset to prevent simultaneous consumption.
    db.rollback()
    db.execute(text("BEGIN IMMEDIATE"))
    row = db.get(PasswordReset, digest(request, body.token))
    if not row or row.used_at or row.expires_at <= utcnow():
        raise HTTPException(400, "El enlace es inválido o ya venció.")
    user = db.get(User, row.user_id)
    user.password_hash = hash_password(body.password)
    row.used_at = utcnow()
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    audit(db, user, "account.password_changed", user.id)
    db.commit()
    return {"ok": True}
