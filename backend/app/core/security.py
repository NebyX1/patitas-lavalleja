from datetime import timedelta
import hashlib
import hmac
import secrets
import smtplib
import ssl
import time
from email.message import EmailMessage
from pathlib import Path

from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request
from sqlalchemy import delete, select, text
from sqlalchemy.dialects.sqlite import insert

from app.db.models import AuthSession, Membership, PasswordReset, RateLimit, User, utcnow

COOKIE = "patitas_session"
password_hasher = PasswordHasher(type=Type.ID, time_cost=2, memory_cost=19456, parallelism=1)
dummy_hash = password_hasher.hash(secrets.token_urlsafe(32))


def get_db(request: Request):
    with request.app.state.db_factory() as db:
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def check_password(encoded: str, password: str) -> bool:
    try:
        return password_hasher.verify(encoded, password)
    except (VerificationError, InvalidHashError):
        return False


def load_secret(settings):
    if settings.secret_key:
        return settings.secret_key.encode()
    folder = Path(settings.database_url.removeprefix("sqlite:///")).parent
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / ".session-secret"
    try:
        with path.open("x", encoding="ascii") as handle:
            handle.write(secrets.token_urlsafe(48))
        path.chmod(0o600)
    except FileExistsError:
        pass
    return path.read_text(encoding="ascii").strip().encode()


def digest(request, token):
    return hmac.new(request.app.state.secret, token.encode(), hashlib.sha256).hexdigest()


def session_row(request, db):
    value = request.cookies.get(COOKIE)
    if not value:
        return None
    row = db.get(AuthSession, digest(request, value))
    if row and row.expires_at > utcnow():
        if row.user_id:
            user = db.get(User, row.user_id)
            if not user or not user.active:
                return None
        return row
    return None


def create_session(request, response, db, user_id=None, old=None):
    db.execute(delete(AuthSession).where(AuthSession.expires_at < utcnow()))
    if old:
        db.delete(old)
    token = secrets.token_urlsafe(32)
    ttl = request.app.state.settings.session_hours * 3600 if user_id else 3600
    row = AuthSession(token_hash=digest(request, token), user_id=user_id,
                      csrf_token=secrets.token_urlsafe(32), expires_at=utcnow() + timedelta(seconds=ttl))
    db.add(row)
    settings = request.app.state.settings
    response.set_cookie(COOKIE, token, max_age=ttl, httponly=True, secure=settings.cookie_secure,
                        samesite=settings.cookie_samesite, path="/api")
    return row


def user_public(db, user):
    return {"id": user.id, "email": user.email, "display_name": user.name, "role": user.role,
            "is_demo": user.is_demo,
            "organization_ids": list(db.scalars(select(Membership.organization_id).where(Membership.user_id == user.id)))}


def csrf_session(request: Request, db=Depends(get_db)):
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in request.app.state.settings.allowed_origins:
        raise HTTPException(403, "Origen de solicitud no permitido.")
    if request.headers.get("sec-fetch-site") == "cross-site":
        raise HTTPException(403, "La solicitud debe realizarse desde Patitas.")
    row = session_row(request, db)
    if not row or not hmac.compare_digest(row.csrf_token, request.headers.get("x-csrf-token", "")):
        raise HTTPException(403, "La sesión de seguridad venció. Recargá la página.")
    return row


def current_user(request: Request, db=Depends(get_db)):
    row = session_row(request, db)
    if not row or not row.user_id:
        raise HTTPException(401, "Ingresá a tu cuenta para continuar.")
    return db.get(User, row.user_id)


def modifying_user(user=Depends(current_user), _=Depends(csrf_session)):
    return user


def administrator(user=Depends(current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Esta operación requiere un administrador.")
    return user


def modifying_admin(user=Depends(administrator), _=Depends(csrf_session)):
    return user


def rate_limit(request, scope, maximum=30, window=60, identifier=None):
    now = int(time.time())
    bucket = now // window * window
    ip = request.client.host if request.client else "unknown"
    key = digest(request, f"limit:{scope}:{identifier or ip}")
    with request.app.state.db_factory() as db:
        db.execute(text("BEGIN IMMEDIATE"))
        db.execute(delete(RateLimit).where(RateLimit.expires_at < now))
        query = insert(RateLimit).values(key_hash=key, window_start=bucket, count=1, expires_at=bucket + window)
        query = query.on_conflict_do_update(index_elements=["key_hash", "window_start"], set_={"count": RateLimit.count + 1})
        db.execute(query)
        count = db.get(RateLimit, (key, bucket)).count
        db.commit()
    if count > maximum:
        raise HTTPException(429, "Demasiadas solicitudes. Esperá antes de volver a intentar.", headers={"Retry-After": str(bucket + window - now)})


def send_recovery(settings, email, token):
    if not settings.smtp_host or not settings.smtp_sender:
        return False
    message = EmailMessage()
    message["From"], message["To"] = settings.smtp_sender, email
    message["Subject"] = "Patitas Lavalleja · Recuperar acceso"
    message.set_content(f"Abrí este enlace para cambiar tu contraseña. Vence en 30 minutos y puede usarse una sola vez:\n\n{settings.public_site_url.rstrip('/')}/login/#reset_token={token}\n\nSi no solicitaste el cambio, ignorá este mensaje.")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as client:
        if settings.smtp_starttls:
            client.starttls(context=ssl.create_default_context())
        elif settings.environment == "production":
            raise ValueError("Production SMTP requires STARTTLS")
        if settings.smtp_username:
            client.login(settings.smtp_username, settings.smtp_password)
        client.send_message(message)
    return True
