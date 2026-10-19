"""Assess an existing adoption pair without publishing or deciding the adoption."""
from app.domain.matching.engine import evaluate_match


def assess_application(intelligence, pet, profile):
    # Availability is a separate workflow fact for an existing application. A
    # reserved/under-review animal still needs a household fit assessment. This
    # copy never updates SQLite or exposes the animal through public search.
    evaluation_pet = {**pet, "publication_status": "published", "adoption_status": "available"}
    assessment = evaluate_match(evaluation_pet, profile)
    meta = {"degraded": not intelligence.settings.ai_enabled, "warnings": [], "components": {"structured": "ready", "embedding": "not_used", "reranker": "not_used", "vector": "not_used"}, "rules_version": assessment["rules_version"]}
    if assessment["eligibility"] != "blocked" and profile:
        result = intelligence.search([evaluation_pet], profile, profile.get("preferences_text", ""), 1)
        if result["results"]:
            assessment = result["results"][0]["match"]
        meta = result["meta"]
    if assessment["eligibility"] == "blocked":
        decision, label = "incompatible", "Incompatibilidades observadas"
        summary = "Hay condiciones confirmadas que impiden recomendar esta convivencia. El equipo debe revisar las observaciones antes de avanzar."
    elif not profile or profile.get("household_confirmed") is not True or assessment["completeness"] < 0.45:
        decision, label = "insufficient_information", "Falta información del hogar"
        summary = "Todavía faltan datos esenciales para orientar esta solicitud. Conviene completarlos con la persona solicitante."
    elif assessment["eligibility"] == "eligible" and (assessment["home_score"] or 0) >= 75 and (assessment["preference_score"] is None or assessment["preference_score"] >= 50):
        decision, label = "favorable", "Buen encaje inicial"
        summary = "Las necesidades observadas y las condiciones declaradas presentan un encaje favorable. El siguiente paso es conversar y confirmar la adaptación."
    else:
        decision, label = "review_required", "Hay aspectos por conversar"
        summary = "La orientación detecta afinidades y condiciones que necesitan revisión humana antes de continuar."
    return {"decision": decision, "label": label, "summary": summary, "match": assessment, "meta": meta,
            "conversation_points": list(dict.fromkeys(assessment["attention"] + assessment["unknown"]))[:12],
            "availability": {"publication_status": pet["publication_status"], "adoption_status": pet["adoption_status"]},
            "notice": "Orientación para el equipo: no aprueba ni rechaza la adopción. Los índices no son probabilidades de éxito."}
