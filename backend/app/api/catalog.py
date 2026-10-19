from math import ceil
from typing import Literal
import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, exists, func, or_, select

from app.core.security import get_db
from app.db.models import Compatibility, Organization, Pet
from app.services.pets import available_query, pet_public, pets_public

router = APIRouter(tags=["catalog"])


@router.get("/pets")
def list_pets(species: str | None = Query(default=None, max_length=40), location: str | None = Query(default=None, max_length=80),
              department: str | None = Query(default=None, max_length=80), stage: str | None = Query(default=None, max_length=20),
              size: str | None = Query(default=None, max_length=30), sex: str | None = Query(default=None, max_length=20),
              energy: Literal["low", "medium", "high"] | None = None,
              query: str = Query(default="", max_length=300), sort: Literal["default", "name", "age", "senior", "recent"] = "default",
              page: int = Query(default=1, ge=1, le=100000), page_size: int = Query(default=12, ge=1, le=48),
              organization_id: str | None = Query(default=None, max_length=64),
              compatibility_category: str | None = Query(default=None, max_length=60),
              compatibility_categories: str | None = Query(default=None, max_length=600),
              compatibility_status: Literal["compatible", "conditional", "unknown", "incompatible", "not_applicable"] | None = None,
              trait: str | None = Query(default=None, max_length=80), special_care: bool | None = None,
              secure_outdoor: bool | None = None, availability: Literal["available", "under_review", "reserved", "adopted", "withdrawn", "all"] = "available",
              ids: str | None = Query(default=None, max_length=6400),
              db=Depends(get_db)):
    statement = available_query()
    if ids is not None:
        selected_ids = [value for value in ids.split(",") if value]
        if len(selected_ids) > 100:
            raise HTTPException(422, "Se pueden consultar hasta 100 identificadores. Los resultados se paginan.")
        statement = statement.where(Pet.id.in_(selected_ids))
    if species == "other":
        statement = statement.where(Pet.species.not_in(["dog", "cat"]))
    elif species and species != "all":
        statement = statement.where(Pet.species == species)
    for field, value in ((Pet.location, location), (Pet.department, department), (Pet.size, size), (Pet.sex, sex), (Pet.organization_id, organization_id)):
        if value and value != "all":
            statement = statement.where(field == value)
    if availability != "all":
        statement = statement.where(Pet.adoption_status == availability)
    if stage and stage != "all":
        statement = statement.where(func.json_extract(Pet.data, "$.stage") == stage)
    if energy:
        ranges = {"low": (0, 2), "medium": (3, 3), "high": (4, 5)}
        statement = statement.where(Pet.energy.between(*ranges[energy]))
    if query:
        query = "".join(c for c in unicodedata.normalize("NFKD", query.casefold()) if not unicodedata.combining(c))
        value = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        statement = statement.where(or_(*[func.normalize_text(field).like(value, escape="\\") for field in (Pet.name, Pet.location, func.json_extract(Pet.data, "$.story"), func.json_extract(Pet.data, "$.traits"))]))
    if trait:
        # json_each compares complete trait values, avoiding accidental substring matches.
        values = func.json_each(Pet.data, "$.traits").table_valued("value")
        normalized_trait = "".join(c for c in unicodedata.normalize("NFKD", trait.casefold()) if not unicodedata.combining(c))
        statement = statement.where(exists(select(1).select_from(values).where(func.normalize_text(values.c.value) == normalized_trait)))
    if special_care is not None:
        statement = statement.where(func.json_extract(Pet.data, "$.requirements.special_care") == special_care)
    if secure_outdoor is not None:
        statement = statement.where(func.json_extract(Pet.data, "$.requirements.secure_outdoor_required") == secure_outdoor)
    categories = [compatibility_category] if compatibility_category else []
    if compatibility_categories:
        categories.extend(value.strip() for value in compatibility_categories.split(","))
    categories = list(dict.fromkeys(categories))
    if len(categories) > 12 or any(not re.fullmatch(r"[a-z][a-z0-9_]{0,59}", category) for category in categories):
        raise HTTPException(422, "Seleccioná hasta doce categorías de convivencia válidas.")
    for category in categories:
        # Each independent EXISTS is ANDed: every selected household category must qualify.
        criteria = [Compatibility.pet_id == Pet.id, Compatibility.category == category]
        if compatibility_status:
            criteria.append(Compatibility.status == compatibility_status)
        match = exists(select(Compatibility.id).where(*criteria))
        if compatibility_status == "unknown":
            missing = ~exists(select(Compatibility.id).where(Compatibility.pet_id == Pet.id, Compatibility.category == category))
            statement = statement.where(or_(match, missing))
        else:
            statement = statement.where(match)
    count = db.scalar(select(func.count()).select_from(statement.subquery())) or 0
    ordering = {"default": (Pet.created_at.asc(), Pet.id), "recent": (Pet.created_at.desc(), Pet.id), "name": (func.lower(Pet.name), Pet.id), "age": (Pet.months.asc(), Pet.id), "senior": (Pet.months.desc(), Pet.id)}
    rows = db.scalars(statement.order_by(*ordering[sort]).offset((page - 1) * page_size).limit(page_size))
    return {"items": pets_public(db, rows), "total": count, "page": page, "page_size": page_size, "pages": ceil(count / page_size)}


@router.get("/pets/{pet_id}")
def pet_detail(pet_id: str, db=Depends(get_db)):
    pet = db.scalar(available_query().where(Pet.id == pet_id))
    if not pet:
        raise HTTPException(404, "No encontramos esta ficha pública.")
    return pet_public(db, pet)


@router.get("/filters")
def filters(db=Depends(get_db)):
    statement = available_query().where(Pet.adoption_status == "available")
    rows = db.scalars(statement).all()
    org_ids = {x.organization_id for x in rows}
    organizations = db.scalars(select(Organization).where(Organization.id.in_(org_ids)).order_by(Organization.name)).all() if org_ids else []
    return {"species": sorted({x.species for x in rows}), "locations": sorted({x.location for x in rows}),
            "departments": sorted({x.department for x in rows}), "organizations": [{"id": x.id, "name": x.name} for x in organizations],
            "compatibility_categories": sorted(set(db.scalars(select(Compatibility.category).join(Pet).where(Pet.publication_status == "published").distinct())) | {"dogs", "cats", "birds", "rabbits", "small_mammals", "other_pets", "young_children", "school_children", "teenagers"})}
