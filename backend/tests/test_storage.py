import io
from types import SimpleNamespace

import pytest
from PIL import Image

from app.storage.service import ImageStorageError, ImageStore


def store(tmp_path, **overrides):
    values = dict(media_dir=tmp_path, media_max_input_bytes=1_000_000, media_max_pixels=2_000_000, media_quota_bytes=1_000_000)
    values.update(overrides)
    return ImageStore(SimpleNamespace(**values))


def photo(size=(800, 600)):
    output = io.BytesIO()
    Image.new("RGB", size, "orange").save(output, "JPEG", exif=Image.Exif())
    return output.getvalue()


def test_webp_variants_persist_without_private_metadata(tmp_path):
    media = store(tmp_path)
    result = media.save(photo(), "image/jpeg")
    assert set(result.variants) == {"card", "detail", "full"}
    assert result.bytes_total > 0
    restarted = store(tmp_path)
    for name, variant in result.variants.items():
        with Image.open(restarted.read_variant(result.id, name)) as saved:
            assert saved.format == "WEBP"
            assert max(saved.size) <= media.VARIANTS[name][0]
            assert not saved.getexif()
            assert "icc_profile" not in saved.info
            assert variant["size"] <= media.VARIANTS[name][1]
    restarted.delete(result.id)
    with pytest.raises(ImageStorageError):
        restarted.read_variant(result.id, "full")


@pytest.mark.parametrize("payload,declared", [(b"<svg onload='alert(1)'></svg>", "image/jpeg"), (b"not an image", "image/png"), (photo(), "image/png")])
def test_rejects_content_disguised_as_photo(tmp_path, payload, declared):
    with pytest.raises(ImageStorageError):
        store(tmp_path).save(payload, declared)


def test_dimensions_input_limit_and_quota(tmp_path):
    with pytest.raises(ImageStorageError, match="dimensiones"):
        store(tmp_path, media_max_pixels=100_000).save(photo())
    with pytest.raises(ImageStorageError) as error:
        store(tmp_path, media_max_input_bytes=10).save(photo())
    assert error.value.status == 413
    with pytest.raises(ImageStorageError, match="cuota"):
        store(tmp_path, media_quota_bytes=1).save(photo())


def test_no_path_traversal(tmp_path):
    media = store(tmp_path)
    for value in ("../private", "A" * 32, "x/" + "a" * 32):
        with pytest.raises(ImageStorageError):
            media.delete(value)
