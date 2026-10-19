"""Versioned engineering parameters, to be reviewed with animal-care teams.

These values express an orientation, never a probability of adoption success.
Unknown observations are excluded from the score denominator.
"""

RULES_VERSION = "2026-10-18.1"
HOME_WEIGHTS = {
    "activity": 0.32,
    "company": 0.25,
    "training": 0.13,
    "care": 0.17,
    "environment": 0.13,
}
PREFERENCE_WEIGHTS = {
    "energy": 0.35,
    "species": 0.15,
    "size": 0.10,
    "stage": 0.10,
    "traits": 0.20,
    "location": 0.10,
}
HOME_SHARE = 0.7
ATTENTION_THRESHOLD = 0.6
POSITIVE_THRESHOLD = 0.78
# Semantic signals can reorder suitable candidates, but cannot remove safety gates.
RANKING_WEIGHTS = {"structured": 0.80, "retrieval": 0.12, "reranker": 0.08}
RRF_K = 60
COMPATIBILITY_LABELS = {
    "dogs": "otros perros",
    "cats": "gatos",
    "birds": "aves",
    "rabbits": "conejos",
    "small_mammals": "pequeños mamíferos",
    "other_pets": "otras mascotas",
    "young_children": "niños pequeños",
    "school_children": "niños en edad escolar",
    "teenagers": "adolescentes",
    "adults": "adultos",
    "frequent_visitors": "visitas frecuentes",
    "busy_home": "hogares con mucha actividad",
    "quiet_home": "hogares tranquilos",
}
CATEGORY_ALIASES = {
    "dog": "dogs", "perro": "dogs", "perros": "dogs",
    "cat": "cats", "gato": "cats", "gatos": "cats",
    "bird": "birds", "ave": "birds", "aves": "birds",
    "rabbit": "rabbits", "conejo": "rabbits", "conejos": "rabbits",
    "rodent": "small_mammals", "rodents": "small_mammals",
    "hamster": "small_mammals", "small_animals": "small_mammals",
    "other": "other_pets", "children_young": "young_children",
    "children_school": "school_children", "adolescents": "teenagers",
    "children_under6": "young_children", "children_6_12": "school_children",
    "young": "young_children", "school": "school_children",
}
