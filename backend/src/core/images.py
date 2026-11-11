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


def store_image(
    database: Client, folder: str, content: bytes, content_type: str, *, max_bytes: int = AVATAR_MAX_BYTES
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
