"""Dashboard banners, read from TOFAA CRM. Gifting OS stores no banners of its own.

This server calls GET {CRM_API_URL}/api/v1/integrations/banners with the shared secret in the X-API-Key header. The key
never reaches a browser: the dashboard asks this server (GET /api/v1/banners), never the CRM.
By default nothing is remembered here (CRM_BANNERS_CACHE_SECONDS = 0): every dashboard load asks the CRM, so uploads
and deletions there show on the next page open. The CRM decides what is live today (switched on, inside Show from /
Show until) and clears its own copy whenever a banner changes. If the CRM is down, slow or refuses the key, the dashboard simply shows no
banners (and the failure is remembered briefly, so a CRM outage does not slow every dashboard load).
"""

import logging
import threading
import time
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, ValidationError, field_validator

from src.core.config import settings
from src.core.schema import to_camel

log = logging.getLogger(__name__)

PATH = "/api/v1/integrations/banners"
MAX_BANNERS = 50
FAILURE_CACHE_SECONDS = 15


class CrmBanner(BaseModel):
    """One banner as the dashboard needs it: a picture with optional alt text."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    id: str
    title: str | None = None
    image_url: str

    @field_validator("image_url")
    @classmethod
    def _safe_link(cls, value: str) -> str:
        # Only real web links reach an <img>: no javascript:, data: or relative paths. Plain http only outside production.
        if value.startswith("https://") or (not settings.is_production and value.startswith("http://")):
            return value
        raise ValueError("unsafe image link")


class CrmBannerSource:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._cached: tuple[float, list[CrmBanner]] | None = None  # (expires at, banners)

    def live(self) -> list[CrmBanner]:
        now = time.monotonic()
        cached = self._cached
        if cached and cached[0] > now:
            return cached[1]
        with self._lock:  # one fetch at a time; others reuse its result
            cached = self._cached
            if cached and cached[0] > time.monotonic():
                return cached[1]
            banners, ok = self._fetch()
            ttl = settings.CRM_BANNERS_CACHE_SECONDS if ok else FAILURE_CACHE_SECONDS
            self._cached = (time.monotonic() + ttl, banners)
            return banners

    def clear(self) -> None:
        with self._lock:
            self._cached = None

    def _fetch(self) -> tuple[list[CrmBanner], bool]:
        base, key = settings.CRM_API_URL.strip().rstrip("/"), settings.CRM_API_KEY or ""
        if not base or not key:
            return [], True  # not set up: no banners, nothing to report
        try:
            response = httpx.get(
                base + PATH,
                headers={"X-API-Key": key, "Accept": "application/json"},
                timeout=settings.CRM_TIMEOUT_SECONDS,
                follow_redirects=False,  # never resend the key to wherever a redirect points
            )
            response.raise_for_status()
            items: Any = response.json().get("data")
        except httpx.HTTPStatusError as exc:
            log.warning("CRM banners unavailable: the CRM answered %s.", exc.response.status_code)
            return [], False
        except (httpx.HTTPError, ValueError, AttributeError) as exc:
            log.warning("CRM banners unavailable: %s.", type(exc).__name__)
            return [], False
        if not isinstance(items, list):
            log.warning("CRM banners unavailable: unexpected response shape.")
            return [], False
        banners: list[CrmBanner] = []
        for item in items[:MAX_BANNERS]:
            try:
                banners.append(CrmBanner.model_validate(item))
            except ValidationError:
                log.warning("Skipped a CRM banner that failed validation.")
        return banners, True


crm_banners = CrmBannerSource()
