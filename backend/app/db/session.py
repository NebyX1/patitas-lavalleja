from contextlib import contextmanager
from pathlib import Path
import unicodedata

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker


def make_engine(database_url: str):
    if database_url != "sqlite:///:memory:":
        Path(database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    options = {"connect_args": {"check_same_thread": False, "timeout": 15}}
    if database_url == "sqlite:///:memory:":
        from sqlalchemy.pool import StaticPool
        options["poolclass"] = StaticPool
    engine = create_engine(database_url, **options)

    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _):
        connection.create_function("normalize_text", 1, lambda value: "".join(c for c in unicodedata.normalize("NFKD", str(value or "").casefold()) if not unicodedata.combining(c)), deterministic=True)
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=15000")
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=NORMAL")
    return engine


def make_session_factory(engine):
    return sessionmaker(bind=engine, expire_on_commit=False)


@contextmanager
def transaction(factory):
    with factory() as db:
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
