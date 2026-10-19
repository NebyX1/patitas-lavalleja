"""Explicit maintenance commands; never seed credentials at application startup."""
import argparse
from datetime import datetime
import getpass
import json
import os
from pathlib import Path
import sqlite3
import sys

from sqlalchemy import delete, select, text

from app.core.config import get_settings
from app.core.runtime import RuntimeLock
from app.core.security import hash_password
from app.db.migrations import migrate
from app.db.models import AdoptionApplication, ApplicationHistory, AuditLog, AuthSession, Compatibility, Favorite, Membership, Organization, OutboxEvent, PasswordReset, Pet, Photo, User, utcnow
from app.db.session import make_engine, make_session_factory
from app.schemas.contracts import PetInput, Registration
from app.services.pets import apply_pet, audit, queue_index


def seed_demo(settings, factory):
    if settings.environment not in {"development", "testing"}:
        raise ValueError("Demo seeds are available exclusively in development/testing")
    from app.storage.service import ImageStore
    store = ImageStore(settings)
    seed_path = Path(__file__).resolve().parent / "data" / "demo_pets.json"
    images = Path(__file__).resolve().parents[2] / "public" / "images" / "pets"
    count = 0
    with factory() as db:
        org = db.get(Organization, "demo-patitas")
        if not org:
            org = Organization(id="demo-patitas", name="Patitas · organización ficticia", description="Datos sintéticos para probar la plataforma. No son animales disponibles para adopción real.", locality="Minas", is_demo=True)
            db.add(org)
        system = db.get(User, "demo-system")
        if not system:
            import secrets
            system = User(id="demo-system", email="demo-system@example.invalid", name="Equipo ficticio de pruebas", password_hash=hash_password(secrets.token_urlsafe(48)), role="admin", active=False, is_demo=True)
            db.add(system)
        db.flush()
        for index, values in enumerate(json.loads(seed_path.read_text(encoding="utf-8"))):
            if db.get(Pet, values["id"]):
                continue
            values.update(organization_id=org.id, is_demo=True)
            energy = values["energy"]
            values["requirements"] = {"activity_minutes": [20, 35, 50, 70, 90][max(0, energy - 1)], "max_hours_alone": 2 if values["id"] == "nala" else 6,
                                      "special_care": values["id"] == "coco", "small_space_compatible": values["smallSpace"], "secure_outdoor_required": False}
            values["personality"] = {"companionship": 5 if values["id"] == "nala" else 3, "playfulness": energy,
                                      "independence": 4 if values["id"] == "olivia" else 2, "observations": "Observaciones totalmente ficticias para pruebas de compatibilidad."}
            statuses = {"milo": {"cats": "compatible", "dogs": "compatible", "young_children": "conditional"}, "luna": {"cats": "incompatible", "dogs": "conditional"}, "coco": {"dogs": "incompatible", "young_children": "conditional"}, "mora": {"cats": "conditional", "young_children": "unknown"}, "pipa": {"birds": "incompatible", "rabbits": "incompatible"}}
            values["compatibilities"] = [{"category": category, "status": status, "observation": "Escenario ficticio de demostración; no representa una evaluación de un animal real.", "responsible": "Equipo de pruebas", "confidence": 0.9, "evaluated_at": utcnow().isoformat()} for category, status in statuses.get(values["id"], {"cats": "unknown", "dogs": "unknown"}).items()]
            if values["id"] == "simon":
                values["adoption_status"] = "under_review"
            pet = Pet(id=values["id"], created_by_id=system.id, publication_status="draft", profile_version=1)
            apply_pet(db, pet, PetInput.model_validate(values), system, creating=True)
            pet.publication_status = "published"
            image_path = images / f"{pet.id}-960.webp"
            if image_path.exists():
                converted = store.save(image_path.read_bytes(), "image/webp")
                db.add(Photo(id=converted.id, pet_id=pet.id, variants=converted.variants, alt=values["alt"], position=0, size_bytes=converted.bytes_total))
            count += 1
        extra = [("demo-coneja", "Lila", "rabbit", "available"), ("demo-adoptado", "Toto", "dog", "adopted")]
        for pet_id, name, species, status in extra:
            if db.get(Pet, pet_id):
                continue
            body = PetInput(organization_id=org.id, name=name, species=species, location="Minas", story="Perfil completamente ficticio para demostrar otras especies y estados de adopción.", needs="Revisión humana de condiciones particulares.", is_demo=True, adoption_status=status,
                            compatibilities=[{"category": "other_pets", "status": "unknown"}])
            pet = Pet(id=pet_id, created_by_id=system.id, publication_status="draft", profile_version=1)
            apply_pet(db, pet, body, system, creating=True)
            pet.publication_status = "published"
            count += 1
        db.commit()
    return count


