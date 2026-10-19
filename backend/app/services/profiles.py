import hashlib
import json

from sqlalchemy import select

from app.db.models import AdopterProfile, ApplicationAssessment, PersonProfile, User


def profile_hash(data):
    return hashlib.sha256(json.dumps(data or {}, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def person_public(db, user):
    row = db.get(PersonProfile, user.id)
    home = db.get(AdopterProfile, user.id)
    values = {"headline": "", "biography": "", "location": (home.data.get("location") or "") if home else "", "avatar_color": "peach", **(row.data if row else {})}
    return {**values, "id": user.id, "display_name": user.name, "role": user.role, "is_demo": user.is_demo,
            "member_since": user.created_at.isoformat(), "updated_at": row.updated_at.isoformat() if row else None}


def completion(profile):
    if not profile:
        return 0
    flags = [bool(profile.get("species")), profile.get("activity_minutes") is not None, profile.get("hours_away") is not None,
             bool(profile.get("experience")), bool(profile.get("housing_type")), profile.get("household_confirmed") is True,
             profile.get("special_care_capacity") is not None, bool(profile.get("location")), bool(profile.get("preferences_text"))]
    return round(sum(flags) / len(flags) * 100)


def latest_assessment(db, application, pet=None):
    row = db.scalar(select(ApplicationAssessment).where(ApplicationAssessment.application_id == application.id).order_by(ApplicationAssessment.created_at.desc(), ApplicationAssessment.id.desc()).limit(1))
    if not row:
        return None
    household = db.get(AdopterProfile, application.user_id)
    assessor = db.get(User, row.evaluator_id)
    return {"id": row.id, "created_at": row.created_at.isoformat(), "evaluated_by": assessor.name if assessor else "Equipo responsable",
            "pet_version": row.pet_version, "stale": pet is None or pet.profile_version != row.pet_version or profile_hash(household.data if household else {}) != row.profile_hash,
            **row.result}
