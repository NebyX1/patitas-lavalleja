"""Pinned, explicitly prepared model artifacts; CPU-only, bounded inference.

No Hugging Face network calls happen here. Model preparation is a separate CLI.
"""

from __future__ import annotations

from collections import OrderedDict
from concurrent.futures import Future, ThreadPoolExecutor, TimeoutError as FutureTimeout
import hashlib
import json
from pathlib import Path
import threading
import time
from typing import Any

EMBEDDING_ID = "hotchpotch/bekko-embedding-v1-a8m"
EMBEDDING_REVISION = "c721113d59a1d91b447450324f51c4b3332c924a"
RERANK_ID = "Horizon-Labs/multilingual-reranker-small"
RERANK_REVISION = "c2ec8fb3e499725b168bbed2164bfee095360f77"
DIMENSIONS = 384


class AIUnavailable(RuntimeError):
    """The caller should preserve structured matching and describe degradation."""


def artifact_dir(settings: Any, model: str) -> Path:
    revision = settings.embedding_model_revision if model == "bekko" else settings.rerank_model_revision
    return Path(settings.model_cache_dir) / model / revision


def cpu_features() -> dict:
    """Diagnostic best effort, repeated by the model preparation/benchmark CLI."""
    try:
        import numpy as np
        return {"avx2": bool(np._core._multiarray_umath.__cpu_features__.get("AVX2", False))}
    except (AttributeError, ImportError):
        path = Path("/proc/cpuinfo")
        if path.exists():
            return {"avx2": "avx2" in path.read_text(errors="replace").lower()}
        return {"avx2": None}


