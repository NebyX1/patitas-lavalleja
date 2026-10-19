"""Structured-first recommendation pipeline with truthful CPU degradation."""

from __future__ import annotations

import math
import threading
import time
from collections.abc import Callable

from app.domain.matching.engine import evaluate_match
from app.domain.matching.rules import RANKING_WEIGHTS, RRF_K, RULES_VERSION

from .models import AIUnavailable, get_models
from .text import build_animal_text, build_preference_text, normalize_text


def reciprocal_rank_fusion(rankings: list[list[str]], k: int = RRF_K) -> dict[str, float]:
    scores: dict[str, float] = {}
    for ranking in rankings:
        for rank, pet_id in enumerate(dict.fromkeys(ranking), 1):
            scores[pet_id] = scores.get(pet_id, 0) + 1 / (k + rank)
    # Fixed normalization by the theoretical best across participating rankings;
    # raw cosine, BM25 and neural logits are never added together.
    maximum = len(rankings) / (k + 1) if rankings else 1
    return {key: value / maximum for key, value in scores.items()}


def lexical_bm25(pets: list[dict], query: str, limit: int) -> list[str]:
    """Bounded in-process BM25 fallback for available SQLite candidate texts.

    Lance BM25 with Spanish stemming is the primary persistent text index. This
    Unicode/diacritic-normalized fallback also finds not-yet-indexed profiles.
    """
    terms = set(normalize_text(query).split())
    if not terms or not pets:
        return []
    documents = [(pet["id"], normalize_text(build_animal_text(pet)).split()) for pet in pets]
    average = sum(len(tokens) for _, tokens in documents) / len(documents) or 1
    frequencies = {term: sum(term in tokens for _, tokens in documents) for term in terms}
    scores = []
    for pet_id, tokens in documents:
        score = 0.0
        for term in terms:
            tf = tokens.count(term)
            if tf:
                idf = math.log(1 + (len(documents) - frequencies[term] + 0.5) / (frequencies[term] + 0.5))
                score += idf * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * len(tokens) / average))
        if score:
            scores.append((score, pet_id))
    return [pet_id for _, pet_id in sorted(scores, key=lambda item: (-item[0], item[1]))[:limit]]


