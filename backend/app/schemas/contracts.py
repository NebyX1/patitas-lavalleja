from datetime import datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Credentials(Contract):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=256)

    @field_validator("email")
    @classmethod
    def normalized_email(cls, value):
        value = value.lower()
        if not re.fullmatch(r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", value):
            raise ValueError("Ingresá un correo válido.")
        return value


class Registration(Credentials):
    display_name: str = Field(min_length=1, max_length=80)


class Login(Credentials):
    password: str = Field(min_length=1, max_length=256)


class DemoLogin(Contract):
    user_id: str = Field(min_length=1, max_length=64)


class ResetRequest(Contract):
    email: str = Field(min_length=5, max_length=254)


class ResetPassword(Contract):
    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=12, max_length=256)


class CompatibilityInput(Contract):
    category: str = Field(min_length=1, max_length=60, pattern=r"^[a-z][a-z0-9_]*$")
    status: Literal["compatible", "incompatible", "conditional", "unknown", "not_applicable"] = "unknown"
    observation: str = Field(default="", max_length=3000)
    responsible: str = Field(default="", max_length=120)
    confidence: float | None = Field(default=None, ge=0, le=1)
    evaluated_at: datetime | None = None
    context: str = Field(default="", max_length=2000)
    recommendations: str = Field(default="", max_length=3000)

    @model_validator(mode="after")
    def observed_states_need_evidence(self):
        if self.status in {"compatible", "incompatible", "conditional"} and len(self.observation.strip()) < 10:
            raise ValueError("Una convivencia evaluada necesita una observación de al menos diez caracteres que respalde el dato.")
        return self


class Personality(Contract):
    sociability: float | None = Field(default=None, ge=0, le=5)
    independence: float | None = Field(default=None, ge=0, le=5)
    companionship: float | None = Field(default=None, ge=0, le=5)
    playfulness: float | None = Field(default=None, ge=0, le=5)
    affection: float | None = Field(default=None, ge=0, le=5)
    curiosity: float | None = Field(default=None, ge=0, le=5)
    exploration: float | None = Field(default=None, ge=0, le=5)
    noise_sensitivity: float | None = Field(default=None, ge=0, le=5)
    adaptability: float | None = Field(default=None, ge=0, le=5)
    interaction: float | None = Field(default=None, ge=0, le=5)
    observations: str = Field(default="", max_length=5000)
    likes: list[str] = Field(default_factory=list, max_length=30)


class Requirements(Contract):
    activity_minutes: int | None = Field(default=None, ge=0, le=480)
    mental_stimulation_minutes: int | None = Field(default=None, ge=0, le=240)
    max_hours_alone: float | None = Field(default=None, ge=0, le=24)
    secure_outdoor_required: bool | None = None
    special_care: bool | None = None
    special_care_required: bool | None = None
    training_level: float | None = Field(default=None, ge=0, le=5)
    training_notes: str = Field(default="", max_length=2000)
    small_space_compatible: bool | None = None
    mobility_needs: str = Field(default="", max_length=2000)
    grooming: str = Field(default="", max_length=2000)
    treatment: str = Field(default="", max_length=3000)
    only_pet: bool | None = None
    gradual_introduction: bool | None = None
    mandatory_care: list[str] = Field(default_factory=list, max_length=30)
    environment: str = Field(default="", max_length=2000)


class PetInput(Contract):
    id: str | None = Field(default=None, max_length=64, pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]*$")
    organization_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    species: str = Field(min_length=1, max_length=40, pattern=r"^[a-z][a-z0-9_]*$")
    age: str = Field(default="Edad estimada a confirmar", max_length=80)
    months: int = Field(default=0, ge=0, le=600)
    stage: Literal["young", "adult", "senior"] = "adult"
    size: Literal["Pequeño", "Mediano", "Grande"] = "Mediano"
    adult_size: str | None = Field(default=None, max_length=30)
    sex: Literal["Macho", "Hembra", "A confirmar"] = "A confirmar"
    location: str = Field(min_length=1, max_length=80)
    department: str = Field(default="Lavalleja", min_length=1, max_length=80)
    breed: str = Field(default="Mestizo", max_length=100)
    weight_kg: float | None = Field(default=None, ge=0, le=200)
    tag: str = Field(default="Una historia por conocer", max_length=80)
    tagIcon: str = Field(default="heart", max_length=30, pattern=r"^[a-z_-]+$")
    tagColor: str = Field(default="#e4edae", pattern=r"^#[a-fA-F0-9]{6}$")
    energy: int | None = Field(default=None, ge=0, le=5)
    pos: str = Field(default="50% 50%", max_length=30, pattern=r"^\d{1,3}% \d{1,3}%$")
    quote: str = Field(default="Conocé mi historia.", max_length=300)
    traits: list[str] = Field(default_factory=list, max_length=30)
    story: str = Field(default="", max_length=10000)
    needs: str = Field(default="", max_length=7000)
    dogs: str = Field(default="A evaluar", max_length=200)
    cats: str = Field(default="A evaluar", max_length=200)
    children: str = Field(default="A evaluar", max_length=200)
    smallSpace: bool | None = None
    care: list[str] = Field(default_factory=list, max_length=30)
    alt: str = Field(default="", max_length=500)
    personality: Personality = Field(default_factory=Personality)
    requirements: Requirements = Field(default_factory=Requirements)
    compatibilities: list[CompatibilityInput] = Field(default_factory=list, max_length=40)
    adoption_status: Literal["available", "under_review", "reserved", "adopted", "withdrawn"] = "available"
    profile_version: int | None = Field(default=None, ge=1)
    is_demo: bool = False

    @field_validator("traits", "care")
    @classmethod
    def short_texts(cls, values):
        if any(not value or len(value) > 500 for value in values):
            raise ValueError("Cada elemento debe contener entre 1 y 500 caracteres.")
        return values

    @field_validator("compatibilities")
    @classmethod
    def unique_categories(cls, values):
        if len({x.category for x in values}) != len(values):
            raise ValueError("Las categorías de convivencia no se pueden repetir.")
        return values


