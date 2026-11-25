"""Image checks in src.core.images (kept from the old banner tests: the helpers are shared)."""
import struct
import zlib

import pytest
from fastapi import HTTPException

from src.core import images

RATIO = (1000, 90)


def png(width, height):
    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))
    header = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(b"\x00")) + chunk(b"IEND", b"")


def jpeg(width, height):
    sof = b"\xff\xc0" + struct.pack(">HBHHB", 11, 8, height, width, 1) + b"\x01\x11\x00"
    app0 = b"\xff\xe0" + struct.pack(">H", 16) + b"JFIF\x00" + b"\x00" * 9
    return b"\xff\xd8" + app0 + sof + b"\xff\xd9"


def webp_lossless(width, height):
    bits = (width - 1) | ((height - 1) << 14)
    payload = b"VP8L" + struct.pack("<I", 5) + b"\x2f" + struct.pack("<I", bits)
    return b"RIFF" + struct.pack("<I", 4 + len(payload)) + b"WEBP" + payload


def test_image_size_reads_png_jpeg_and_webp():
    assert images.image_size(png(1000, 90), "image/png") == (1000, 90)
    assert images.image_size(jpeg(1000, 90), "image/jpeg") == (1000, 90)
    assert images.image_size(webp_lossless(1000, 90), "image/webp") == (1000, 90)
    assert images.image_size(b"garbage", "image/jpeg") is None


def test_aspect_ratio_and_min_width_checks():
    for content, kind in ((png(800, 90), "image/png"), (jpeg(1000, 100), "image/jpeg"), (webp_lossless(1000, 120), "image/webp")):
        with pytest.raises(HTTPException) as caught:
            images.store_image(None, "x/y", content, kind, aspect_ratio=RATIO, min_width=500)
        assert caught.value.status_code == 422 and "same shape" in caught.value.detail
    with pytest.raises(HTTPException) as small:
        images.store_image(None, "x/y", png(300, 27), "image/png", aspect_ratio=RATIO, min_width=500)
    assert "too small" in small.value.detail
    for content, kind in ((png(2000, 180), "image/png"), (jpeg(1500, 135), "image/jpeg")):
        with pytest.raises(AttributeError):  # past validation, it tries to use the missing storage client
            images.store_image(None, "x/y", content, kind, aspect_ratio=RATIO, min_width=500)
