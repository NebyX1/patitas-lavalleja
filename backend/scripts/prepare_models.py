"""Explicit minimal, pinned model download; never used on an HTTP request.

Run: python scripts/prepare_models.py --model-dir .data/models [--onnx-fallback]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.ai.models import EMBEDDING_ID, EMBEDDING_REVISION, RERANK_ID, RERANK_REVISION, cpu_features


def prepare(model_dir: Path, *, onnx_fallback: bool = False, only: str = "all") -> list[dict]:
    specifications = [
        ("bekko", EMBEDDING_ID, EMBEDDING_REVISION, ["tokenizer.json", "tokenizer_config.json", "config.json", "1_Pooling/config.json", "openvino/openvino_model.xml", "openvino/openvino_model.bin"] + (["onnx/model.onnx"] if onnx_fallback else [])),
        ("horizon", RERANK_ID, RERANK_REVISION, ["tokenizer.json", "tokenizer_config.json", "config.json", "onnx/model_quantized.onnx"]),
    ]
    results = []
    for kind, model_id, revision, files in specifications:
        if only not in {"all", kind}:
            continue
        request = urllib.request.Request(f"https://huggingface.co/api/models/{model_id}/revision/{revision}?blobs=true", headers={"User-Agent": "Patitas-Intelligence-Preparation/1.0"})
        with urllib.request.urlopen(request, timeout=60) as response:
            metadata = json.load(response)
        if metadata["sha"] != revision:
            raise RuntimeError("Remote model revision differs from the pinned manifest")
        entries = {entry["rfilename"]: entry for entry in metadata["siblings"]}
        print(json.dumps({"model": model_id, "revision": revision, "download_bytes": sum(entries[name]["size"] for name in files)}, ensure_ascii=False), flush=True)
        folder = model_dir / kind / revision
        manifest = {"model_id": model_id, "revision": revision, "files": {}}
        for name in files:
            target = folder / name
            target.parent.mkdir(parents=True, exist_ok=True)
            entry = entries[name]
            expected_sha = (entry.get("lfs") or {}).get("sha256")
            existing_digest = None
            if target.exists() and target.stat().st_size == entry["size"]:
                with target.open("rb") as existing:
                    existing_digest = hashlib.file_digest(existing, "sha256").hexdigest()
            if existing_digest is None or expected_sha and existing_digest != expected_sha:
                request = urllib.request.Request(f"https://huggingface.co/{model_id}/resolve/{revision}/{name}", headers={"User-Agent": "Patitas-Intelligence-Preparation/1.0"})
                temporary = target.with_name(target.name + ".download")
                try:
                    digest = hashlib.sha256()
                    total = 0
                    with urllib.request.urlopen(request, timeout=180) as response, temporary.open("wb") as output:
                        while block := response.read(1024 * 1024):
                            output.write(block)
                            digest.update(block)
                            total += len(block)
                    existing_digest = digest.hexdigest()
                    if total != entry["size"] or expected_sha and existing_digest != expected_sha:
                        raise RuntimeError(f"Integrity check failed for {model_id}/{name}")
                    temporary.replace(target)
                finally:
                    temporary.unlink(missing_ok=True)
            manifest["files"][name] = {"bytes": entry["size"], "sha256": existing_digest}
            print(json.dumps({"file": str(target), "bytes": entry["size"], "verified": True}), flush=True)
        (folder / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        results.append({"model": model_id, "revision": revision, "bytes": sum(item["bytes"] for item in manifest["files"].values())})
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", type=Path, default=Path(".data/models"))
    parser.add_argument("--onnx-fallback", action="store_true")
    parser.add_argument("--only", choices=["all", "bekko", "horizon"], default="all")
    args = parser.parse_args()
    print(json.dumps({"cpu": cpu_features(), "models": prepare(args.model_dir, onnx_fallback=args.onnx_fallback, only=args.only)}, indent=2), flush=True)
