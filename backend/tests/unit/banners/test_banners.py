import struct
import zlib
from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.core import images
from src.modules.auth.rbac import Role
from src.modules.banners.schemas import BannerCreate, BannerUpdate
from src.modules.banners.service import BANNER_MIN_WIDTH, BANNER_RATIO, audience_allows, is_live


def actor(role):
    return SimpleNamespace(role=role)


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


def test_banner_picture_must_have_the_1000_by_90_shape_but_any_size():
    assert BANNER_RATIO == (1000, 90)
    for content, kind in ((png(800, 90), "image/png"), (jpeg(1000, 100), "image/jpeg"), (webp_lossless(1000, 120), "image/webp")):
        with pytest.raises(HTTPException) as caught:
            images.store_image(None, "banners/x", content, kind, aspect_ratio=BANNER_RATIO, min_width=BANNER_MIN_WIDTH)
        assert caught.value.status_code == 422 and "same shape" in caught.value.detail
    # Right shape but too small is refused; right shape at any larger size gets past the shape check (storage is not reached with None).
    with pytest.raises(HTTPException) as small:
        images.store_image(None, "banners/x", png(300, 27), "image/png", aspect_ratio=BANNER_RATIO, min_width=BANNER_MIN_WIDTH)
    assert "too small" in small.value.detail
    for content, kind in ((png(2000, 180), "image/png"), (png(1000, 90), "image/png"), (jpeg(1500, 135), "image/jpeg")):
        with pytest.raises(AttributeError):  # past validation, it tries to use the missing storage client
            images.store_image(None, "banners/x", content, kind, aspect_ratio=BANNER_RATIO, min_width=BANNER_MIN_WIDTH)


def test_banner_has_no_text_fields():
    for name in ("title", "body", "cta_url", "image_url", "placement"):
        with pytest.raises(ValidationError):
            BannerCreate(**{name: "x"})
    with pytest.raises(ValidationError):
        BannerUpdate(title="x")


def test_end_date_cannot_precede_start_and_patch_needs_a_field():
    with pytest.raises(ValidationError):
        BannerCreate(starts_on=date(2026, 11, 10), ends_on=date(2026, 11, 1))
    with pytest.raises(ValidationError):
        BannerUpdate()
    with pytest.raises(ValidationError):
        BannerUpdate(audience=None)


def test_is_live_respects_active_flag_and_schedule():
    today = date(2026, 11, 16)
    assert is_live({"is_active": True}, today)
    assert not is_live({"is_active": False}, today)
    assert not is_live({"is_active": True, "starts_on": "2026-11-17"}, today)
    assert not is_live({"is_active": True, "ends_on": "2026-11-15"}, today)
    assert is_live({"is_active": True, "starts_on": "2026-11-16", "ends_on": "2026-11-16"}, today)


def test_audience_targets_clients_or_staff():
    assert audience_allows("ALL", actor(Role.CLIENT)) and audience_allows("ALL", actor(Role.KAM))
    assert audience_allows("CLIENT", actor(Role.CLIENT)) and not audience_allows("CLIENT", actor(Role.KAM))
    assert audience_allows("STAFF", actor(Role.SUPER_ADMIN)) and not audience_allows("STAFF", actor(Role.CLIENT))
