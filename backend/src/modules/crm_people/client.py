"""Calls to the TOFAA CRM People API. The CRM is the master copy of People; Gifting OS saves every change there.

Base: {CRM_API_URL}/api/v1/integrations/gifting, with the shared key (X-API-Key, never sent to a browser), the client
organisation (X-Tenant-Id) and who is acting (X-Actor-*), so the CRM history names the real person.
A client organisation that is not yet linked to a CRM client account is linked on first use (by name, else created).
CRM refusals come back as the same status and message (duplicates, version conflicts, bad values), so the screens
behave as before.
"""

import logging
import threading
from typing import Any

import httpx

from src.core.config import settings
from src.core.errors import ApiError
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Role

log = logging.getLogger(__name__)

PREFIX = "/api/v1/integrations/gifting"
PASS_THROUGH = {400, 404, 409, 413, 422}
NOT_CONNECTED = "People are managed in TOFAA CRM, and the CRM connection is not set up (CRM_API_URL / CRM_API_KEY)."
UNREACHABLE = "TOFAA CRM could not be reached, so the change was not saved. Try again in a moment."


def actor_headers(actor: Any) -> dict[str, str]:
    role = getattr(actor, "role", None)
    name = getattr(actor, "full_name", None) or getattr(actor, "email", None) or "Gifting OS"
    return {
        "X-Actor-Name": str(name)[:120],
        "X-Actor-Role": str(getattr(role, "value", role) or "")[:40],
        "X-Actor-Kind": "CLIENT" if role == Role.CLIENT else "TOFAA",
    }


class CrmPeopleClient:
    def __init__(self) -> None:
        self._companies: dict[str, str] = {}  # tenant id -> CRM client account id
        self._lock = threading.Lock()

    @staticmethod
    def configured() -> bool:
        return bool(settings.CRM_API_URL.strip()) and len(settings.CRM_API_KEY or "") >= 32

    def _send(self, method: str, path: str, *, tenant_id: str | None = None, actor: Any = None, **kwargs: Any) -> httpx.Response:
        if not self.configured():
            raise ApiError(503, NOT_CONNECTED)
        headers = {"X-API-Key": settings.CRM_API_KEY or "", "Accept": "application/json"}
        if tenant_id:
            headers["X-Tenant-Id"] = tenant_id
        if actor is not None:
            headers.update(actor_headers(actor))
        try:
            return httpx.request(
                method, settings.CRM_API_URL.strip().rstrip("/") + PREFIX + path, headers=headers,
                timeout=settings.CRM_PEOPLE_TIMEOUT_SECONDS, follow_redirects=False, **kwargs,
            )
        except httpx.HTTPError as exc:
            log.warning("CRM people call failed: %s %s (%s)", method, path, type(exc).__name__)
            raise ApiError(503, UNREACHABLE) from exc

    @staticmethod
    def _body(response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
            return body if isinstance(body, dict) else {}
        except ValueError:
            return {}

    def call(self, method: str, path: str, tenant_id: str, actor: Any, *, linked_retry: bool = True, **kwargs: Any) -> Any:
        """Run one People call for this client organisation as this person; returns the CRM `data`."""
        response = self._send(method, path, tenant_id=tenant_id, actor=actor, **kwargs)
        body = self._body(response)
        if response.status_code == 404 and (body.get("data") or {}).get("code") == "TENANT_NOT_LINKED" and linked_retry:
            self.link(tenant_id)
            return self.call(method, path, tenant_id, actor, linked_retry=False, **kwargs)
        if response.status_code >= 400:
            raise self._error(response.status_code, body)
        return body.get("data")

    def system_get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        """A call that is not for one client (the mirror sync)."""
        response = self._send("GET", path, params=params)
        body = self._body(response)
        if response.status_code >= 400:
            raise self._error(response.status_code, body)
        return body.get("data")

    @staticmethod
    def _error(status: int, body: dict[str, Any]) -> ApiError:
        message = str(body.get("message") or "TOFAA CRM refused the change.")
        data = body.get("data") if isinstance(body.get("data"), dict) else None
        if status in PASS_THROUGH:
            return ApiError(status, message, data)
        if status == 401:
            log.error("TOFAA CRM refused our API key: check CRM_API_KEY here and GIFTING_OS_API_KEY in the CRM.")
            return ApiError(502, "TOFAA CRM refused this server's key. Ask an administrator to check the CRM connection.")
        return ApiError(502, "TOFAA CRM could not complete the change. Try again in a moment.")

    def company_id(self, tenant_id: str, actor: Any) -> str:
        """The CRM client account of this client organisation (linked on first use)."""
        found = self._companies.get(tenant_id)
        if found:
            return found
        data = self.call("GET", "/tenant", tenant_id, actor)
        self._companies[tenant_id] = str(data["companyId"])
        return self._companies[tenant_id]

    def link(self, tenant_id: str) -> str:
        with self._lock:
            rows = get_supabase_admin_client().table("tenants").select("name").eq("id", tenant_id).limit(1).execute().data or []
            if not rows:
                raise ApiError(404, "Client not found.")
            response = self._send("PUT", "/tenant", tenant_id=tenant_id, json={"name": rows[0]["name"]})
            body = self._body(response)
            if response.status_code >= 400:
                raise self._error(response.status_code, body)
            self._companies[tenant_id] = str(body["data"]["companyId"])
            log.info("linked tenant %s to CRM client account %s", tenant_id, self._companies[tenant_id])
            return self._companies[tenant_id]


crm_people = CrmPeopleClient()
