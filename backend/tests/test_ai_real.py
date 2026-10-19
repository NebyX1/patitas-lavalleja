"""Opt-in real local weights, not substitutes: RUN_AI_INTEGRATION=1 pytest ..."""
import os
from pathlib import Path

import pytest

from app.ai.models import DIMENSIONS, get_models
from app.ai.store import VectorStore
from app.core.config import Settings


@pytest.mark.skipif(os.environ.get("RUN_AI_INTEGRATION") != "1", reason="Requires explicitly prepared local CPU model artifacts")
def test_real_bekko_horizon_and_lance(tmp_path):
    settings = Settings(ai_enabled=True, rerank_enabled=True, embedding_backend="openvino", model_cache_dir=Path(os.environ.get("MODEL_CACHE_DIR", ".data/models")), lancedb_path=tmp_path / "lance")
    models = get_models(settings)
    texts = ["Perro tranquilo que disfruta paseos suaves y compañía frecuente.", "Gato juguetón y curioso que explora rincones y persigue pelotas."]
    vectors = models.embed(texts)
    assert len(vectors) == 2 and len(vectors[0]) == DIMENSIONS
    assert abs(sum(value * value for value in vectors[0]) - 1) < 1e-4
    scores = models.rerank("Busco un perro tranquilo para paseos suaves", texts)
    assert scores[0] > scores[1]
    long_scores = models.rerank("Preferencias y rutina del hogar " * 300, texts)
    assert len(long_scores) == 2 and all(0 <= score <= 1 for score in long_scores)
    store = VectorStore(settings)
    for index, (text, vector) in enumerate(zip(texts, vectors)):
        store.upsert({"id": f"sample-{index}", "profile_version": 1, "name": "Ficticio", "species": "dog", "story": text}, vector)
    query = models.embed(["Un perro tranquilo para caminatas suaves"])[0]
    assert store.search(vector=query, text="paseos")["vector"][0]["pet_id"] == "sample-0"


@pytest.mark.skipif(os.environ.get("RUN_AI_INTEGRATION") != "1", reason="Requires explicitly prepared OpenVINO and ONNX Bekko artifacts")
def test_real_onnx_bekko_matches_openvino(tmp_path):
    import numpy as np

    settings = Settings(ai_enabled=True, embedding_backend="openvino", model_cache_dir=Path(os.environ.get("MODEL_CACHE_DIR", ".data/models")), lancedb_path=tmp_path / "lance")
    texts = ["Perro tranquilo para paseos y compañía.", "Gato muy juguetón y curioso."]
    original = np.asarray(get_models(settings).embed(texts))
    fallback = np.asarray(get_models(settings.model_copy(update={"embedding_backend": "onnx"})).embed(texts))
    assert original.shape == fallback.shape == (2, 384)
    assert np.sum(original * fallback, axis=1).min() > 0.999
