"""LanceDB public index. SQLite always owns availability and profile versions."""

from __future__ import annotations

import hashlib
from pathlib import Path
import re
import threading

from .models import DIMENSIONS
from .text import build_animal_text

_LOCKS: dict[str, threading.RLock] = {}
_LOCKS_GATE = threading.Lock()


def _id_literal(value: str) -> str:
    # Lance expressions are generated only from validated stable IDs. User-entered
    # SQL/filter fragments never reach this layer.
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value):
        raise ValueError("Invalid stable public pet ID")
    return "'" + value + "'"


class VectorStore:
    def __init__(self, settings):
        import lancedb
        import pyarrow as pa

        self.settings = settings
        self.path = Path(settings.lancedb_path)
        self.path.mkdir(parents=True, exist_ok=True)
        version = hashlib.sha256(f"{settings.embedding_model_id}:{settings.embedding_model_revision}:{DIMENSIONS}".encode()).hexdigest()[:16]
        self.table_name = "pets_" + version
        self.model_version = f"{settings.embedding_model_id}@{settings.embedding_model_revision}"
        with _LOCKS_GATE:
            self.lock = _LOCKS.setdefault(str(self.path.resolve()), threading.RLock())
        self.db = lancedb.connect(str(self.path))
        self.schema = pa.schema([
            pa.field("pet_id", pa.string(), nullable=False),
            pa.field("profile_version", pa.int64(), nullable=False),
            pa.field("text", pa.string(), nullable=False),
            pa.field("species", pa.string(), nullable=False),
            pa.field("location", pa.string(), nullable=False),
            pa.field("model_version", pa.string(), nullable=False),
            pa.field("vector", pa.list_(pa.float32(), DIMENSIONS), nullable=True),
        ])
        with self.lock:
            self.table = self.db.create_table(self.table_name, schema=self.schema, exist_ok=True)
            self._ensure_fts()

    def _ensure_fts(self) -> None:
        # Native Lance BM25 supports incremental unindexed fragments; do not use
        # Tantivy, ANN or cloud embedding integrations.
        existing = self.table.list_indices()
        if not any("FTS" in str(getattr(index, "index_type", "")).upper() for index in existing):
            from lancedb.index import FTS
            self.table.create_index("text", config=FTS(language="Spanish", stem=True, ascii_folding=True, remove_stop_words=True), replace=True)

    def _row(self, pet: dict, vector: list[float] | None) -> dict:
        _id_literal(pet["id"])
        if vector is not None:
            import math
            if len(vector) != DIMENSIONS or not all(math.isfinite(float(value)) for value in vector):
                raise ValueError("Index requires finite 384-dimensional Bekko vectors")
        return {
            "pet_id": pet["id"], "profile_version": int(pet["profile_version"]),
            "text": build_animal_text(pet), "species": str(pet["species"]),
            "location": str(pet.get("location", "")), "model_version": self.model_version,
            "vector": vector,
        }

    def upsert(self, pet: dict, vector: list[float] | None) -> None:
        self.upsert_many([(pet, vector)])

    def upsert_many(self, entries: list[tuple[dict, list[float] | None]]) -> None:
        import pyarrow as pa
        if not entries:
            return
        rows = [self._row(pet, vector) for pet, vector in entries]
        with self.lock:
            self.table.merge_insert("pet_id").when_matched_update_all().when_not_matched_insert_all().execute(pa.Table.from_pylist(rows, schema=self.schema), on_bad_vectors="null")

    def delete(self, pet_id: str) -> None:
        with self.lock:
            self.table.delete("pet_id = " + _id_literal(pet_id))

    def reset(self) -> None:
        with self.lock:
            self.table = self.db.create_table(self.table_name, schema=self.schema, mode="overwrite")
            self._ensure_fts()

    def search(self, *, vector: list[float] | None = None, text: str = "", eligible_ids: list[str] | None = None, limit: int = 30) -> dict:
        # Restrict neural/text retrieval to the structured candidate pool first.
        # Query outputs are checked again against the current SQLite snapshot.
        if eligible_ids == []:
            return {"vector": [], "lexical": []}
        expression = None
        if eligible_ids is not None:
            expression = "pet_id IN (" + ",".join(_id_literal(value) for value in eligible_ids) + ")"
        columns = ["pet_id", "profile_version", "text", "model_version"]
        result = {"vector": [], "lexical": []}
        with self.lock:
            if vector is not None:
                query = self.table.search(vector, query_type="vector").distance_type("cosine").select(columns + ["_distance"]).limit(limit)
                if expression:
                    query = query.where(expression, prefilter=True)
                result["vector"] = query.to_list()
            if text.strip():
                query = self.table.search(text[:4000], query_type="fts", fts_columns="text").select(columns + ["_score"]).limit(limit)
                if expression:
                    query = query.where(expression, prefilter=True)
                result["lexical"] = query.to_list()
        return result

    def status(self) -> dict:
        with self.lock:
            return {"ready": True, "table": self.table_name, "rows": self.table.count_rows(), "dimensions": DIMENSIONS, "model_version": self.model_version, "search": "exact_cosine+bm25_spanish"}
