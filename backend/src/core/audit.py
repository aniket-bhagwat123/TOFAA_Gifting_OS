"""Append-only record of every successful change made inside a tenant.

Services mark which tenant a request touched (``note``) and one middleware writes the row after the
request succeeds, so a new route is covered without extra code. Clients see only the changes made
for them by TOFAA staff, and never which staff member made them.
"""

import logging
from contextvars import ContextVar
from typing import Any

from pydantic import BaseModel, ConfigDict

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.schema import to_camel
from src.core.supabase import get_supabase_admin_client

logger = logging.getLogger("tofaa.audit")

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_SKIPPED_SEGMENTS = frozenset({"api", "v1", "tenants", "admin"})

# A mutable dict, not a value: sync route handlers run in a copied context, so only a shared
# object lets their ``note`` calls reach the middleware that wrote the context.
_current: ContextVar[dict[str, Any] | None] = ContextVar("audit_context", default=None)


def begin() -> dict[str, Any]:
    context: dict[str, Any] = {}
    _current.set(context)
    return context


def note(actor: Any, tenant_id: str) -> None:
    """Remember who is acting on which tenant for the request in progress."""
    context = _current.get()
    if context is not None:
        context["actor_id"] = str(actor.id)
        context["actor_role"] = str(actor.role)
        context.setdefault("tenant_ids", set()).add(str(tenant_id))


def resource_of(route_path: str) -> str:
    """The first meaningful path segment, e.g. ``/api/v1/tenants/{tenant_id}/recipients/{id}`` -> recipients."""
    parts = [p for p in route_path.strip("/").split("/") if p and not p.startswith("{") and p not in _SKIPPED_SEGMENTS]
    return parts[0] if parts else "tenant"


def write(method: str, route_path: str, status_code: int, context: dict[str, Any]) -> None:
    tenant_ids, actor_id = context.get("tenant_ids"), context.get("actor_id")
    if not tenant_ids or not actor_id:
        return
    role = context["actor_role"]
    rows = [
        {
            "tenant_id": tenant_id,
            "actor_user_id": actor_id,
            "actor_role": role,
            "on_behalf": role != "CLIENT",
            "method": method,
            "route": route_path,
            "resource": resource_of(route_path),
            "status_code": status_code,
        }
        for tenant_id in sorted(tenant_ids)
    ]
    try:
        get_supabase_admin_client().table("audit_log").insert(rows).execute()
    except Exception:
        # The change already committed; losing the audit row must be loud, not a failed request.
        logger.exception("audit_write_failed method=%s route=%s tenants=%s", method, route_path, sorted(tenant_ids))


class ActivityRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    summary: str
    changed_at: str


class ActivityList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[ActivityRead]
    pagination: PaginationMeta
    next_cursor: str | None = None


def list_staff_changes(tenant_id: str, *, page: int, limit: int) -> ActivityList:
    """Changes TOFAA staff made for this tenant. Staff identities are deliberately not returned."""
    result = (
        get_supabase_admin_client()
        .table("audit_log")
        .select("id,resource,created_at", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("on_behalf", True)
        .order("created_at", desc=True)
        .order("id", desc=True)
        .range((page - 1) * limit, page * limit - 1)
        .execute()
    )
    total = result.count or 0
    return ActivityList(
        items=[
            ActivityRead(
                id=str(row["id"]),
                summary=f"TOFAA made a change in {row['resource'].replace('-', ' ')}",
                changed_at=row["created_at"],
            )
            for row in result.data or []
        ],
        pagination=PaginationMeta(page=page, limit=limit, total_records=total),
        next_cursor=next_page_cursor(page, limit, total),
    )