class OrganizationInput(Contract):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=5000)
    locality: str = Field(default="", max_length=80)
    department: str = Field(default="Lavalleja", max_length=80)
    active: bool = True


class MembershipInput(Contract):
    user_id: str = Field(min_length=1, max_length=64)


class UserUpdate(Contract):
    role: Literal["adopter", "responsible", "admin"] | None = None
    active: bool | None = None


class PublicationInput(Contract):
    status: Literal["published", "rejected", "archived"]
    note: str = Field(default="", max_length=3000)


class PetStatusInput(Contract):
    status: Literal["available", "under_review", "reserved", "adopted", "withdrawn"]
    note: str = Field(default="", max_length=3000)


class ApplicationInput(Contract):
    pet_id: str = Field(min_length=1, max_length=64)
    message: str = Field(min_length=10, max_length=5000)
    phone: str = Field(default="", max_length=50)
    locality: str = Field(default="", max_length=80)
    consent: bool

    @field_validator("consent")
    @classmethod
    def has_consent(cls, value):
        if not value:
            raise ValueError("Se necesita tu consentimiento para enviar la solicitud.")
        return value


class ApplicationStatusInput(Contract):
    status: Literal["received", "under_review", "information_requested", "meeting_scheduled", "approved", "rejected", "closed", "completed"]
    note: str = Field(default="", max_length=3000)


class FavoriteInput(Contract):
    pet_id: str = Field(min_length=1, max_length=64)


class AdopterProfileInput(Contract):
    display_name: str = Field(default="", max_length=80)
    species: list[str] = Field(default_factory=list, max_length=12)
    sizes: list[str] = Field(default_factory=list, max_length=6)
    stages: list[str] = Field(default_factory=list, max_length=6)
    activity_level: float | None = Field(default=None, ge=0, le=5)
    activity_minutes: int | None = Field(default=None, ge=0, le=1440)
    hours_away: float | None = Field(default=None, ge=0, le=24)
    experience: Literal["none", "some", "experienced"] | None = None
    training_commitment: float | None = Field(default=None, ge=0, le=5)
    housing_type: str | None = Field(default=None, max_length=100)
    secure_outdoor: bool | None = None
    household_animals: list[str] = Field(default_factory=list, max_length=30)
    children_age_groups: list[str] = Field(default_factory=list, max_length=5)
    household_confirmed: bool | None = None
    special_care_capacity: bool | None = None
    preferred_traits: list[str] = Field(default_factory=list, max_length=30)
    location: str = Field(default="", max_length=80)
    department: str = Field(default="Lavalleja", max_length=80)
    flexibility: float | None = Field(default=None, ge=0, le=5)
    preferences_text: str = Field(default="", max_length=1500)
    home_activity: Literal["quiet", "busy", "unknown"] = "unknown"
    frequent_visitors: bool | None = None
    willing_to_travel: bool | None = None
    accept_seniors: bool | None = None

    @field_validator("species", "sizes", "stages", "household_animals", "children_age_groups", "preferred_traits")
    @classmethod
    def bounded_values(cls, values):
        if any(not isinstance(value, str) or not value or len(value) > 80 for value in values):
            raise ValueError("Las opciones deben contener entre 1 y 80 caracteres.")
        return list(dict.fromkeys(values))


class MatchInput(Contract):
    profile: AdopterProfileInput = Field(default_factory=AdopterProfileInput)
    query: str = Field(default="", max_length=1500)
    limit: int = Field(default=12, ge=1, le=40)
    pet_id: str | None = Field(default=None, max_length=64)


class PersonProfileInput(Contract):
    display_name: str = Field(min_length=1, max_length=80)
    headline: str = Field(default="", max_length=100)
    biography: str = Field(default="", max_length=1200)
    location: str = Field(default="", max_length=80)
    avatar_color: Literal["peach", "lime", "lilac", "blue"] = "peach"
