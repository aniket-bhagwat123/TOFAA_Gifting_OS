"""Tell TOFAA CRM that a client was added, renamed or switched here, so it brings its client accounts into step at once.

A short background call to POST {CRM_API_URL}/api/v1/integrations/clients-changed with the shared key. The reply here
never waits for it, and a failed call is only logged: the CRM also checks on its own.
"""

import logging
import re
import threading

import httpx

from src.core.config import settings

log = logging.getLogger(__name__)
PATH = "/api/v1/integrations/clients-changed"
# Creating a client, editing it, or switching it on or off (not the many records kept under a client).
CHANGES = re.compile(r"^/api/v1/tenants(/[0-9a-fA-F-]{36}(/(activate|deactivate))?)?/?$")


def is_client_change(method: str, path: str, status: int) -> bool:
    return method in ("POST", "PATCH", "PUT", "DELETE") and status < 400 and bool(CHANGES.match(path))


def _send() -> None:
    try:
        httpx.post(settings.CRM_API_URL.strip().rstrip("/") + PATH, headers={"X-API-Key": settings.CRM_API_KEY or ""},
                   timeout=5, follow_redirects=False).raise_for_status()
    except Exception as exc:  # noqa: BLE001
        log.warning("CRM client notice failed: %s", type(exc).__name__)


def notify() -> None:
    if settings.CRM_API_URL.strip() and settings.CRM_API_KEY:
        threading.Thread(target=_send, name="crm-client-notice", daemon=True).start()