def main(argv=None):
    parser = argparse.ArgumentParser(description="Patitas maintenance")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("migrate")
    admin = commands.add_parser("create-admin")
    admin.add_argument("--email", required=True)
    admin.add_argument("--name", required=True)
    commands.add_parser("seed-demo")
    commands.add_parser("seed-testing")
    reset = commands.add_parser("reset-demo")
    reset.add_argument("--confirm", action="store_true", required=True)
    backup = commands.add_parser("backup")
    backup.add_argument("destination")
    commands.add_parser("index-pending")
    commands.add_parser("rebuild-index")
    args = parser.parse_args(argv)
    settings = get_settings()
    engine = make_engine(settings.database_url)
    factory = make_session_factory(engine)
    source = Path(settings.database_url.removeprefix("sqlite:///"))
    lock = None
    try:
        if args.command == "backup":
            destination = Path(args.destination).resolve()
            if destination == source.resolve() or destination.exists():
                raise ValueError("Choose a new backup path different from the source")
            destination.parent.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(source) as src, sqlite3.connect(destination) as dst:
                src.backup(dst)
            print(json.dumps({"backup": str(destination), "consistent": True}))
            return
        lock = RuntimeLock(source.parent / ".runtime.lock")
        version = migrate(engine)
        if args.command == "migrate":
            print(json.dumps({"schema_version": version}))
        elif args.command == "create-admin":
            password = os.getenv("PATITAS_ADMIN_PASSWORD") or getpass.getpass("Contraseña (12+ caracteres): ")
            payload = Registration(email=args.email, password=password, display_name=args.name)
            with factory() as db:
                if db.scalar(select(User).where(User.email == payload.email)):
                    raise ValueError("An account already exists with that email")
                row = User(email=payload.email, name=payload.display_name, role="admin", password_hash=hash_password(payload.password))
                db.add(row)
                db.flush()
                audit(db, row, "account.admin_created", row.id)
                db.commit()
                print(json.dumps({"id": row.id, "role": "admin", "created": True}))
        elif args.command == "seed-demo":
            print(json.dumps({"created": seed_demo(settings, factory), "is_demo": True}))
        elif args.command == "seed-testing":
            from app.services.testing import seed_testing
            original = seed_demo(settings, factory)
            print(json.dumps({"original_pets_created": original, **seed_testing(settings, factory)}))
        elif args.command == "reset-demo":
            if settings.environment not in {"development", "testing"}:
                raise ValueError("Reset is available exclusively in development/testing")
            with factory() as db:
                ids = list(db.scalars(select(Pet.id).where(Pet.is_demo.is_(True))))
                photo_ids = list(db.scalars(select(Photo.id).where(Photo.pet_id.in_(ids))))
                applications = select(AdoptionApplication.id).where(AdoptionApplication.pet_id.in_(ids))
                db.execute(delete(ApplicationHistory).where(ApplicationHistory.application_id.in_(applications)))
                db.execute(delete(AdoptionApplication).where(AdoptionApplication.pet_id.in_(ids)))
                db.execute(delete(Pet).where(Pet.id.in_(ids)))
                db.execute(delete(OutboxEvent).where(OutboxEvent.pet_id.in_(ids)))
                db.commit()
                from app.storage.service import ImageStore
                store = ImageStore(settings)
                for photo_id in photo_ids:
                    store.delete(photo_id)
                print(json.dumps({"deleted_demo_pets": len(ids)}))
        else:
            from app.jobs.indexer import process_outbox, rebuild_index
            result = rebuild_index(factory, settings) if args.command == "rebuild-index" else process_outbox(factory, settings)
            print(json.dumps(result, default=str))
    except Exception as exc:
        print(f"Maintenance failed ({type(exc).__name__}): {exc}", file=sys.stderr)
        raise SystemExit(1) from None
    finally:
        if lock:
            lock.close()
        engine.dispose()


if __name__ == "__main__":
    main()
