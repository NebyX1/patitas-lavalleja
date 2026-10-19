from copy import deepcopy

import pytest

from app.domain.matching import evaluate_match
from app.domain.matching.fuzzy import company, sufficient, trapezoidal, triangular


@pytest.fixture
def pet():
    return {
        "id": "test-dog", "profile_version": 1, "name": "Animal ficticio",
        "species": "dog", "size": "Grande", "stage": "senior", "energy": 3,
        "traits": ["Tranquilo", "Cariñoso"], "location": "Minas",
        "publication_status": "published", "adoption_status": "available",
        "requirements": {"activity_minutes": 70, "max_hours_alone": 6, "training_level": 2},
        "compatibilities": [{"category": "cats", "status": "compatible", "observation": "Observación ficticia registrada"}],
    }


@pytest.fixture
def profile():
    return {
        "species": ["dog"], "sizes": ["Grande"], "stages": ["senior"],
        "activity_level": 3, "activity_minutes": 70, "hours_away": 4,
        "training_commitment": 3, "household_animals": ["cat"],
        "household_confirmed": True,
        "children_age_groups": [], "special_care_capacity": True,
        "preferred_traits": ["Tranquilo"], "location": "Minas",
    }


def test_complete_bidirectional_match(pet, profile):
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "eligible"
    assert match["home_score"] == 100
    assert match["preference_score"] == 100
    assert match["structured_score"] == 100
    assert 0 < match["confidence"] < 1
    assert any("gatos" in reason for reason in match["positive"])


@pytest.mark.parametrize("category,field,value", [
    ("cats", "household_animals", "cat"),
    ("dogs", "household_animals", "dog"),
    ("birds", "household_animals", "bird"),
    ("rabbits", "household_animals", "rabbit"),
    ("small_mammals", "household_animals", "rodent"),
    ("young_children", "children_age_groups", "young_children"),
    ("school_children", "children_age_groups", "school_children"),
])
def test_confirmed_applicable_incompatibility_cannot_be_compensated(pet, profile, category, field, value):
    pet["compatibilities"] = [{"category": category, "status": "incompatible", "observation": "Incompatibilidad de prueba"}]
    profile["household_animals"] = []
    profile[field] = [value]
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "blocked"
    assert match["structured_score"] == 100
    assert any(rule["blocking"] for rule in match["hard_rules"])


def test_non_applicable_incompatibility_does_not_block(pet, profile):
    pet["compatibilities"] = [{"category": "birds", "status": "incompatible"}, {"category": "cats", "status": "compatible", "observation": "Observación ficticia"}]
    assert evaluate_match(pet, profile)["eligibility"] == "eligible"


@pytest.mark.parametrize("status", ["unknown", "not_applicable", None])
def test_unknown_never_becomes_compatible_or_blocked(pet, profile, status):
    pet["compatibilities"] = [] if status is None else [{"category": "cats", "status": status}]
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "needs_review"
    assert any("gatos" in reason for reason in match["unknown"])
    assert not any("gatos" in reason for reason in match["positive"])
    assert not any(rule["blocking"] for rule in match["hard_rules"])


def test_conditional_needs_human_review(pet, profile):
    pet["compatibilities"][0].update(status="conditional", recommendations="Presentación gradual")
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "needs_review"
    assert any("Presentación gradual" in reason for reason in match["attention"])


def test_legacy_compatibility_without_evidence_does_not_invent_positive_reason(pet, profile):
    pet["compatibilities"][0]["observation"] = ""
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "needs_review"
    assert not any("antecedentes positivos" in reason for reason in match["positive"])
    assert any("respalda" in reason for reason in match["unknown"])


def test_continuous_activity_not_binary(pet, profile):
    profile["activity_minutes"] = 60
    match = evaluate_match(pet, profile)
    assert match["dimensions"]["home"]["activity"] == pytest.approx(60 / 70)
    assert 80 < match["home_score"] < 100
    assert match["eligibility"] == "eligible"
    profile["activity_minutes"] = 10
    scarce = evaluate_match(pet, profile)
    assert scarce["eligibility"] == "needs_review"
    assert any("actividad" in reason for reason in scarce["attention"])


