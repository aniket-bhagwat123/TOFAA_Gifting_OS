"""Tenant-scoped recipient use cases."""

import logging
import re
import time
from datetime import date
from typing import Any

from fastapi import HTTPException
from supabase import Client

from src.core.config import settings
from src.core.concurrency import run_parallel
from src.core.errors import ApiError
from src.core.ttl_cache import MISSING, lookups
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.service import tenant_service
from src.modules.crm_people import mapping
from src.modules.crm_people.client import crm_people
from src.modules.crm_people.sync import people_mirror
from src.modules.recipients import completeness
from src.modules.recipients.schemas import (
    GroupRef,
    NextOccasion,
    RecipientCreate,
    RecipientList,
    RecipientRead,
    RecipientSummary,
    RecipientUpdate,
)


logger = logging.getLogger("tofaa.recipients")

RECIPIENT_RESPONSE_COLUMNS = (
    "id,tenant_id,name,mobile_number,address,date_of_birth,anniversary_date,budget,remark,avatar_url,"
    "relationship,designation,status,is_primary,email,company,city,recipient_type,version"
)
# Large tenants stay small enough to sort and filter in memory when a rule needs computed dates.
MAX_DIRECTORY_ROWS = 5000
# A group up to this size is filtered by the database (real paging); bigger ones would overflow the URL.
MAX_PUSHED_MEMBER_IDS = 150
# The summary changes only when people change, so it is remembered briefly (any write clears it).
# Sort keys the list accepts -> the database column (None = worked out in Python).
SORT_COLUMNS = {"name": "name", "city": "city", "mobile": "mobile_number", "created": "created_at", "nextOccasion": None}
_UNSAFE_SEARCH = re.compile(r"[,()%*\\:]")


def _next_date(value: str | date | None, today: date) -> date | None:
    """The next time a month/day falls on or after today (29 Feb moves to 28 Feb in common years)."""
    if not value:
        return None
    source = value if isinstance(value, date) else date.fromisoformat(str(value)[:10])
    for year in (today.year, today.year + 1):
        try:
            candidate = date(year, source.month, source.day)
        except ValueError:
            candidate = date(year, 2, 28)
        if candidate >= today:
            return candidate
    return None


def next_occasion(row: dict[str, Any], today: date | None = None) -> NextOccasion | None:
    """The soonest of the person's birthday and anniversary, or None when neither is saved."""
    today = today or date.today()
    options = [
        (when, kind, label)
        for key, kind, label in (("date_of_birth", "BIRTHDAY", "Birthday"), ("anniversary_date", "ANNIVERSARY", "Anniversary"))
        if (when := _next_date(row.get(key), today)) is not None
    ]
    if not options:
        return None
    when, kind, label = min(options, key=lambda option: option[0])
    return NextOccasion(kind=kind, label=label, date=when, days_away=(when - today).days)


def _city(row: dict[str, Any]) -> str:
    return str(row.get("city") or (row.get("address") or {}).get("city") or "")


def _read(row: dict[str, Any], today: date | None = None) -> RecipientRead:
    item = RecipientRead.model_validate(row)
    item.next_occasion = next_occasion(row, today)
    return item


_IMPORT_FIELDS = ("gifting_occasion", "birthday_budget", "anniversary_budget")


