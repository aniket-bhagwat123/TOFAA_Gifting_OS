"""Append-only record of every successful change made inside a tenant.

Services mark which tenant a request touched (``note``) and one middleware writes the row after the
request succeeds, so a new route is covered without extra code. Everyone in a tenant sees that tenant's
activity: people from their own organisation by name, and TOFAA staff only as "TOFAA".
"""

import logging
from contextvars import ContextVar
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from src.core import activity
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


def write(
    method: str, route_path: str, status_code: int, context: dict[str, Any], entity_id: str | None = None, details: dict[str, Any] | None = None
) -> None:
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
    extras = {k: v for k, v in (("entity_id", entity_id), ("details", details or None)) if v}
    try:
        try:
            if extras:
                get_supabase_admin_client().table("audit_log").insert([{**row, **extras} for row in rows]).execute()
                return
        except Exception:
            # The extra columns come from a later migration; keep recording without them until it is applied.
            logger.warning("audit_extra_columns_unavailable route=%s", route_path)
        get_supabase_admin_client().table("audit_log").insert(rows).execute()
    except Exception:
        # The change already committed; losing the audit row must be loud, not a failed request.
        logger.exception("audit_write_failed method=%s route=%s tenants=%s", method, route_path, sorted(tenant_ids))


def entity_id_of(path_params: dict[str, Any]) -> str | None:
    """The id of the item a request touched (the last id in its path, other than the tenant's)."""
    for key in reversed(list(path_params)):
        if key == "tenant_id":
            continue
        try:
            return str(UUID(str(path_params[key])))
        except ValueError:
            continue
    return None


def path_details(path_params: dict[str, Any]) -> dict[str, str]:
    """The kinds of ids in the path (recipientId, occasionId, ...), so names can be found when the feed is read."""
    found: dict[str, str] = {}
    for key, name in activity.PATH_IDS.items():
        try:
            if key in path_params:
                found[name] = str(UUID(str(path_params[key])))
        except ValueError:
            continue
    return found


class ActivityRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    summary: str
    title: str
    description: str
    category: str
    actor_name: str
    actor_kind: str  # "TOFAA" (a TOFAA staff member, never named to clients) or "USER"
    changed_at: str


class ActivityList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[ActivityRead]
    pagination: PaginationMeta
    next_cursor: str | None = None


_COLUMNS = "id,resource,route,method,actor_user_id,actor_role,on_behalf,created_at"


def list_activity(tenant_id: str, viewer_is_staff: bool, *, page: int, limit: int) -> ActivityList:
    """Every change made in this tenant, newest first, in plain language."""
    database = get_supabase_admin_client()

    def fetch(columns: str):
        return (
            database.table("audit_log")
            .select(columns, count="exact")
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range((page - 1) * limit, page * limit - 1)
            .execute()
        )

    result = None
    for columns in (f"{_COLUMNS},entity_id,details", _COLUMNS):  # the first needs the activity migrations
        try:
            result = fetch(columns)
            break
        except Exception:
            if columns == _COLUMNS:
                raise
    rows = [row for row in result.data or [] if not activity.is_hidden(row.get("route", ""))]
    total = result.count or 0
    facts = activity.resolve_facts(database, rows)
    people =activity.actor_names(database, {str(r["actor_user_id"]) for r in rows if viewer_is_staff or not r.get("on_behalf")})
    items = []
    for row in rows:
        route = row.get("route") or f"/{row['resource']}"
        category, title, text = activity.describe(row.get("method", ""), route, facts.get(row["id"]))
        staff_made = bool(row.get("on_behalf"))
        hide_name = staff_made and not viewer_is_staff
        items.append(ActivityRead(
            id=str(row["id"]), summary=title, title=title, description=text, category=category,
            actor_name="TOFAA" if hide_name else people.get(str(row["actor_user_id"]), "TOFAA" if staff_made else "A team member"),
            actor_kind="TOFAA" if hide_name else "USER",
            changed_at=row["created_at"],
        ))
    return ActivityList(
        items=items,
        pagination=PaginationMeta(page=page, limit=limit, total_records=total),
        next_cursor=next_page_cursor(page, limit, total),
    )