class IntelligenceService:
    def __init__(self, settings):
        self.settings = settings
        self.models = get_models(settings)
        self._store = None
        self._store_lock = threading.Lock()
        self._store_error = None

    @property
    def store(self):
        with self._store_lock:
            if self._store is None:
                from .store import VectorStore
                self._store = VectorStore(self.settings)
            return self._store

    def search(self, pets: list[dict], profile: dict, query: str = "", limit: int = 12, progress: Callable[[dict], None] | None = None) -> dict:
        started = time.perf_counter()
        def report(stage, state, **detail):
            if progress:
                progress({"type": "progress", "stage": stage, "state": state, "elapsed_ms": round((time.perf_counter() - started) * 1000), **detail})
        report("structured", "running", profiles=len(pets))
        limit = max(1, min(int(limit), 50))
        evaluations = {pet["id"]: {"pet": pet, "match": evaluate_match(pet, profile)} for pet in pets}
        excluded = {key: sum(item["match"]["eligibility"] == key for item in evaluations.values()) for key in ("blocked", "unavailable")}
        candidates = [item for item in evaluations.values() if item["match"]["eligibility"] in {"eligible", "needs_review"}]
        structured = sorted(candidates, key=lambda item: (-(item["match"]["structured_score"] if item["match"]["structured_score"] is not None else -1), -item["match"]["completeness"], item["pet"]["id"]))
        text = build_preference_text(profile, query)
        candidate_map = {item["pet"]["id"]: item for item in candidates}
        warnings = []
        components = {"structured": "ready", "embedding": "not_used" if self.settings.ai_enabled else "disabled", "reranker": "not_used" if self.settings.ai_enabled and self.settings.rerank_enabled else "disabled", "vector": "not_used", "lexical": "sqlite_bm25"}
        retrieval_rankings: list[list[str]] = []
        pool_size = min(max(self.settings.rerank_pool_size, limit), 50)
        report("structured", "complete", profiles=len(pets), eligible=len(candidates), excluded=sum(excluded.values()))
        lexical = lexical_bm25([item["pet"] for item in candidates], text, pool_size * 2)
        vector = None
        report("embedding", "running" if self.settings.ai_enabled and text and candidates else "disabled" if not self.settings.ai_enabled else "not_used")
        if self.settings.ai_enabled and text and candidates:
            try:
                vector = self.models.embed([text], cache=True)[0]
                components["embedding"] = "ready"
            except Exception as exc:
                components["embedding"] = "unavailable"
                warnings.append(str(exc) if isinstance(exc, AIUnavailable) else "No se pudo generar el embedding local; continúa el matching estructurado.")
            report("embedding", "complete" if vector is not None else "unavailable")
        report("retrieval", "running" if text and candidates else "not_used", eligible=len(candidates))
        if text and candidates:
            try:
                retrieved = self.store.search(vector=vector, text=text, eligible_ids=list(candidate_map), limit=pool_size * 2)
                components["vector"] = "ready" if vector is not None else "not_used"
                components["lexical"] = "lance_bm25_spanish+sqlite_new_profiles"
                for key in ("vector", "lexical"):
                    ids = [row["pet_id"] for row in retrieved[key] if row["pet_id"] in candidate_map and row["profile_version"] == candidate_map[row["pet_id"]]["pet"]["profile_version"]]
                    if ids:
                        if key == "vector":
                            retrieval_rankings.append(ids)
                        else:
                            # Native BM25 plus newly published/unindexed profiles
                            # form one lexical channel, avoiding a double vote.
                            lexical = list(dict.fromkeys(ids + lexical))
            except Exception:
                components["vector"] = "unavailable"
                warnings.append("El índice público necesita preparación o reconstrucción; se usan datos actuales de SQLite.")
            report("retrieval", "complete" if components["vector"] != "unavailable" else "unavailable")
        if lexical:
            retrieval_rankings.append(lexical)
        retrieval = reciprocal_rank_fusion(retrieval_rankings)
        # Reserve at least half of the bounded neural pool for top structured
        # candidates, then union semantic candidates without dropping the former.
        reserved = [item["pet"]["id"] for item in structured[:max(1, pool_size // 2)]]
        semantic = sorted(retrieval, key=lambda key: (-retrieval[key], key))
        rerank_ids = list(dict.fromkeys(reserved + semantic + [item["pet"]["id"] for item in structured]))[:pool_size]
        rerank_scores: dict[str, float] = {}
        report("reranker", "running" if self.settings.ai_enabled and self.settings.rerank_enabled and text and rerank_ids else "disabled" if not self.settings.ai_enabled or not self.settings.rerank_enabled else "not_used", candidates=len(rerank_ids))
        if self.settings.ai_enabled and self.settings.rerank_enabled and text and rerank_ids:
            try:
                scores = self.models.rerank(text, [build_animal_text(candidate_map[pet_id]["pet"]) for pet_id in rerank_ids])
                order = sorted(zip(rerank_ids, scores), key=lambda value: (-value[1], value[0]))
                # Rank-based normalization prevents model calibration from being
                # mistaken for a probability of successful adoption.
                rerank_scores = reciprocal_rank_fusion([[pet_id for pet_id, _ in order]])
                components["reranker"] = "ready"
            except Exception as exc:
                components["reranker"] = "unavailable"
                warnings.append(str(exc) if isinstance(exc, AIUnavailable) else "El reranker local no está disponible; se conserva el ranking estructurado e híbrido.")
            report("reranker", "complete" if components["reranker"] == "ready" else "unavailable", candidates=len(rerank_ids))
        report("ranking", "running")
        for item in structured:
            pet_id = item["pet"]["id"]
            match = item["match"]
            # Scores with missing information remain visibly absent; a neutral
            # internal tie-break value is not exposed as an observed score.
            signals = [(RANKING_WEIGHTS["structured"], (match["structured_score"] or 0) / 100)]
            if retrieval_rankings:
                signals.append((RANKING_WEIGHTS["retrieval"], retrieval.get(pet_id, 0)))
            if rerank_scores:
                signals.append((RANKING_WEIGHTS["reranker"], rerank_scores.get(pet_id, 0)))
            score = sum(weight * value for weight, value in signals) / sum(weight for weight, _ in signals)
            match["ranking_score"] = round(score * 100, 2)
            match["retrieval_score"] = round(retrieval.get(pet_id, 0), 4) if retrieval_rankings else None
            match["reranker_score"] = round(rerank_scores[pet_id], 4) if pet_id in rerank_scores else None
        structured.sort(key=lambda item: (item["match"]["eligibility"] != "eligible", -item["match"]["ranking_score"], -item["match"]["completeness"], item["pet"]["id"]))
        if not self.settings.ai_enabled:
            warnings.append("La IA local está desactivada: resultados basados en reglas, lógica difusa y búsqueda textual.")
        elif not self.settings.rerank_enabled:
            warnings.append("El reranking neuronal está desactivado por configuración.")
        degraded = not self.settings.ai_enabled or components["embedding"] == "unavailable" or components["vector"] == "unavailable" or self.settings.rerank_enabled and components["reranker"] == "unavailable"
        report("ranking", "complete", matches=min(limit, len(structured)))
        return {
            "results": structured[:limit], "total": len(structured), "excluded": excluded,
            "meta": {"degraded": bool(degraded), "warnings": list(dict.fromkeys(warnings)), "components": components, "rules_version": RULES_VERSION, "duration_ms": round((time.perf_counter() - started) * 1000, 2)},
        }

    def status(self) -> dict:
        return {"models": self.models.status(), "index": self._store.status() if self._store is not None else {"ready": False, "state": "not_loaded"}, "cpu_only": True}

    def close(self) -> None:
        self.models.close()
