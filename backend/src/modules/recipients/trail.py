"""Field-level history of a recipient: who changed what, from which source, and when.

Rows are only ever added (the table refuses updates and deletes). A correction is a new row.
"""

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.schema import to_camel

logger = logging.getLogger("tofaa.recipient_trail")

Source = Literal["MANUAL", "EXCEL_IMPORT", "CALL", "WHATSAPP", "MEETING", "EMAIL", "OTHER"]
SOURCES = frozenset({"MANUAL", "EXCEL_IMPORT", "CALL", "WHATSAPP", "MEETING", "EMAIL", "OTHER"})
SOURCE_HEADER = "X-Change-Source"

# Columns whose changes are written to the trail (never the avatar link, version counter or timestamps).
TRACKED = (
    "name", "mobile_number", "email", "company", "city", "designation", "recipient_type", "relationship", "date_of_birth",
    "anniversary_date", "address", "budget", "remark", "status", "is_primary", "gifting_occasion", "birthday_budget", "anniversary_budget",
)


def source_of(value: str | None) -> str:
    cleaned = (value or "").strip().upper()
    return cleaned if cleaned in SOURCES else "MANUAL"


def _plain(value: Any) -> Any:
    """A value as it should be stored in JSON."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def diff(old: dict[str, Any], new: dict[str, Any]) -> list[tuple[str, Any, Any]]:
    """(field, old, new) for each tracked column whose value really changed."""
    changes = []
    for field in TRACKED:
        if field not in new:
            continue
        before, after = _plain(old.get(field)), _plain(new.get(field))
        if before in ("", None) and after in ("", None):
            continue
        if before != after:
            changes.append((field, before, after))
    return changes


def record(
    database: Any, tenant_id: str, recipient_id: str, actor: Any, action: str,
    changes: list[tuple[str | None, Any, Any]] | None = None, source: str = "MANUAL",
) -> None:
    """Write one row per changed field (or one row for the action itself). Never raises: the change already happened."""
    name = (getattr(actor, "full_name", None) or "").strip() or str(getattr(actor, "email", "")).split("@")[0] or "Unknown"
    base = {
        "tenant_id": tenant_id, "recipient_id": recipient_id, "actor_user_id": str(actor.id), "actor_name": name,
        "actor_role": str(getattr(actor.role, "value", actor.role)), "action": action, "source": source_of(source),
    }
    rows = [{**base, "field": field, "old_value": _plain(old), "new_value": _plain(new)} for field, old, new in (changes or [(None, None, None)])]
    try:
        database.table("recipient_audit").insert(rows).execute()
    except Exception:  # noqa: BLE001 - history must never turn a saved change into an error
        logger.exception("recipient_trail_write_failed recipient=%s action=%s", recipient_id, action)


def record_many(database: Any, tenant_id: str, recipient_ids: list[str], actor: Any, action: str, source: str = "MANUAL") -> None:
    """One history row per person for a bulk action, written in as few inserts as possible. Never raises."""
    name = (getattr(actor, "full_name", None) or "").strip() or str(getattr(actor, "email", "")).split("@")[0] or "Unknown"
    base = {
        "tenant_id": tenant_id, "actor_user_id": str(actor.id), "actor_name": name,
        "actor_role": str(getattr(actor.role, "value", actor.role)), "action": action, "source": source_of(source),
        "field": None, "old_value": None, "new_value": None,
    }
    try:
        for start in range(0, len(recipient_ids), 500):
            database.table("recipient_audit").insert([{**base, "recipient_id": rid} for rid in recipient_ids[start:start + 500]]).execute()
    except Exception:  # noqa: BLE001
        logger.exception("recipient_trail_bulk_write_failed action=%s", action)


class TrailEntry(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    created_at: str
    actor_name: str
    actor_role: str
    action: str
    field: str | None = None
    old_value: Any = None
    new_value: Any = None
    source: str


class TrailList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[TrailEntry]
    pagination: PaginationMeta
    next_cursor: str | None = None


# Changes that exist only in Gifting OS (follow-up status of missing details, shared occasions) stay in the local
# history. Everything else about a person is kept by the CRM, the master copy (older local rows were copied there).
LOCAL_ONLY = "field.like.status:*,field.eq.shared_occasion"
CRM_PAGE = 100


def list_trail(database: Any, tenant_id: str, recipient_id: str, actor: Any, *, page: int, limit: int) -> TrailList:
    """The person's history, newest first: the CRM's entries merged with the local-only ones."""
    from src.modules.crm_people.client import crm_people  # here, so the recipients module imports stay one-way

    wanted = page * limit
    local = (
        database.table("recipient_audit")
        .select("id,created_at,actor_name,actor_role,action,field,old_value,new_value,source", count="exact")
        .eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).or_(LOCAL_ONLY)
        .order("created_at", desc=True).order("id", desc=True).range(0, wanted - 1).execute()
    )
    entries = [TrailEntry(
        id=f"local-{row['id']}", created_at=str(row["created_at"]), actor_name=row.get("actor_name") or "Unknown",
        actor_role=row["actor_role"], action=row["action"], field=row.get("field"),
        old_value=row.get("old_value"), new_value=row.get("new_value"), source=row["source"],
    ) for row in local.data or []]
    crm_total, crm_page = 0, 1
    while True:
        data = crm_people.call("GET", f"/people/{recipient_id}/history", tenant_id, actor, params={"page": crm_page, "limit": CRM_PAGE}) or {}
        crm_total = int(data.get("total") or 0)
        entries += [TrailEntry(
            id=f"crm-{row['id']}", created_at=str(row["createdAt"]), actor_name=row.get("actorName") or "TOFAA team",
            actor_role=row.get("actorRole") or "TOFAA", action=row["action"], field=row.get("field"),
            old_value=row.get("oldValue"), new_value=row.get("newValue"),
            source="EXCEL_IMPORT" if row.get("source") == "IMPORT" else row.get("source") or "MANUAL",
        ) for row in data.get("items") or []]
        if crm_page * CRM_PAGE >= min(crm_total, wanted):
            break
        crm_page += 1
    entries.sort(key=lambda entry: entry.created_at, reverse=True)
    total = crm_total + (local.count or 0)
    return TrailList(
        items=entries[(page - 1) * limit:wanted],
        pagination=PaginationMeta(page=page, limit=limit, total_records=total),
        next_cursor=next_page_cursor(page, limit, total),
    )