class RecipientService:
    """Manage recipient records with tenant checks on every lookup."""

    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()
        self._import_fields_ok: bool | None = None
        self._recheck_at = 0.0

    def _has_import_fields(self) -> bool:
        """Whether the database has the import columns yet (the migration may not have been applied). Checked once, or every 30s while missing."""
        if self._import_fields_ok is None or (not self._import_fields_ok and time.monotonic() > self._recheck_at):
            try:
                self.database.table("recipients").select(",".join(_IMPORT_FIELDS)).limit(1).execute()
                self._import_fields_ok = True
            except Exception:  # noqa: BLE001 - a missing column is the expected failure
                self._import_fields_ok = False
                self._recheck_at = time.monotonic() + 30
        return self._import_fields_ok

    def _columns(self) -> str:
        return f"{RECIPIENT_RESPONSE_COLUMNS},{','.join(_IMPORT_FIELDS)}" if self._has_import_fields() else RECIPIENT_RESPONSE_COLUMNS

    def _without_missing_columns(self, values: dict[str, Any]) -> dict[str, Any]:
        """Leave the import fields out until the database has them; refuse a request that actually sets one."""
        if self._has_import_fields():
            return values
        for field in _IMPORT_FIELDS:
            if values.get(field) is not None:
                raise HTTPException(status_code=503, detail="A database update is missing (recipient import fields). Apply the latest migrations, then retry.")
            values.pop(field, None)
        return values

    def list_recipients(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        recipient_ids: list[str] | None = None,
        search: str | None = None,
        relationship: str | None = None,
        city: str | None = None,
        group_id: str | None = None,
        status: str | None = None,
        upcoming_days: int | None = None,
        sort: str = "created",
        descending: bool = True,
    ) -> RecipientList:
        require_permission(actor, Permission.RECIPIENT_READ)
        self._require_tenant_access(tenant_id, actor)
        if recipient_ids is not None and not recipient_ids:
            return RecipientList(
                items=[], pagination=PaginationMeta(page=page, limit=limit, total_records=0), next_cursor=None
            )
        member_ids = self._group_member_ids(tenant_id, group_id) if group_id else None
        if member_ids is not None and not member_ids:
            return RecipientList(
                items=[], pagination=PaginationMeta(page=page, limit=limit, total_records=0), next_cursor=None
            )
        offset = (page - 1) * limit
        # Rules that need the computed next date, or a group's member list, are applied in memory.
        push_members = member_ids is not None and len(member_ids) <= MAX_PUSHED_MEMBER_IDS
        in_memory = upcoming_days is not None or sort == "nextOccasion" or (member_ids is not None and not push_members)
        query = (
            self.database.table("recipients")
            .select(f"{self._columns()},created_at", count="exact")
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
        )
        if recipient_ids is not None:
            # Still inside the tenant filter above, so another tenant's IDs simply match nothing.
            query = query.in_("id", recipient_ids)
        if push_members:
            query = query.in_("id", sorted(member_ids))  # type: ignore[arg-type]
        if status:
            query = query.eq("status", status)
        if relationship:
            query = query.eq("relationship", relationship)
        if city:
            query = query.ilike("city", _UNSAFE_SEARCH.sub(" ", city).strip())
        term = _UNSAFE_SEARCH.sub(" ", search or "").strip()
        if term:
            query = query.or_(f"name.ilike.%{term}%,mobile_number.ilike.%{term}%,email.ilike.%{term}%,city.ilike.%{term}%")

        today = date.today()
        if not in_memory:
            column = SORT_COLUMNS.get(sort) or "created_at"
            result = (
                query.order(column, desc=descending)
                .order("id", desc=descending)
                .range(offset, offset + limit - 1)
                .execute()
            )
            records = result.data or []
            total_records = result.count or 0
            return RecipientList(
                items=self._enrich(tenant_id, [_read(item, today) for item in records]),
                pagination=PaginationMeta(page=page, limit=limit, total_records=total_records),
                next_cursor=next_page_cursor(page, limit, total_records),
            )

        rows = query.order("created_at", desc=True).range(0, MAX_DIRECTORY_ROWS - 1).execute().data or []
        if member_ids is not None:
            rows = [row for row in rows if str(row["id"]) in member_ids]
        items = [_read(row, today) for row in rows]
        if upcoming_days is not None:
            items = [item for item in items if item.next_occasion and item.next_occasion.days_away <= upcoming_days]
        if sort == "nextOccasion":
            # People with no saved date always go last, whichever way the list is sorted.
            dated = [item for item in items if item.next_occasion]
            dated.sort(key=lambda item: item.next_occasion.days_away, reverse=descending)  # type: ignore[union-attr]
            items = dated + [item for item in items if not item.next_occasion]
        elif sort == "name":
            items.sort(key=lambda item: (item.name or "").lower(), reverse=descending)
        elif sort == "city":
            items.sort(key=lambda item: (item.city or (item.address.city if item.address else "") or "").lower(), reverse=descending)
        elif sort == "mobile":
            items.sort(key=lambda item: item.mobile_number, reverse=descending)
        total_records = len(items)
        return RecipientList(
            items=self._enrich(tenant_id, items[offset : offset + limit]),
            pagination=PaginationMeta(page=page, limit=limit, total_records=total_records),
            next_cursor=next_page_cursor(page, limit, total_records),
        )

    def _enrich(self, tenant_id: str, items: list[RecipientRead]) -> list[RecipientRead]:
        """Adds each person's groups and completeness score for one page of people.

        Everything is looked up for the whole page at once (never one query per person), and the
        independent look-ups run side by side, so the page costs about two database round trips
        however many people it holds. A failed look-up leaves that decoration off; the list still loads.
        """
        if not items:
            return items
        ids = [item.id for item in items]

        def guarded(fn):
            def run():
                try:
                    return fn()
                except Exception:  # noqa: BLE001 - decoration only; the list must still load
                    logger.exception("recipient_enrich_failed")
                    return None
            return run

        def group_lookup() -> dict[str, list[GroupRef]]:
            links = (
                self.database.table("spend_recipient_group_members").select("recipient_id,group_id")
                .eq("tenant_id", tenant_id).in_("recipient_id", ids).execute().data or []
            )
            group_ids = sorted({str(link["group_id"]) for link in links if link.get("group_id")})
            names: dict[str, str] = {}
            if group_ids:
                rows = self.database.table("spend_recipient_groups").select("id,name").eq("tenant_id", tenant_id).in_("id", group_ids).execute().data or []
                names = {str(row["id"]): str(row["name"]) for row in rows if row.get("name")}
            by_person: dict[str, list[GroupRef]] = {}
            for link in links:
                group_id = str(link.get("group_id") or "")
                if group_id in names:
                    by_person.setdefault(str(link["recipient_id"]), []).append(GroupRef(id=group_id, name=names[group_id]))
            return by_person

        def counts(table: str, extra=None) -> dict[str, int]:
            query = self.database.table(table).select("recipient_id").eq("tenant_id", tenant_id).in_("recipient_id", ids)
            found: dict[str, int] = {}
            for row in (extra(query) if extra else query).execute().data or []:
                found[str(row["recipient_id"])] = found.get(str(row["recipient_id"]), 0) + 1
            return found

        def skipped_fields() -> dict[str, set[str]]:
            skipped: dict[str, set[str]] = {}
            rows = (self.database.table("recipient_info_status").select("recipient_id,field_key")
                    .eq("tenant_id", tenant_id).eq("status", "NOT_APPLICABLE").in_("recipient_id", ids).execute().data or [])
            for row in rows:
                skipped.setdefault(str(row["recipient_id"]), set()).add(str(row["field_key"]))
            return skipped

        by_person, related, occasions, addresses, preferences, skipped = run_parallel(
            guarded(group_lookup),
            guarded(lambda: counts("recipient_relationships")),
            guarded(lambda: counts("events", extra=lambda q: q.eq("is_active", True))),
            guarded(lambda: counts("recipient_addresses")),
            guarded(lambda: counts("recipient_preferences")),
            guarded(skipped_fields),
        )
        if by_person is not None:
            for item in items:
                item.groups = sorted(by_person.get(item.id, []), key=lambda group: group.name.lower())
        if None in (related, occasions, addresses, preferences, skipped):
            return items  # the score needs every part; without one it is left off
        for item in items:
            extras = completeness.Extras(
                related_people=related.get(item.id, 0), group_count=len(item.groups), occasion_count=occasions.get(item.id, 0),
                has_preferences=item.id in preferences, address_count=addresses.get(item.id, 0),
            )
            item.completeness = completeness.compute(item.model_dump(), extras, frozenset(skipped.get(item.id, set())))
        return items

    def summary(self, tenant_id: str, actor: UserProfileResponse) -> RecipientSummary:
        """Counts for the page header and the choices shown in its filter drop-downs."""
        require_permission(actor, Permission.RECIPIENT_READ)
        self._require_tenant_access(tenant_id, actor)
        cache_key = ("recipient-summary", tenant_id)
        cached = lookups.get(cache_key, settings.AUTH_CACHE_SECONDS)
        if cached is not MISSING:
            return cached
        rows = (
            self.database.table("recipients")
            .select("city,address,relationship,status")
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
            .range(0, MAX_DIRECTORY_ROWS - 1)
            .execute()
            .data
            or []
        )
        archived = sum(1 for row in rows if row.get("status") == "ARCHIVED")
        result = RecipientSummary(
            total=len(rows),
            active=len(rows) - archived,
            archived=archived,
            cities=sorted({_city(row) for row in rows if _city(row)}, key=str.lower),
            relationships=sorted({row["relationship"] for row in rows if row.get("relationship")}),
        )
        lookups.set(cache_key, result)
        return result

    def _group_member_ids(self, tenant_id: str, group_id: str) -> set[str]:
        result = (
            self.database.table("spend_recipient_group_members")
            .select("recipient_id")
            .eq("tenant_id", tenant_id)
            .eq("group_id", group_id)
            .execute()
        )
        return {str(row["recipient_id"]) for row in (result.data or [])}

    def create_recipient(
        self,
        tenant_id: str,
        payload: RecipientCreate,
        actor: UserProfileResponse,
        source: str = "MANUAL",
        import_batch_id: str | None = None,
    ) -> RecipientRead:
        """Saved in the CRM (the master copy: it checks duplicates and keeps the history), then mirrored here."""
        require_permission(actor, Permission.RECIPIENT_CREATE)
        self._require_tenant_access(tenant_id, actor)
        values = payload.model_dump(mode="json", exclude={"allow_duplicate", "address"})
        if payload.address and not values.get("city"):
            values["city"] = payload.address.city  # keep the plain city in step with the address
        body = {**mapping.person_body(values), "companyId": crm_people.company_id(tenant_id, actor), "allowDuplicate": payload.allow_duplicate}
        body.pop("status", None)
        body.pop("version", None)
        if payload.address:
            body["address"] = mapping.address_body(payload.address.model_dump(mode="json"), default=True)
        created = crm_people.call("POST", "/people", tenant_id, actor, json=body)
        recipient_id = str(created["id"])
        people_mirror.sync_ids([recipient_id])
        local = {"created_by_user_id": actor.id, "updated_by_user_id": actor.id}
        if import_batch_id:
            local["import_batch_id"] = import_batch_id  # which import created this person, so the import can be reverted
        self.database.table("recipients").update(local).eq("id", recipient_id).execute()
        return _read(self._mirror_row(tenant_id, recipient_id))

    def find_duplicates(
        self, tenant_id: str, actor: UserProfileResponse, *, name: str | None, mobile_number: str | None, email: str | None
    ) -> list[dict[str, Any]]:
        """People already in this client's recipients who look like the one being added."""
        require_permission(actor, Permission.RECIPIENT_READ)
        self._require_tenant_access(tenant_id, actor)
        return self._find_duplicates(tenant_id, name, mobile_number, email)

    def _find_duplicates(self, tenant_id: str, name: str | None, mobile_number: str | None, email: str | None) -> list[dict[str, Any]]:
        """Same mobile or email (exact), or a very similar name. Each match says why."""
        columns = "id,name,mobile_number,email,address,status"
        found: dict[str, dict[str, Any]] = {}

        def add(rows: list[dict[str, Any]], reason: str) -> None:
            for row in rows:
                entry = found.setdefault(str(row["id"]), {
                    "id": str(row["id"]), "name": row.get("name"), "mobileNumber": row.get("mobile_number"),
                    "email": row.get("email"), "city": (row.get("address") or {}).get("city"), "status": row.get("status") or "ACTIVE", "reasons": [],
                })
                if reason not in entry["reasons"]:
                    entry["reasons"].append(reason)

        def base():
            return self.database.table("recipients").select(columns).eq("tenant_id", tenant_id).is_("deleted_at", "null")

        if mobile_number:
            add(base().eq("mobile_number", mobile_number).limit(5).execute().data or [], "SAME_MOBILE")
        if email:
            add(base().ilike("email", _UNSAFE_SEARCH.sub(" ", email).strip()).limit(5).execute().data or [], "SAME_EMAIL")
        term = _UNSAFE_SEARCH.sub(" ", name or "").strip()
        if len(term) >= 3:
            add(base().ilike("name", term).limit(5).execute().data or [], "SAME_NAME")
        return list(found.values())

    def get_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        actor: UserProfileResponse,
    ) -> RecipientRead:
        record = self._get_scoped_recipient(tenant_id, recipient_id, actor)
        return self._enrich(tenant_id, [_read(record)])[0]

    def update_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        payload: RecipientUpdate,
        actor: UserProfileResponse,
        source: str = "MANUAL",
    ) -> RecipientRead:
        """Saved in the CRM (which refuses an edit of an out-of-date copy), then mirrored here."""
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        current = self._get_scoped_recipient(tenant_id, recipient_id, actor)
        current_version = int(current.get("version") or 1)
        if payload.version is not None and payload.version != current_version:
            raise self._conflict(current)
        values = payload.model_dump(mode="json", exclude_unset=True, exclude={"version", "address"})
        if payload.address and "city" not in values:
            values["city"] = payload.address.city
        try:
            if payload.address:
                self._save_default_address(tenant_id, recipient_id, actor, payload.address.model_dump(mode="json"))
            body = mapping.person_body(values)
            if body:
                crm_people.call("PATCH", f"/people/{recipient_id}", tenant_id, actor,
                                json={**body, "version": payload.version or current_version})
        except ApiError as exc:
            if exc.status_code == 409 and (exc.data or {}).get("reason") == "VERSION_CONFLICT":
                people_mirror.sync_ids([recipient_id])
                raise self._conflict(self._mirror_row(tenant_id, recipient_id)) from exc
            raise
        people_mirror.sync_ids([recipient_id])
        self.database.table("recipients").update({"updated_by_user_id": actor.id}).eq("id", recipient_id).execute()
        return _read(self._mirror_row(tenant_id, recipient_id))

    def _save_default_address(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse, address: dict[str, Any]) -> None:
        """The person's one address on this form is the CRM's default delivery address: change it, or add it."""
        rows = (self.database.table("recipient_addresses").select("id").eq("tenant_id", tenant_id).eq("recipient_id", recipient_id)
                .eq("is_default", True).limit(1).execute().data or [])
        body = mapping.address_body(address)
        if rows:
            crm_people.call("PATCH", f"/people/{recipient_id}/addresses/{rows[0]['id']}", tenant_id, actor, json=body)
        else:
            crm_people.call("POST", f"/people/{recipient_id}/addresses", tenant_id, actor, json={**body, "isDefault": True})

    def _mirror_row(self, tenant_id: str, recipient_id: str, *, include_deleted: bool = False) -> dict[str, Any]:
        query = self.database.table("recipients").select(self._columns()).eq("tenant_id", tenant_id).eq("id", recipient_id)
        rows = (query if include_deleted else query.is_("deleted_at", "null")).limit(1).execute().data or []
        if not rows:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        return rows[0]

    def _conflict(self, latest: dict[str, Any]) -> ApiError:
        return ApiError(
            409,
            "Someone else changed this recipient while you were editing. Review their changes, then save again.",
            {"current": _read(latest).model_dump(by_alias=True, mode="json"), "reason": "VERSION_CONFLICT"},
        )

    def soft_delete(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.RECIPIENT_DELETE)
        self._get_scoped_recipient(tenant_id, recipient_id, actor)
        crm_people.call("DELETE", f"/people/{recipient_id}", tenant_id, actor)
        people_mirror.sync_ids([recipient_id])

    def bulk_soft_delete(self, tenant_id: str, ids: list[str], actor: UserProfileResponse) -> int:
        """Delete many people in one CRM call. Only live people of this client count (the CRM checks the client)."""
        require_permission(actor, Permission.RECIPIENT_DELETE)
        self._require_tenant_access(tenant_id, actor)
        affected = 0
        for start in range(0, len(ids), 1000):
            part = [str(i) for i in ids[start:start + 1000]]
            affected += int((crm_people.call("POST", "/people/bulk-delete", tenant_id, actor, json={"recipientIds": part}) or {}).get("affected", 0))
            people_mirror.sync_ids(part)
        return affected

    def bulk_set_status(self, tenant_id: str, ids: list[str], status: str, actor: UserProfileResponse) -> int:
        """Archive or restore many people in one CRM call."""
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        self._require_tenant_access(tenant_id, actor)
        affected = 0
        for start in range(0, len(ids), 1000):
            part = [str(i) for i in ids[start:start + 1000]]
            affected += int((crm_people.call("POST", "/people/bulk-status", tenant_id, actor, json={"recipientIds": part, "status": status}) or {}).get("affected", 0))
            people_mirror.sync_ids(part)
        return affected

    def restore(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_RESTORE)
        self._require_tenant_access(tenant_id, actor)
        self._mirror_row(tenant_id, recipient_id, include_deleted=True)  # another client's id answers "not found" here
        crm_people.call("POST", f"/people/{recipient_id}/restore", tenant_id, actor)
        people_mirror.sync_ids([recipient_id])
        return _read(self._mirror_row(tenant_id, recipient_id))

    def _get_scoped_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        actor: UserProfileResponse,
    ) -> dict[str, Any]:
        self._require_tenant_access(tenant_id, actor)
        result = (
            self.database.table("recipients")
            .select(self._columns())
            .eq("tenant_id", tenant_id)
            .eq("id", recipient_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        return result.data[0]

    def set_avatar(
        self, tenant_id: str, recipient_id: str, actor: UserProfileResponse, *, content: bytes, content_type: str
    ) -> RecipientRead:
        """Save a photo for this person in the CRM (replacing the old one); the mirror shows a copy of it."""
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        self._get_scoped_recipient(tenant_id, recipient_id, actor)
        crm_people.call("PUT", f"/people/{recipient_id}/photo", tenant_id, actor,
                        files={"file": ("photo", content, content_type or "application/octet-stream")})
        people_mirror.sync_ids([recipient_id])
        return _read(self._mirror_row(tenant_id, recipient_id))

    def clear_avatar(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        self._get_scoped_recipient(tenant_id, recipient_id, actor)
        crm_people.call("DELETE", f"/people/{recipient_id}/photo", tenant_id, actor)
        people_mirror.sync_ids([recipient_id])
        return _read(self._mirror_row(tenant_id, recipient_id))

    def _require_tenant_access(self, tenant_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.RECIPIENT_READ)
        try:
            tenant_service.require_access(tenant_id, actor)
        except HTTPException as exc:
            raise HTTPException(status_code=404, detail="Recipient not found.") from exc


recipient_service = RecipientService()
