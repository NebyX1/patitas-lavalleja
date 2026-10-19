"""Public semantic representations. Never include adopter or custodian contacts."""

from __future__ import annotations

import re
import unicodedata


def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text).casefold())
    return " ".join(re.findall(r"\w+", "".join(c for c in text if not unicodedata.combining(c)), flags=re.UNICODE))


def build_animal_text(pet: dict) -> str:
    # Deliberate allowlist: no generic JSON serialization of public or private data.
    species = {"dog": "perro", "cat": "gato", "rabbit": "conejo", "bird": "ave"}.get(pet.get("species"), str(pet.get("species", "animal")))
    parts = [f"{pet.get('name', '')} es {species}. Etapa: {pet.get('stage', 'sin confirmar')}. Tamaño: {pet.get('size', 'sin confirmar')}."]
    # Needs and observed conditions precede the narrative so Horizon's trained
    # pair window does not spend all its tokens on a long introductory story.
    if pet.get("needs"):
        parts.append("Necesidades registradas: " + str(pet["needs"])[:900])
    if pet.get("traits"):
        parts.append("Personalidad observada: " + ", ".join(str(x) for x in pet["traits"][:20]) + ".")
    requirements = pet.get("requirements") or {}
    for key, label in (("activity_minutes", "Minutos diarios de actividad estimados"), ("max_hours_alone", "Horas a solas observadas")):
        if requirements.get(key) is not None:
            parts.append(f"{label}: {requirements[key]}.")
    for observation in pet.get("compatibilities") or []:
        if observation.get("status") in {"compatible", "conditional", "incompatible"}:
            parts.append(f"Convivencia con {observation.get('category', '')}: {observation['status']}. {str(observation.get('observation') or '')[:300]}")
    for key, maximum in (("quote", 300), ("story", 1800)):
        if pet.get(key):
            parts.append(str(pet[key])[:maximum])
    return " ".join(parts)[:8000]


def build_preference_text(profile: dict, query: str = "") -> str:
    # Adopter alias, email, telephone and other identity fields are never encoded.
    parts = [str(query)[:1500], str(profile.get("preferences_text", ""))[:1500]]
    if profile.get("species"):
        parts.append("Busco " + ", ".join({"dog": "perro", "cat": "gato"}.get(x, x) for x in profile["species"]) + ".")
    if profile.get("preferred_traits"):
        parts.append("Preferencias de personalidad: " + ", ".join(str(x) for x in profile["preferred_traits"][:20]) + ".")
    if profile.get("activity_minutes") is not None:
        parts.append(f"Puedo ofrecer {profile['activity_minutes']} minutos diarios de actividad.")
    if profile.get("household_animals"):
        parts.append("Conviviría con " + ", ".join(str(x) for x in profile["household_animals"][:12]) + ".")
    return " ".join(part for part in parts if part).strip()[:4000]