class CPUModel:
    def __init__(self, settings: Any, kind: str):
        import numpy as np
        from tokenizers import Tokenizer

        self.kind = kind
        self.settings = settings
        self.backend = "onnx"
        self.np = np
        folder = artifact_dir(settings, kind)
        expected_id = EMBEDDING_ID if kind == "bekko" else RERANK_ID
        configured_id = settings.embedding_model_id if kind == "bekko" else settings.rerank_model_id
        if configured_id != expected_id:
            raise AIUnavailable("El identificador configurado no coincide con el modelo auditado; no se sustituye silenciosamente.")
        manifest_path = folder / "manifest.json"
        if not manifest_path.is_file():
            raise AIUnavailable(f"{kind}: falta el manifiesto de preparación verificable.")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        configured_revision = settings.embedding_model_revision if kind == "bekko" else settings.rerank_model_revision
        if manifest.get("model_id") != expected_id or manifest.get("revision") != configured_revision:
            raise AIUnavailable(f"{kind}: el manifiesto no corresponde al modelo y revisión configurados.")
        for name, metadata in manifest.get("files", {}).items():
            file_path = folder / name
            if not file_path.is_file() or file_path.stat().st_size != metadata["bytes"]:
                raise AIUnavailable(f"{kind}: artefactos locales incompletos; repetí la preparación verificada.")
        tokenizer_path = folder / "tokenizer.json"
        if not tokenizer_path.is_file():
            raise AIUnavailable(f"{kind}: faltan artefactos locales; ejecutá prepare_models.py.")
        self.tokenizer = Tokenizer.from_file(str(tokenizer_path))
        self.tokenizer.enable_padding(pad_id=0, pad_token="<pad>")
        self.tokenizer.enable_truncation(max_length=512 if kind == "bekko" else 384, strategy="longest_first" if kind == "bekko" else "only_second")
        self.query_tokenizer = None
        if kind == "horizon":
            self.query_tokenizer = Tokenizer.from_file(str(tokenizer_path))
            self.query_tokenizer.enable_truncation(max_length=120)
        self.session = None
        self.compiled = None
        self.backend_warning = None
        if kind == "bekko" and settings.embedding_backend in {"openvino", "auto"}:
            try:
                if cpu_features()["avx2"] is False:
                    raise AIUnavailable("AVX2 no disponible; se requiere ruta ONNX del mismo modelo.")
                import openvino as ov

                xml_path = folder / "openvino/openvino_model.xml"
                if not xml_path.is_file():
                    raise AIUnavailable("No se preparó el artefacto OpenVINO Bekko.")
                core = ov.Core()
                self.compiled = core.compile_model(str(xml_path), "CPU", {
                    "INFERENCE_NUM_THREADS": settings.ai_threads,
                    "NUM_STREAMS": 1,
                    "PERFORMANCE_HINT": "LATENCY",
                })
                self.backend = "openvino"
                self.input_names = {port.any_name for port in self.compiled.inputs}
                return
            except Exception as exc:
                self.backend_warning = f"OpenVINO no disponible ({type(exc).__name__}); fallback ONNX del mismo Bekko."

        import onnxruntime as ort

        filename = "onnx/model.onnx" if kind == "bekko" else "onnx/model_quantized.onnx"
        model_path = folder / filename
        if not model_path.is_file():
            raise AIUnavailable(f"{kind}: falta {filename}. {self.backend_warning or ''}".strip())
        options = ort.SessionOptions()
        options.intra_op_num_threads = settings.ai_threads
        options.inter_op_num_threads = 1
        options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
        self.session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
        self.input_names = {item.name for item in self.session.get_inputs()}

    def infer(self, items: list[str] | list[tuple[str, str]], timeout: float) -> Any:
        np = self.np
        # Bound query side separately to keep essential document information within
        # the trained 384-token pair window even for long visitor descriptions.
        if self.kind == "horizon":
            safe_items = []
            for query, document in items:
                query_tokens = self.query_tokenizer.encode(query, add_special_tokens=False).ids
                safe_items.append((self.query_tokenizer.decode(query_tokens), document))
            encodings = self.tokenizer.encode_batch(safe_items)
        else:
            encodings = self.tokenizer.encode_batch(items)
        data = {
            "input_ids": np.asarray([item.ids for item in encodings], dtype=np.int64),
            "attention_mask": np.asarray([item.attention_mask for item in encodings], dtype=np.int64),
        }
        feeds = {key: value for key, value in data.items() if key in self.input_names}
        if self.backend == "openvino":
            request = self.compiled.create_infer_request()
            request.start_async(feeds)
            if not request.wait_for(int(timeout * 1000)):
                request.cancel()
                # Wait for cancellation to release owned inputs before returning.
                try:
                    request.wait()
                except RuntimeError:
                    pass
                raise AIUnavailable("Bekko excedió el tiempo de inferencia configurado.")
            output = np.array(request.get_output_tensor(0).data, copy=True)
        else:
            import onnxruntime as ort

            run_options = ort.RunOptions()
            timer = threading.Timer(timeout, lambda: setattr(run_options, "terminate", True))
            timer.daemon = True
            timer.start()
            try:
                output = self.session.run(None, feeds, run_options)[0]
            except Exception as exc:
                raise AIUnavailable(f"{self.kind}: la inferencia CPU falló ({type(exc).__name__}).") from exc
            finally:
                timer.cancel()
        if self.kind == "bekko":
            if output.ndim == 3:
                mask = data["attention_mask"][..., None]
                output = (output * mask).sum(axis=1) / np.maximum(mask.sum(axis=1), 1)
            if output.ndim != 2 or output.shape[1] != DIMENSIONS:
                raise AIUnavailable("Bekko devolvió dimensiones incompatibles con el índice.")
            norms = np.linalg.norm(output, axis=1, keepdims=True)
            output = output / np.maximum(norms, 1e-12)
        else:
            output = 1 / (1 + np.exp(-np.clip(output[:, 0], -60, 60)))
        if not np.isfinite(output).all():
            raise AIUnavailable("El modelo devolvió valores no finitos.")
        return output.tolist()


