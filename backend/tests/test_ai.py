from types import SimpleNamespace

import pytest

from app.ai.models import AIUnavailable, get_models
from app.ai.search import IntelligenceService, lexical_bm25, reciprocal_rank_fusion
from app.ai.store import VectorStore
from app.ai.text import build_animal_text, build_preference_text


def settings(tmp_path, **changes):
    values = dict(model_cache_dir=tmp_path / "models", lancedb_path=tmp_path / "lance", ai_enabled=False, rerank_enabled=False, embedding_backend="openvino", embedding_model_id="hotchpotch/bekko-embedding-v1-a8m", embedding_model_revision="c721113d59a1d91b447450324f51c4b3332c924a", rerank_model_id="Horizon-Labs/multilingual-reranker-small", rerank_model_revision="c2ec8fb3e499725b168bbed2164bfee095360f77", ai_threads=1, ai_max_concurrent=1, rerank_pool_size=12, model_load_timeout=5)
    return SimpleNamespace(**(values | changes))


def animal(pet_id="dog-1", **changes):
    return dict(id=pet_id, profile_version=1, name="Ejemplo ficticio", species="dog", size="Mediano", stage="adult", energy=3, traits=["Cariñoso"], location="Minas", story="Paseos tranquilos y compañía", needs="Compañía frecuente", requirements={"activity_minutes": 60, "max_hours_alone": 4, "training_level": 1}, publication_status="published", adoption_status="available", compatibilities=[]) | changes


def test_public_representation_excludes_contacts():
    text = build_animal_text(animal(email="private@example.invalid", telephone="099123456", responsible="Persona privada"))
    assert "private@example.invalid" not in text and "099123456" not in text and "Persona privada" not in text
    query = build_preference_text({"name": "Privado", "email": "private@example.invalid", "species": ["cat"], "preferences_text": "tranquilo"})
    assert "Privado" not in query and "@" not in query and "tranquilo" in query


def test_semantic_text_prioritizes_needs_before_long_story():
    text = build_animal_text(animal(story="Historia muy extensa " * 400, needs="Necesita compañía frecuente.", compatibilities=[{"category": "cats", "status": "conditional", "observation": "Necesita presentación gradual."}]))
    assert text.index("Necesita compañía") < text.index("Historia muy extensa")
    assert text.index("Convivencia con cats") < text.index("Historia muy extensa")


def test_closed_model_executor_is_not_reused_on_app_restart(tmp_path):
    config = settings(tmp_path)
    first = get_models(config)
    first.close()
    second = get_models(config)
    assert second is not first and not second._closed


def test_rrf_normalizes_incompatible_signal_scales():
    scores = reciprocal_rank_fusion([["first", "second"], ["second", "first"]])
    assert scores["first"] == scores["second"]
    assert all(0 <= value <= 1 for value in scores.values())


def test_lexical_finds_unindexed_accented_profiles():
    assert lexical_bm25([animal("unindexed", story="Juegos y mucha compañía"), animal("other", story="Animal curioso", needs="")], "compania", 10)[0] == "unindexed"


def test_real_lance_exact_vector_bm25_upsert_and_delete(tmp_path):
    store = VectorStore(settings(tmp_path))
    first, second = animal("first"), animal("second", story="Ronroneos y descanso tranquilo", species="cat")
    store.upsert(first, [1.0] + [0.0] * 383)
    store.upsert(second, [0.0, 1.0] + [0.0] * 382)
    result = store.search(vector=[1.0] + [0.0] * 383, text="paseos", eligible_ids=["first", "second"])
    assert result["vector"][0]["pet_id"] == "first"
    assert result["lexical"][0]["pet_id"] == "first"
    first["profile_version"] = 2
    store.upsert(first, [1.0] + [0.0] * 383)
    assert store.status()["rows"] == 2
    assert store.search(vector=[1.0] + [0.0] * 383, eligible_ids=["first"])["vector"][0]["profile_version"] == 2
    store.delete("first")
    assert store.status()["rows"] == 1
    with pytest.raises(ValueError):
        store.search(text="test", eligible_ids=["x' OR 1=1"])


def test_text_only_index_does_not_fake_embeddings(tmp_path):
    store = VectorStore(settings(tmp_path))
    store.upsert(animal(), None)
    assert store.search(text="paseos")["lexical"]
    assert store.search(vector=[1.0] + [0.0] * 383)["vector"] == []


def test_missing_models_degrade_without_discarding_candidates(tmp_path):
    service = IntelligenceService(settings(tmp_path, ai_enabled=True, rerank_enabled=True))
    result = service.search([animal()], {"activity_minutes": 60, "hours_away": 4, "training_commitment": 2}, "tranquilo", 5)
    assert result["results"]
    assert result["meta"]["degraded"]
    assert result["meta"]["components"]["embedding"] == "unavailable"
    assert result["meta"]["components"]["reranker"] == "unavailable"


def test_neural_model_cannot_reintroduce_blocked_pet(tmp_path):
    service = IntelligenceService(settings(tmp_path, ai_enabled=True, rerank_enabled=True))
    seen = []

    class Models:
        def embed(self, texts, **kwargs):
            return [[1.0] + [0.0] * 383]

        def rerank(self, query, documents):
            seen.extend(documents)
            return [0.9] * len(documents)

    service.models = Models()
    result = service.search([animal("blocked", story="PROHIBIDO", compatibilities=[{"category": "cats", "status": "incompatible"}]), animal("allowed")], {"household_animals": ["cat"]}, "gatitos")
    assert [item["pet"]["id"] for item in result["results"]] == ["allowed"]
    assert result["excluded"]["blocked"] == 1
    assert not any("PROHIBIDO" in document for document in seen)


def test_stale_index_versions_do_not_boost_current_profiles(tmp_path):
    service = IntelligenceService(settings(tmp_path))
    service.store.upsert(animal("stale", profile_version=1), [1.0] + [0.0] * 383)
    result = service.search([animal("stale", profile_version=2, story="Sin término buscado", needs="")], {}, "paseos")
    assert result["results"][0]["match"]["retrieval_score"] is None
