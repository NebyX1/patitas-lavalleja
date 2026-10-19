from fastapi import Request, Response
from sqlalchemy import select

from app.api import auth
from app.db.models import AuthSession, User
from app.schemas.contracts import Registration


def test_session_rotations_are_visible_before_dependency_cleanup(system):
    _, app = system
    request = Request({"type": "http", "app": app, "headers": [], "client": ("127.0.0.1", 12345), "method": "POST", "path": "/api/v1/auth/register"})
    with app.state.db_factory() as db:
        anonymous = auth.session(request, Response(), db=db)
        old = db.scalar(select(AuthSession).where(AuthSession.csrf_token == anonymous["csrf_token"]))
        with app.state.db_factory() as reader:
            assert reader.get(AuthSession, old.token_hash) is not None

        registered = auth.register(Registration(email="commit-timing@example.test", password="Secure-test-password-2026", display_name="Cuenta de prueba"), request, Response(), old=old, db=db)
        current = db.scalar(select(AuthSession).where(AuthSession.csrf_token == registered["csrf_token"]))
        with app.state.db_factory() as reader:
            assert reader.get(User, registered["user"]["id"]) is not None
            assert reader.get(AuthSession, current.token_hash).user_id == registered["user"]["id"]
            assert reader.get(AuthSession, old.token_hash) is None

        signed_out = auth.logout(request, Response(), row=current, db=db)
        with app.state.db_factory() as reader:
            assert reader.get(AuthSession, current.token_hash) is None
            new = reader.scalar(select(AuthSession).where(AuthSession.csrf_token == signed_out["csrf_token"]))
            assert new is not None and new.user_id is None
