"""Tenant-scoped recipient use cases."""

import logging
import re
from datetime import date, datetime, timezone
from typing import Any

from fastapi import HTTPException
from supabase import Client

from src.core import images
from src.core.errors import ApiError
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.service import tenant_service
from src.modules.recipients import completeness, trail
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


class RecipientService:
    """Manage recipient records with tenant checks on every lookup."""

    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

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
        in_memory = upcoming_days is not None or sort == "nextOccasion" or member_ids is not None
        query = (
            self.database.table("recipients")
            .select(f"{RECIPIENT_RESPONSE_COLUMNS},created_at", count="exact")
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
        )
        if recipient_ids is not None:
            # Still inside the tenant filter above, so another tenant's IDs simply match nothing.
            query = query.in_("id", recipient_ids)
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
                items=self._with_completeness(tenant_id, self._with_groups(tenant_id, [_read(item, today) for item in records])),
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
            items=self._with_completeness(tenant_id, self._with_groups(tenant_id, items[offset : offset + limit])),
            pagination=PaginationMeta(page=page, limit=limit, total_records=total_records),
            next_cursor=next_page_cursor(page, limit, total_records),
        )

    def _with_groups(self, tenant_id: str, items: list[RecipientRead]) -> list[RecipientRead]:
        """The groups each person on this page belongs to. A failed look-up leaves the list without them."""
        if not items:
            return items
        try:
            ids = [item.id for item in items]
            links = (
                self.database.table("spend_recipient_group_members")
                .select("recipient_id,group_id")
                .eq("tenant_id", tenant_id)
                .in_("recipient_id", ids)
                .execute()
                .data
                or []
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
            for item in items:
                item.groups = sorted(by_person.get(item.id, []), key=lambda group: group.name.lower())
        except Exception:  # noqa: BLE001 - groups are decoration; the list must still load
            logger.exception("recipient_group_lookup_failed")
        return items

    def summary(self, tenant_id: str, actor: UserProfileResponse) -> RecipientSummary:
        """Counts for the page header and the choices shown in its filter drop-downs."""
        require_permission(actor, Permission.RECIPIENT_READ)
        self._require_tenant_access(tenant_id, actor)
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
        return RecipientSummary(
            total=len(rows),
            active=len(rows) - archived,
            archived=archived,
            cities=sorted({_city(row) for row in rows if _city(row)}, key=str.lower),
            relationships=sorted({row["relationship"] for row in rows if row.get("relationship")}),
        )

    def _with_completeness(self, tenant_id: str, items: list[RecipientRead]) -> list[RecipientRead]:
        """Completeness for each person: their own fields plus what they have in the related tables."""
        if not items:
            return items
        try:
            ids = [item.id for item in items]

            def counts(table: str, column: str = "recipient_id", extra=None) -> dict[str, int]:
                query = self.database.table(table).select(column).eq("tenant_id", tenant_id).in_(column, ids)
                rows = (extra(query) if extra else query).execute().data or []
                found: dict[str, int] = {}
                for row in rows:
                    found[str(row[column])] = found.get(str(row[column]), 0) + 1
                return found

            related = counts("recipient_relationships")
            occasions = counts("events", extra=lambda q: q.eq("is_active", True))
            addresses = counts("recipient_addresses")
            preferences = set(counts("recipient_preferences"))
            skipped: dict[str, set[str]] = {}
            for row in (self.database.table("recipient_info_status").select("recipient_id,field_key")
                        .eq("tenant_id", tenant_id).eq("status", "NOT_APPLICABLE").in_("recipient_id", ids).execute().data or []):
                skipped.setdefault(str(row["recipient_id"]), set()).add(str(row["field_key"]))
            for item in items:
                extras = completeness.Extras(
                    related_people=related.get(item.id, 0), group_count=len(item.groups), occasion_count=occasions.get(item.id, 0),
                    has_preferences=item.id in preferences, address_count=addresses.get(item.id, 0),
                )
                item.completeness = completeness.compute(item.model_dump(), extras, frozenset(skipped.get(item.id, set())))
        except Exception:  # noqa: BLE001 - the score is extra; the list must still load
            logger.exception("recipient_completeness_failed")
        return items

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
    ) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_CREATE)
        self._require_tenant_access(tenant_id, actor)
        if not payload.allow_duplicate:
            matches = self._find_duplicates(tenant_id, payload.name, payload.mobile_number, payload.email)
            if matches:
                raise ApiError(409, "This person may already be in your recipients.", {"duplicates": matches})
        values = payload.model_dump(mode="json", exclude={"allow_duplicate"})
        if values.get("address") and not values.get("city"):
            values["city"] = values["address"]["city"]  # keep the plain city in step with the address
        values.update(
            {
                "tenant_id": tenant_id,
                "source": "CLIENT" if actor.role == Role.CLIENT else "TOFAA",
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
            }
        )
        try:
            result = (
                self.database.table("recipients")
                .insert(values)
                .select(RECIPIENT_RESPONSE_COLUMNS)
                .execute()
            )
        except Exception as exc:  # noqa: BLE001 - the unique mobile number index is the usual cause
            if "recipients_tenant_mobile_number_active_uq" in str(exc) or "duplicate key" in str(exc).lower():
                raise ApiError(409, "A recipient with this mobile number already exists.") from exc
            raise
        if not result.data:
            raise HTTPException(status_code=409, detail="Recipient could not be created.")
        created = result.data[0]
        trail.record(
            self.database, tenant_id, str(created["id"]), actor, "IMPORT" if source == "EXCEL_IMPORT" else "CREATE",
            [(field, None, created.get(field)) for field in trail.TRACKED if created.get(field) not in (None, "")
             and not (field == "status" or (field in ("is_primary",) and created.get(field) is False) or (field == "recipient_type" and created.get(field) == "INDIVIDUAL"))],
            source,
        )
        return _read(created)

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
        return self._with_completeness(tenant_id, self._with_groups(tenant_id, [_read(record)]))[0]

    def update_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        payload: RecipientUpdate,
        actor: UserProfileResponse,
        source: str = "MANUAL",
    ) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        current = self._get_scoped_recipient(tenant_id, recipient_id, actor)
        current_version = int(current.get("version") or 1)
        if payload.version is not None and payload.version != current_version:
            raise self._conflict(current)
        values = payload.model_dump(mode="json", exclude_unset=True, exclude={"version"})
        if values.get("address") and "city" not in values:
            values["city"] = values["address"]["city"]
        values["updated_by_user_id"] = actor.id
        values["version"] = current_version + 1
        query = (
            self.database.table("recipients")
            .update(values)
            .eq("id", recipient_id)
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
        )
        if payload.version is not None:
            # Atomic guard: matches nothing if someone saved between the read above and this write.
            query = query.eq("version", payload.version)
        result = query.select(RECIPIENT_RESPONSE_COLUMNS).execute()
        if not result.data:
            if payload.version is not None:
                latest = self._get_scoped_recipient(tenant_id, recipient_id, actor)
                raise self._conflict(latest)
            raise HTTPException(status_code=404, detail="Recipient not found.")
        changes = trail.diff(current, values)
        if changes:
            status_change = next((new for field, _, new in changes if field == "status"), None)
            action = "ARCHIVE" if status_change == "ARCHIVED" else "RESTORE" if status_change == "ACTIVE" else "EDIT"
            trail.record(self.database, tenant_id, recipient_id, actor, action, changes, source)
        return _read(result.data[0])

    def _conflict(self, latest: dict[str, Any]) -> ApiError:
        return ApiError(
            409,
            "Someone else changed this recipient while you were editing. Review their changes, then save again.",
            {"current": _read(latest).model_dump(by_alias=True, mode="json"), "reason": "VERSION_CONFLICT"},
        )

    def soft_delete(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.RECIPIENT_DELETE)
        self._get_scoped_recipient(tenant_id, recipient_id, actor)
        result = (
            self.database.table("recipients")
            .update({
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "updated_by_user_id": actor.id,
            })
            .eq("id", recipient_id)
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
            .select("id")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        trail.record(self.database, tenant_id, recipient_id, actor, "DELETE")

    def restore(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_RESTORE)
        self._require_tenant_access(tenant_id, actor)
        result = (
            self.database.table("recipients")
            .update({"deleted_at": None, "updated_by_user_id": actor.id})
            .eq("id", recipient_id)
            .eq("tenant_id", tenant_id)
            .not_.is_("deleted_at", "null")
            .select(RECIPIENT_RESPONSE_COLUMNS)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        trail.record(self.database, tenant_id, recipient_id, actor, "RESTORE")
        return _read(result.data[0])

    def _get_scoped_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        actor: UserProfileResponse,
    ) -> dict[str, Any]:
        self._require_tenant_access(tenant_id, actor)
        result = (
            self.database.table("recipients")
            .select(RECIPIENT_RESPONSE_COLUMNS)
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
        """Save a photo for this person (replacing the old one)."""
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        old = self._get_scoped_recipient(tenant_id, recipient_id, actor).get("avatar_url")
        url = images.store_image(self.database, f"recipients/{tenant_id}/{recipient_id}", content, content_type)
        return self._write_avatar(tenant_id, recipient_id, actor, url, old)

    def clear_avatar(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        old = self._get_scoped_recipient(tenant_id, recipient_id, actor).get("avatar_url")
        return self._write_avatar(tenant_id, recipient_id, actor, None, old)

    def _write_avatar(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse, url: str | None, old: str | None) -> RecipientRead:
        result = (
            self.database.table("recipients")
            .update({"avatar_url": url, "updated_by_user_id": actor.id})
            .eq("id", recipient_id).eq("tenant_id", tenant_id).is_("deleted_at", "null")
            .select(RECIPIENT_RESPONSE_COLUMNS)
            .execute()
        )
        if not result.data:
            images.remove_image(self.database, url)
            raise HTTPException(status_code=404, detail="Recipient not found.")
        images.remove_image(self.database, old)
        return _read(result.data[0])

    def _require_tenant_access(self, tenant_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.RECIPIENT_READ)
        try:
            tenant_service.require_access(tenant_id, actor)
        except HTTPException as exc:
            raise HTTPException(status_code=404, detail="Recipient not found.") from exc


recipient_service = RecipientService()
