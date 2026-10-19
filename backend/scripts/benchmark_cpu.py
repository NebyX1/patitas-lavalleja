"""Measured CPU model/retrieval/matching benchmarks on synthetic public profiles.

No generated number is reported as an adoption probability or production SLA.
All profiles are explicitly synthetic and use 12 repeated semantic templates;
their vectors are generated with real Bekko once per template, not fabricated.
The corpus scaling experiment measures exact retrieval and end-to-end matching,
not the time to embed N distinct documents. A separate embedding test is timed.
"""

from __future__ import annotations

import argparse
import hashlib
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import platform
import statistics
import sys
import threading
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ai.models import cpu_features, get_models
from app.ai.search import IntelligenceService
from app.ai.store import VectorStore
from app.ai.text import build_animal_text
from app.core.config import Settings
from app.domain.matching.rules import RULES_VERSION


def percentile(values, fraction):
    values = sorted(values)
    position = (len(values) - 1) * fraction
    lower, upper = math.floor(position), math.ceil(position)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)


def distribution(values):
    return {"count": len(values), "p50_ms": round(statistics.median(values), 3), "p95_ms": round(percentile(values, 0.95), 3), "min_ms": round(min(values), 3), "max_ms": round(max(values), 3)}


def timed(call, repetitions):
    values = []
    output = None
    for _ in range(repetitions):
        started = time.perf_counter()
        output = call()
        values.append((time.perf_counter() - started) * 1000)
    return distribution(values), output


def sample(index):
    template = index % 12
    dog = template % 2 == 0
    return {
        "id": f"synthetic-{index}", "profile_version": 1, "name": f"Ficticio {template}",
        "species": "dog" if dog else "cat", "size": ["Pequeño", "Mediano", "Grande"][template % 3],
        "stage": ["young", "adult", "senior"][template % 3], "energy": template % 5 + 1,
        "location": "Minas", "traits": ["Tranquilo" if template % 3 == 0 else "Juguetón"],
        "story": "Perro tranquilo que disfruta paseos suaves y compañía frecuente." if dog else "Gato curioso que disfruta explorar rincones, perseguir juguetes y descansar.",
        "needs": "Adaptación gradual y seguimiento del responsable.",
        "requirements": {"activity_minutes": 20 + template * 5, "max_hours_alone": 3 + template % 4, "training_level": 1},
        "compatibilities": [{"category": "cats", "status": "incompatible" if template == 0 else "unknown" if template == 2 else "compatible", "observation": "Observación totalmente ficticia creada para medir el sistema."}],
        "publication_status": "published", "adoption_status": "available", "is_demo": True,
    }


