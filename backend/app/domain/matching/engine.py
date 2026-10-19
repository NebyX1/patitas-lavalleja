"""Bidirectional compatibility with explicit hard gates and missing information."""

from __future__ import annotations

import math
import unicodedata
from typing import Any

from .fuzzy import closeness, company, sufficient, weighted_known
from .rules import (
    ATTENTION_THRESHOLD, CATEGORY_ALIASES, COMPATIBILITY_LABELS, HOME_SHARE,
    HOME_WEIGHTS, POSITIVE_THRESHOLD, PREFERENCE_WEIGHTS, RULES_VERSION,
)


def number(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value) if math.isfinite(value) else None


def normalized(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", str(value).casefold()) if not unicodedata.combining(c)).strip()


def category(value: str) -> str:
    value = normalized(value)
    return CATEGORY_ALIASES.get(value, value)


def _list(value: Any) -> list:
    return value if isinstance(value, list) else []


def accepts_species(accepted: list[str], actual: str) -> bool:
    """The UI's 'other' group means published species beyond dogs and cats."""
    return not accepted or actual in accepted or ("other" in accepted and actual not in {"dog", "cat"})


def evaluate_match(pet: dict, profile: dict) -> dict:
    requirements = pet.get("requirements") or {}
    positive: list[str] = []
    attention: list[str] = []
    unknown: list[str] = []
    hard_rules: list[dict] = []
    review = False
    blocked = False
    available = pet.get("publication_status") == "published" and pet.get("adoption_status") == "available"

    if not available:
        hard_rules.append({"id": "availability", "reason": "La mascota no está publicada y disponible para adopción.", "blocking": True})
    accepted_species = _list(profile.get("species"))
    if not accepts_species(accepted_species, pet.get("species", "")):
        blocked = True
        reason = "Su especie no está entre las que elegiste aceptar para esta búsqueda. Podés ampliar esa selección si querés."
        hard_rules.append({"id": "species_accepted", "reason": reason, "blocking": True})
        attention.append(reason)
    if profile.get("household_confirmed") is not True:
        review = True
        unknown.append("Falta confirmar con qué animales, niños o adolescentes conviviría; una lista vacía todavía no significa que no haya convivientes.")

    applicable = {category(value) for value in _list(profile.get("household_animals")) + _list(profile.get("children_age_groups"))}
    if profile.get("frequent_visitors") is True:
        applicable.add("frequent_visitors")
    if profile.get("home_activity") in {"quiet", "busy"}:
        applicable.add(f"{profile['home_activity']}_home")
    observations = {category(item.get("category", "")): item for item in _list(pet.get("compatibilities")) if isinstance(item, dict)}
    observed = 0
    for key in sorted(applicable):
        observation = observations.get(key, {})
        state = observation.get("status", "unknown")
        label = COMPATIBILITY_LABELS.get(key, key.replace("_", " "))
        if state == "incompatible":
            blocked = True
            reason = f"Tiene una incompatibilidad observada con {label}, presentes en tu hogar."
            hard_rules.append({"id": f"coexistence:{key}", "reason": reason, "blocking": True, "observation": observation.get("observation")})
            attention.append(reason)
            observed += 1
        elif state == "compatible":
            if str(observation.get("observation") or "").strip():
                positive.append(f"Tiene antecedentes positivos de convivencia con {label}.")
                observed += 1
            else:
                review = True
                unknown.append(f"La convivencia con {label} figura como compatible, pero falta registrar la observación que la respalda.")
        elif state == "conditional":
            review = True
            attention.append(f"La convivencia con {label} requiere condiciones o supervisión: {observation.get('recommendations') or observation.get('observation') or 'conversar con el responsable' }.")
            hard_rules.append({"id": f"review:{key}", "reason": f"Confirmar las condiciones de convivencia con {label}.", "blocking": False})
            observed += 1
        else:
            # Not applicable in a general assessment is not a positive observation
            # when this specific household actually has that category.
            review = True
            unknown.append(f"Todavía falta evaluar la convivencia con {label}.")

    def requirement(flag: str, offered: str, message: str) -> None:
        nonlocal blocked, review
        if requirements.get(flag) is not True:
            return
        if profile.get(offered) is False:
            blocked = True
            attention.append(message)
            hard_rules.append({"id": flag, "reason": message, "blocking": True})
        elif profile.get(offered) is not True:
            review = True
            unknown.append(message.replace("No podés ofrecer", "Falta confirmar que puedas ofrecer"))

    requirement("secure_outdoor_required", "secure_outdoor", "No podés ofrecer el espacio exterior seguro que esta mascota necesita según su evaluación.")
    requirement("special_care_required", "special_care_capacity", "No podés ofrecer los cuidados especiales indispensables registrados para esta mascota.")
    # A special care preference alone is not a hard exclusion. Only an explicit
    # indispensable requirement may block; general care needs remain reviewable.
    if requirements.get("special_care") is True and profile.get("special_care_capacity") is not True:
        review = True
        attention.append("Necesita cuidados especiales: falta conversar sobre tu capacidad para ofrecerlos.")
    if requirements.get("only_pet") is True and profile.get("household_animals"):
        blocked = True
        reason = "La evaluación registrada indica que necesita ser la única mascota del hogar."
        hard_rules.append({"id": "only_pet", "reason": reason, "blocking": True})
        attention.append(reason)
    if requirements.get("mandatory_care"):
        review = True
        unknown.append("Falta confirmar los cuidados indispensables registrados: " + "; ".join(str(value) for value in requirements["mandatory_care"][:12]) + ".")
    if requirements.get("gradual_introduction") is True and profile.get("household_animals"):
        review = True
        attention.append("Necesita una presentación gradual con los animales del hogar, acompañada por su responsable.")
    if requirements.get("small_space_compatible") is False and profile.get("housing_type") in {"apartment", "small_apartment", "apartamento", "small"}:
        review = True
        attention.append("Su evaluación registra necesidades que requieren revisar las condiciones del espacio pequeño.")

    offered_activity = number(profile.get("activity_minutes"))
    needed_activity = number(requirements.get("activity_minutes"))
    hours_away = number(profile.get("hours_away"))
    max_alone = number(requirements.get("max_hours_alone"))
    training = number(profile.get("training_commitment"))
    training_needed = number(requirements.get("training_level"))
    home: dict[str, float | None] = {
        "activity": sufficient(offered_activity, needed_activity) if offered_activity is not None and needed_activity is not None else None,
        "company": company(hours_away, max_alone) if hours_away is not None and max_alone is not None else None,
        "training": sufficient(training, training_needed) if training is not None and training_needed is not None else None,
        "care": (1.0 if profile.get("special_care_capacity") else 0.2) if requirements.get("special_care") is True and profile.get("special_care_capacity") is not None else None,
        "environment": (1.0 if profile.get("secure_outdoor") else 0.0) if requirements.get("secure_outdoor_required") is True and profile.get("secure_outdoor") is not None else None,
    }
    dimension_messages = {
        "activity": ("Coincide con el tiempo de actividad que podés ofrecer.", "Necesita más tiempo de actividad del que indicaste.", "Falta confirmar los minutos de actividad necesarios y disponibles."),
        "company": ("Tu disponibilidad de compañía se ajusta al tiempo a solas observado.", "Necesita más tiempo de compañía del que indicaste.", "Falta confirmar cuánto tiempo puede estar a solas y tu rutina."),
        "training": ("Podés acompañar el aprendizaje que necesita.", "Conviene revisar el tiempo disponible para entrenamiento y adaptación.", "Falta confirmar sus necesidades de entrenamiento y tu disponibilidad."),
    }
    for key, messages in dimension_messages.items():
        value = home[key]
        if value is None:
            unknown.append(messages[2])
        elif value >= POSITIVE_THRESHOLD:
            positive.append(messages[0])
        elif value < ATTENTION_THRESHOLD:
            attention.append(messages[1])
            review = True
        else:
            attention.append(f"Hay un ajuste gradual por conversar: {messages[1][0].lower() + messages[1][1:]}")

    def preference(key: str, actual: Any) -> float | None:
        requested = _list(profile.get(key))
        return float(normalized(actual) in {normalized(value) for value in requested}) if requested else None

    energy = number(pet.get("energy"))
    desired_energy = number(profile.get("activity_level"))
    wanted_traits = {normalized(value) for value in _list(profile.get("preferred_traits"))}
    actual_traits = {normalized(value) for value in _list(pet.get("traits"))}
    preferences: dict[str, float | None] = {
        "energy": closeness(energy, desired_energy) if energy is not None and desired_energy is not None else None,
        "species": float(accepts_species(accepted_species, pet.get("species", ""))) if accepted_species else None,
        "size": preference("sizes", pet.get("size", "")),
        "stage": preference("stages", pet.get("stage", "")),
        "traits": len(wanted_traits & actual_traits) / len(wanted_traits) if wanted_traits else None,
        "location": float(normalized(profile["location"]) == normalized(pet.get("location", ""))) if profile.get("location") else None,
    }
    if preferences["energy"] is not None and preferences["energy"] >= POSITIVE_THRESHOLD:
        positive.append("Su energía coincide con el ritmo de actividad que preferís.")
    if preferences["traits"]:
        positive.append("Comparte rasgos de personalidad que te interesan.")
    # Size, age, energy and traits remain soft. Explicit accepted species is
    # a separate hard gate, required by the questionnaire contract.
    home_score = weighted_known(home, HOME_WEIGHTS)
    preference_score = weighted_known(preferences, PREFERENCE_WEIGHTS)
    known_axes = [value for value in (home_score, preference_score) if value is not None]
    structured = (home_score * HOME_SHARE + preference_score * (1 - HOME_SHARE)) if len(known_axes) == 2 else (known_axes[0] if known_axes else None)
    total_fields = len(home) + len(preferences) + len(applicable) + 1
    known_fields = sum(value is not None for value in home.values()) + sum(value is not None for value in preferences.values()) + observed + int(profile.get("household_confirmed") is True)
    completeness = known_fields / total_fields if total_fields else 0
    if home_score is None:
        review = True
        unknown.append("No hay información suficiente para evaluar la adecuación del hogar.")
    eligibility = "unavailable" if not available else "blocked" if blocked else "needs_review" if review else "eligible"

    def percent(value: float | None) -> float | None:
        return round(value * 100, 1) if value is not None else None

    return {
        "eligibility": eligibility,
        "home_score": percent(home_score),
        "preference_score": percent(preference_score),
        "structured_score": percent(structured),
        "confidence": round(completeness, 3),
        "completeness": round(completeness, 3),
        "positive": list(dict.fromkeys(positive)),
        "attention": list(dict.fromkeys(attention)),
        "unknown": list(dict.fromkeys(unknown)),
        "hard_rules": hard_rules,
        "rules_version": RULES_VERSION,
        "dimensions": {"home": home, "preferences": preferences},
        "notice": "Índice orientativo basado en observaciones y preferencias; requiere revisión humana y no garantiza convivencia.",
    }
