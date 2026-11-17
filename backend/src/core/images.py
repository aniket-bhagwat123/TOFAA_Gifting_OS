"""Picture uploads (avatars, client logos, proposal option photos) into the public `images` bucket."""

import logging
from uuid import uuid4

from fastapi import HTTPException
from supabase import Client

logger = logging.getLogger(__name__)

BUCKET = "images"
AVATAR_MAX_BYTES = 2 * 1024 * 1024
PHOTO_MAX_BYTES = 5 * 1024 * 1024
IMAGE_TYPES = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
_PUBLIC_MARKER = f"/object/public/{BUCKET}/"


def _looks_like(content: bytes, content_type: str) -> bool:
    """The file's first bytes must match the type it claims to be."""
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    return content[:4] == b"RIFF" and content[8:12] == b"WEBP"


def image_size(content: bytes, content_type: str) -> tuple[int, int] | None:
    """Width and height read from the file header (PNG, JPEG, WebP), or None if it can't be read."""
    try:
        if content_type == "image/png":
            return int.from_bytes(content[16:20], "big"), int.from_bytes(content[20:24], "big")
        if content_type == "image/jpeg":
            i = 2
            while i + 9 < len(content):
                if content[i] != 0xFF:
                    i += 1
                    continue
                marker = content[i + 1]
                if marker == 0xFF:
                    i += 1
                    continue
                if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
                    i += 2
                    continue
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    return int.from_bytes(content[i + 7:i + 9], "big"), int.from_bytes(content[i + 5:i + 7], "big")
                i += 2 + int.from_bytes(content[i + 2:i + 4], "big")
            return None
        chunk = content[12:16]
        if chunk == b"VP8X":
            return int.from_bytes(content[24:27], "little") + 1, int.from_bytes(content[27:30], "little") + 1
        if chunk == b"VP8L":
            bits = int.from_bytes(content[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
        if chunk == b"VP8 ":
            return int.from_bytes(content[26:28], "little") & 0x3FFF, int.from_bytes(content[28:30], "little") & 0x3FFF
    except Exception:
        return None
    return None


def store_image(
    database: Client, folder: str, content: bytes, content_type: str, *, max_bytes: int = AVATAR_MAX_BYTES,
    exact_size: tuple[int, int] | None = None,
) -> str:
    """Validate and save a picture under `folder`; returns its public URL."""
    content_type = (content_type or "").split(";")[0].strip().lower()
    if content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Attach a PNG, JPG or WebP image.")
    if not content:
        raise HTTPException(status_code=422, detail="The file is empty.")
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"The image is too large. Use one under {max_bytes // (1024 * 1024)} MB.")
    if not _looks_like(content, content_type):
        raise HTTPException(status_code=422, detail="That file is not a valid image.")
    if exact_size and image_size(content, content_type) != exact_size:
        raise HTTPException(status_code=422, detail=f"The image must be exactly {exact_size[0]} × {exact_size[1]} pixels.")
    path = f"{folder}/{uuid4().hex}.{IMAGE_TYPES[content_type]}"
    storage = database.storage.from_(BUCKET)
    try:
        storage.upload(path, content, {"content-type": content_type})
        return str(storage.get_public_url(path)).rstrip("?")
    except Exception as exc:  # the storage client raises its own error types
        logger.exception("Could not store image")
        raise HTTPException(status_code=503, detail="The image could not be saved. Please try again.") from exc


def remove_image(database: Client, url: str | None) -> None:
    """Delete a picture we stored earlier. Never fails the request: an orphaned file is harmless."""
    if not url or _PUBLIC_MARKER not in url:
        return
    try:
        database.storage.from_(BUCKET).remove([url.split(_PUBLIC_MARKER, 1)[1].split("?", 1)[0]])
    except Exception:
        logger.warning("Could not delete image %s", url)
