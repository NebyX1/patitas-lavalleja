import hashlib
from pathlib import Path
import re
import sqlite3

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"


def migrate(engine, directory=MIGRATIONS_DIR):
    files = sorted(directory.glob("[0-9][0-9][0-9]_*.sql"))
    versions = [int(path.name.split("_", 1)[0]) for path in files]
    if versions != list(range(1, len(files) + 1)) or not files:
        raise RuntimeError("Migration versions must be consecutive")
    db = engine.raw_connection()
    try:
        db.execute("BEGIN IMMEDIATE")
        db.execute("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, sha256 TEXT NOT NULL)")
        applied = dict(db.execute("SELECT version,sha256 FROM schema_migrations"))
        if any(version not in versions for version in applied):
            raise RuntimeError("Database schema is newer than this application")
        for version, file in zip(versions, files):
            source = file.read_text(encoding="utf-8")
            checksum = hashlib.sha256(source.encode()).hexdigest()
            if version in applied:
                if applied[version] != checksum:
                    raise RuntimeError(f"Migration {version} was modified after application")
                continue
            statement = ""
            for char in source:
                statement += char
                if char == ";" and sqlite3.complete_statement(statement):
                    db.execute(statement)
                    statement = ""
            if statement.strip():
                raise RuntimeError(f"Incomplete migration {version}")
            db.execute("INSERT INTO schema_migrations(version,sha256) VALUES(?,?)", (version, checksum))
            db.execute(f"PRAGMA user_version={version}")
        db.commit()
        return versions[-1]
    except BaseException:
        db.rollback()
        raise
    finally:
        db.close()