class LocalModels:
    """One lazy model instance per process, shared with the indexer.

    One background loading executor and a bounded inference semaphore prevent
    duplicate instances under concurrent HTTP calls. Timeout does not start a
    second loader: the existing future can complete for a subsequent request.
    """

    def __init__(self, settings: Any):
        self.settings = settings
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="model-loader")
        self._lock = threading.Lock()
        self._gate = threading.BoundedSemaphore(settings.ai_max_concurrent)
        self._futures: dict[str, Future] = {}
        self._errors: dict[str, str] = {}
        self._cache: OrderedDict[str, tuple[float, list[float]]] = OrderedDict()
        self._closed = False

    def _get(self, kind: str) -> CPUModel:
        if not self.settings.ai_enabled or kind == "horizon" and not self.settings.rerank_enabled:
            raise AIUnavailable("Componente de IA desactivado por configuración.")
        with self._lock:
            if kind not in self._futures:
                self._futures[kind] = self._executor.submit(CPUModel, self.settings, kind)
            future = self._futures[kind]
        try:
            model = future.result(timeout=self.settings.model_load_timeout)
            self._errors.pop(kind, None)
            return model
        except FutureTimeout as exc:
            self._errors[kind] = "Tiempo máximo de carga excedido; la búsqueda estructurada continúa disponible."
            raise AIUnavailable(self._errors[kind]) from exc
        except Exception as exc:
            self._errors[kind] = str(exc) if isinstance(exc, AIUnavailable) else f"No se pudo cargar {kind} ({type(exc).__name__})."
            raise AIUnavailable(self._errors[kind]) from exc

    def _infer(self, kind: str, items: list, batch_size: int) -> list:
        if not items:
            return []
        # A pending request waits at most two seconds for the single CPU slot.
        if not self._gate.acquire(timeout=2):
            raise AIUnavailable("Inferencia ocupada; se conserva la evaluación estructurada.")
        try:
            model = self._get(kind)
            output = []
            deadline = time.monotonic() + min(self.settings.model_load_timeout, 30)
            for index in range(0, len(items), batch_size):
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise AIUnavailable("Se agotó el presupuesto de inferencia CPU.")
                output.extend(model.infer(items[index:index + batch_size], timeout=remaining))
            return output
        finally:
            self._gate.release()

    def embed(self, texts: list[str], *, cache: bool = False) -> list[list[float]]:
        if cache and len(texts) == 1:
            key = hashlib.sha256(texts[0].encode()).hexdigest()
            with self._lock:
                cached = self._cache.get(key)
                if cached and cached[0] > time.monotonic():
                    self._cache.move_to_end(key)
                    return [cached[1]]
            result = self._infer("bekko", texts, 8)
            with self._lock:
                self._cache[key] = (time.monotonic() + 300, result[0])
                self._cache.move_to_end(key)
                while len(self._cache) > 128:
                    self._cache.popitem(last=False)
            return result
        return self._infer("bekko", texts, 8)

    def rerank(self, query: str, documents: list[str]) -> list[float]:
        return self._infer("horizon", [(query, document) for document in documents], 4)

    def status(self) -> dict:
        result = {}
        for kind, enabled in (("bekko", self.settings.ai_enabled), ("horizon", self.settings.ai_enabled and self.settings.rerank_enabled)):
            future = self._futures.get(kind)
            ready = future is not None and future.done() and not future.exception()
            result[kind] = {"enabled": enabled, "ready": ready, "state": "disabled" if not enabled else "ready" if ready else "error" if kind in self._errors else "not_loaded", "error": self._errors.get(kind)}
            if ready:
                result[kind]["backend"] = future.result().backend
                result[kind]["warning"] = future.result().backend_warning
        return result

    def close(self) -> None:
        self._closed = True
        self._executor.shutdown(wait=False, cancel_futures=True)


_instances: dict[tuple, LocalModels] = {}
_instances_lock = threading.Lock()


def get_models(settings: Any) -> LocalModels:
    key = (str(settings.model_cache_dir), settings.embedding_model_id, settings.embedding_model_revision, settings.rerank_model_id, settings.rerank_model_revision, settings.embedding_backend, settings.ai_threads, settings.ai_max_concurrent, settings.ai_enabled, settings.rerank_enabled)
    with _instances_lock:
        if key not in _instances or _instances[key]._closed:
            _instances[key] = LocalModels(settings)
        return _instances[key]
