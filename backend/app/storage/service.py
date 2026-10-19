from __future__ import annotations

import io
import os
import re
import shutil
import threading
import time
import uuid
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError


class ImageStorageError(ValueError):
    """A safe, user-facing rejection, without leaking local filesystem paths."""

    def __init__(self, message: str, code: str = "invalid_image", status: int = 422):
        super().__init__(message)
        self.code, self.status = code, status


@dataclass(frozen=True)
class ProcessedImage:
    id: str
    variants: dict[str, dict[str, Any]]
    bytes_total: int


class ImageStore:
    VARIANTS = {"card": (480, 100_000), "detail": (960, 280_000), "full": (1600, 650_000)}
    FORMATS = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
    IDENTIFIER = re.compile(r"^[0-9a-f]{32}$")
    _conversion = threading.BoundedSemaphore(1)

    def __init__(self, settings: Any):
        self.root = Path(settings.media_dir).resolve()
        self.max_bytes = int(settings.media_max_input_bytes)
        self.max_pixels = int(settings.media_max_pixels)
        self.quota = int(settings.media_quota_bytes)
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / ".pending").mkdir(exist_ok=True)

    def _directory(self, image_id: str) -> Path:
        if not self.IDENTIFIER.fullmatch(image_id):
            raise ImageStorageError("Identificador de fotografía inválido.", status=404)
        directory = (self.root / image_id).resolve()
        if directory.parent != self.root:
            raise ImageStorageError("Fotografía no encontrada.", status=404)
        return directory

    @staticmethod
    def _encode(image: Image.Image, longest: int, cap: int) -> tuple[bytes, int, int]:
        size = longest
        while size >= 160:
            resized = ImageOps.contain(image, (size, size), Image.Resampling.LANCZOS)
            for quality in (82, 74, 66, 58, 50):
                output = io.BytesIO()
                resized.save(output, format="WEBP", quality=quality, method=4)
                if output.tell() <= cap:
                    return output.getvalue(), resized.width, resized.height
            size = int(size * 0.82)
        raise ImageStorageError("No pudimos optimizar esta fotografía dentro del límite de espacio.")

    def save(self, data: bytes, content_type: str | None = None) -> ProcessedImage:
        if not data or len(data) > self.max_bytes:
            raise ImageStorageError("La fotografía supera el tamaño permitido o está vacía.", "image_size", 413)
        if not self._conversion.acquire(timeout=5):
            raise ImageStorageError("Estamos procesando otra fotografía. Intentá nuevamente.", "media_busy", 503)
        temporary: Path | None = None
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                try:
                    with Image.open(io.BytesIO(data)) as probe:
                        actual = self.FORMATS.get(probe.format or "")
                        if actual is None or getattr(probe, "n_frames", 1) != 1:
                            raise ImageStorageError("Usá una fotografía JPEG, PNG o WebP sin animación.", "image_type", 415)
                        if content_type and content_type.split(";", 1)[0].lower() not in (actual, "application/octet-stream"):
                            raise ImageStorageError("El tipo declarado no coincide con el contenido de la fotografía.", "image_type", 415)
                        if min(probe.size) < 64 or max(probe.size) > 16000 or probe.width * probe.height > self.max_pixels:
                            raise ImageStorageError("La fotografía tiene dimensiones fuera del límite permitido.", "image_dimensions", 413)
                        probe.verify()
                    with Image.open(io.BytesIO(data)) as source:
                        source.load()
                        image = ImageOps.exif_transpose(source)
                        icc = source.info.get("icc_profile")
                        alpha = image.getchannel("A") if image.mode == "RGBA" else None
                        if icc:
                            if len(icc) > 1_048_576:
                                raise ImageStorageError("El perfil de color de la fotografía es demasiado grande.")
                            try:
                                image = ImageCms.profileToProfile(image if image.mode in ("RGB", "CMYK", "LAB") else image.convert("RGB"), ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")
                            except (OSError, ValueError, ImageCms.PyCMSError) as exc:
                                raise ImageStorageError("El perfil de color de la fotografía no es válido.") from exc
                            if alpha is not None:
                                image.putalpha(alpha)
                        else:
                            image = image.convert("RGBA" if image.mode in ("RGBA", "LA") or "transparency" in image.info else "RGB")
                        image.info.clear()
                except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
                    raise ImageStorageError("El archivo no es una fotografía válida o no puede procesarse.") from exc
            encoded = {name: self._encode(image, longest, cap) for name, (longest, cap) in self.VARIANTS.items()}
            total = sum(len(item[0]) for item in encoded.values())
            used = sum(item.stat().st_size for item in self.root.rglob("*.webp") if item.is_file())
            if used + total > self.quota:
                raise ImageStorageError("Se alcanzó la cuota de fotografías. El equipo debe liberar espacio.", "media_quota", 409)
            if shutil.disk_usage(self.root).free < total + 50_000_000:
                raise ImageStorageError("No hay espacio suficiente para guardar la fotografía.", "media_space", 503)
            image_id = uuid.uuid4().hex
            temporary = self.root / ".pending" / image_id
            temporary.mkdir()
            variants: dict[str, dict[str, Any]] = {}
            for name, (payload, width, height) in encoded.items():
                (temporary / f"{name}.webp").write_bytes(payload)
                variants[name] = {"path": f"{image_id}/{name}.webp", "width": width, "height": height, "size": len(payload)}
            os.replace(temporary, self._directory(image_id))
            temporary = None
            return ProcessedImage(image_id, variants, total)
        except OSError as exc:
            raise ImageStorageError("No pudimos guardar la fotografía. Intentá nuevamente.", "media_io", 503) from exc
        finally:
            if temporary is not None and temporary.resolve().parent == (self.root / ".pending").resolve():
                shutil.rmtree(temporary, ignore_errors=True)
            self._conversion.release()

    def read_variant(self, image_id: str, variant: str) -> Path:
        if variant not in self.VARIANTS:
            raise ImageStorageError("Versión de fotografía no encontrada.", status=404)
        path = self._directory(image_id) / f"{variant}.webp"
        if not path.is_file() or path.resolve().parent != self._directory(image_id):
            raise ImageStorageError("Fotografía no encontrada.", status=404)
        return path

    def delete(self, image_id: str) -> None:
        directory = self._directory(image_id)
        if directory.exists():
            shutil.rmtree(directory)

    def cleanup_pending(self, older_than_seconds: int = 3600) -> int:
        removed = 0
        pending = (self.root / ".pending").resolve()
        for child in pending.iterdir():
            if self.IDENTIFIER.fullmatch(child.name) and child.is_dir() and child.resolve().parent == pending and time.time() - child.stat().st_mtime > older_than_seconds:
                shutil.rmtree(child)
                removed += 1
        return removed

    def cleanup_unreferenced(self, referenced_ids: set[str], older_than_seconds: int = 3600) -> int:
        """Reclaim only old UUID directories after a crash before the DB commit.

        A grace period protects a conversion that has finished writing while its
        metadata transaction is still pending. Caller runs this at startup or
        under the single-writer maintenance lock.
        """
        removed = 0
        for child in self.root.iterdir():
            if self.IDENTIFIER.fullmatch(child.name) and child.name not in referenced_ids and child.is_dir() and child.resolve().parent == self.root and time.time() - child.stat().st_mtime > older_than_seconds:
                shutil.rmtree(child)
                removed += 1
        return removed