def main(args):
    import psutil

    args.output.parent.mkdir(parents=True, exist_ok=True)
    settings = Settings(ai_enabled=True, rerank_enabled=True, embedding_backend=args.backend, ai_threads=args.threads, model_cache_dir=args.model_dir, lancedb_path=args.work_dir / "warmup")
    process = psutil.Process()
    peak_rss = process.memory_info().rss
    stop = threading.Event()

    def sample_ram():
        nonlocal peak_rss
        while not stop.wait(0.05):
            peak_rss = max(peak_rss, process.memory_info().rss)

    monitor = threading.Thread(target=sample_ram, daemon=True)
    monitor.start()
    wall_start, cpu_start = time.perf_counter(), process.cpu_times()
    report = {
        "measured_at_utc": datetime.now(timezone.utc).isoformat(),
        "hardware": {"platform": platform.platform(), "processor": platform.processor(), "physical_cores": psutil.cpu_count(logical=False), "logical_cpus": psutil.cpu_count(), "total_ram_bytes": psutil.virtual_memory().total, **cpu_features()},
        "configuration": {"threads": args.threads, "backend": args.backend, "repetitions": args.repetitions, "rerank_pool_size": settings.rerank_pool_size, "corpus": "synthetic profiles, 12 repeated semantic templates with real Bekko embeddings", "cache": "query embedding warm cache for end-to-end repeated searches; microbenchmark disables query cache", "warning": "Local development host measurements; not Antel VPS measurements."},
        "rules_version": RULES_VERSION,
        "source_sha256": {str(path.relative_to(Path(__file__).resolve().parents[1])): hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__).resolve(), *sorted((Path(__file__).resolve().parents[1] / "app/ai").glob("*.py")), *sorted((Path(__file__).resolve().parents[1] / "app/domain/matching").glob("*.py"))]},
        "experiments": [],
    }
    try:
        models = get_models(settings)
        templates = [sample(index) for index in range(12)]
        texts = [build_animal_text(pet) for pet in templates]
        cold_started = time.perf_counter()
        vectors = models.embed(texts)
        report["cold_embedding_load_and_12_documents_ms"] = round((time.perf_counter() - cold_started) * 1000, 3)
        embedding_stats, _ = timed(lambda: models.embed([texts[0]]), args.repetitions)
        report["embedding_one_document"] = embedding_stats
        query = "Busco un perro tranquilo para paseos suaves y compañía"
        query_vector = models.embed([query])[0]
        cold_started = time.perf_counter()
        models.rerank(query, texts)
        report["cold_reranker_load_and_12_pairs_ms"] = round((time.perf_counter() - cold_started) * 1000, 3)
        rerank_stats, _ = timed(lambda: models.rerank(query, texts), args.repetitions)
        report["rerank_12_pairs"] = rerank_stats
        profile = {"species": ["dog"], "activity_minutes": 60, "activity_level": 2, "hours_away": 4, "training_commitment": 2, "household_animals": ["cat"], "household_confirmed": True, "preferred_traits": ["Tranquilo"]}
        for count in args.counts:
            config = settings.model_copy(update={"lancedb_path": args.work_dir / f"corpus-{count}"})
            store = VectorStore(config)
            store.reset()
            pets = [sample(index) for index in range(count)]
            started = time.perf_counter()
            for start in range(0, count, 512):
                store.upsert_many([(pet, vectors[index % 12]) for index, pet in enumerate(pets[start:start + 512], start)])
            indexing_ms = (time.perf_counter() - started) * 1000
            retrieval_stats, _ = timed(lambda: store.search(vector=query_vector, text="perro tranquilo paseos", limit=20), args.repetitions)
            outcomes = {}
            for enabled in (False, True):
                service = IntelligenceService(config.model_copy(update={"rerank_enabled": enabled}))
                service.models = models
                # Explicit warmup; shared model singleton per runtime configuration.
                service.search(pets, profile, query, 12)
                stats, result = timed(lambda: service.search(pets, profile, query, 12), args.repetitions)
                outcomes["rerank_on" if enabled else "rerank_off"] = stats | {"degraded": result["meta"]["degraded"], "components": result["meta"]["components"], "results": len(result["results"]), "excluded": result["excluded"]}
            experiment = {"profiles": count, "lance_upsert_ms": round(indexing_ms, 3), "exact_vector_and_bm25": retrieval_stats, "matching": outcomes}
            report["experiments"].append(experiment)
            print(json.dumps(experiment, ensure_ascii=False), flush=True)
        report["models"] = models.status()
    finally:
        stop.set()
        monitor.join(timeout=1)
        report["peak_rss_bytes"] = peak_rss
        cpu_end = process.cpu_times()
        elapsed = time.perf_counter() - wall_start
        cpu_seconds = cpu_end.user + cpu_end.system - cpu_start.user - cpu_start.system
        report["resources"] = {"wall_seconds": round(elapsed, 3), "cpu_seconds": round(cpu_seconds, 3), "average_cpu_percent_one_core_basis": round(cpu_seconds / elapsed * 100, 2)}
        args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({"report": str(args.output), "peak_rss_bytes": peak_rss, "resources": report["resources"]}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--counts", nargs="+", type=int, default=[100, 1000, 10000])
    parser.add_argument("--repetitions", type=int, default=5)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--backend", choices=["openvino", "onnx"], default="openvino")
    parser.add_argument("--model-dir", type=Path, default=Path(".data/models"))
    parser.add_argument("--work-dir", type=Path, default=Path(".data/benchmarks"))
    parser.add_argument("--output", type=Path, default=Path("../reports/performance/local-cpu.json"))
    arguments = parser.parse_args()
    if not 1 <= arguments.repetitions <= 100 or any(count < 1 or count > 100000 for count in arguments.counts):
        parser.error("Use 1..100 repetitions and 1..100000 synthetic profiles")
    main(arguments)