def test_company_insufficient_is_explained(pet, profile):
    profile["hours_away"] = 12
    match = evaluate_match(pet, profile)
    assert match["dimensions"]["home"]["company"] == 0
    assert match["eligibility"] == "needs_review"
    assert any("compañía" in reason for reason in match["attention"])


def test_no_inference_large_dog_requires_yard(pet, profile):
    profile["housing_type"] = "apartment"
    profile["secure_outdoor"] = False
    assert evaluate_match(pet, profile)["eligibility"] == "eligible"
    pet["requirements"]["secure_outdoor_required"] = True
    assert evaluate_match(pet, profile)["eligibility"] == "blocked"
    profile["secure_outdoor"] = None
    assert evaluate_match(pet, profile)["eligibility"] == "needs_review"


def test_special_care_explicit_requirement_only(pet, profile):
    pet["requirements"]["special_care"] = True
    profile["special_care_capacity"] = False
    assert evaluate_match(pet, profile)["eligibility"] == "needs_review"
    pet["requirements"]["special_care_required"] = True
    assert evaluate_match(pet, profile)["eligibility"] == "blocked"


def test_mandatory_care_unknown_needs_review(pet, profile):
    pet["requirements"]["mandatory_care"] = ["Medicación según indicación veterinaria"]
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "needs_review"
    assert any("Medicación" in reason for reason in match["unknown"])


def test_empty_profiles_do_not_manufacture_confidence(pet):
    match = evaluate_match(pet, {})
    assert match["eligibility"] == "needs_review"
    assert match["structured_score"] is None
    assert match["confidence"] == 0


@pytest.mark.parametrize("field,state", [("adoption_status", "adopted"), ("adoption_status", "reserved"), ("publication_status", "draft"), ("publication_status", "archived")])
def test_unavailable_pet(pet, profile, field, state):
    pet[field] = state
    assert evaluate_match(pet, profile)["eligibility"] == "unavailable"


def test_soft_preferences_do_not_reject_senior(pet, profile):
    profile.update(stages=["young"], sizes=["Pequeño"])
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "eligible"
    assert match["preference_score"] < 100
    assert match["home_score"] == 100


def test_explicit_species_acceptance_is_respected(pet, profile):
    profile["species"] = ["cat"]
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "blocked"
    assert any(rule["id"] == "species_accepted" for rule in match["hard_rules"])
    profile["species"] = []
    assert evaluate_match(pet, profile)["eligibility"] == "eligible"


@pytest.mark.parametrize("species", ["bird", "rabbit", "hamster"])
def test_other_species_group_matches_real_species(pet, profile, species):
    pet["species"] = species
    profile["species"] = ["other"]
    assert evaluate_match(pet, profile)["eligibility"] == "eligible"
    pet["species"] = "cat"
    assert evaluate_match(pet, profile)["eligibility"] == "blocked"


def test_unconfirmed_empty_household_never_certifies_absence(pet, profile):
    profile.update(household_animals=[], children_age_groups=[], household_confirmed=None)
    match = evaluate_match(pet, profile)
    assert match["eligibility"] == "needs_review"
    assert any("conviviría" in reason for reason in match["unknown"])
    profile["household_confirmed"] = True
    assert evaluate_match(pet, profile)["eligibility"] == "eligible"


def test_observation_input_is_not_mutated(pet, profile):
    before = deepcopy((pet, profile))
    evaluate_match(pet, profile)
    assert (pet, profile) == before


def test_membership_functions_boundaries():
    assert sufficient(60, 70) == pytest.approx(6 / 7)
    assert sufficient(120, 70) == 1
    assert company(4, 6) == 1
    assert company(9, 6) == 0.5
    assert triangular(5, 0, 5, 10) == 1
    assert triangular(2.5, 0, 5, 10) == 0.5
    assert trapezoidal(8, 0, 2, 6, 10) == 0.5
    with pytest.raises(ValueError):
        triangular(2, 5, 1, 10)
