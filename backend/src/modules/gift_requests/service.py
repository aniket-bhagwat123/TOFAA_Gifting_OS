"""Tenant-scoped gift request use cases and workflow authorization."""

import logging
import re
from datetime import date, timedelta
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from src.core import images
from src.core.concurrency import run_parallel
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.gift_requests.schemas import (
    GiftRequestCreate,
    GiftRequestEventPage,
    GiftRequestEventRead,
    GiftRequestPage,
    GiftRequestRead,
    GiftRequestStatus,
    GiftRequestSummary,
    GiftRequestUpdate,
    ProposalImageRead,
    ReferenceFileLink,
    OccasionActivity,
    OccasionActivityItem,
    SendEventGiftRequest,
    SendGiftsRequest,
    SendGiftsResult,
    DuplicateRequest,
    UpcomingGiftItem,
)
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)

MINOR_PER_CREDIT = 100  # 1 credit = 1 rupee = 100 paise


def credits_for(rupees: Any) -> int:
    """Credits needed for an amount in rupees: 1 credit per rupee, rounded up to a whole credit."""
    return max(-(-int(round(float(rupees) * 100)) // MINOR_PER_CREDIT), 1)


REFERENCE_BUCKET = "gift-request-references"
REFERENCE_MAX_BYTES = 5 * 1024 * 1024
REFERENCE_URL_SECONDS = 300
REFERENCE_TYPES = {"image/png": "png", "image/jpeg": "jpg", "application/pdf": "pdf"}
EDITABLE_STATUSES = ("DRAFT", "NEEDS_INFO")
# Where a request is considered "still open" (not finished or cancelled).
OPEN_STATUSES = ["SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "PROPOSAL_READY"]
FULFILMENT_STATUSES = ["CONFIRMED", "IN_PROGRESS", "DISPATCHED"]
STAFF_ACTIONS = {"start_review", "request_info", "publish_proposal", "reject", "start_fulfilment", "dispatch", "deliver"}
SUBMIT_LABELS = {
    "recipient_id": "who the gift is for",
    "occasion": "an occasion or event",
    "delivery_date": "the required delivery date",
    "budget": "a gift budget (or let TOFAA recommend one)",
    "initiated_via": "how this gift was initiated",
    "relationship": "the relationship with the recipient",
}


class GiftRequestService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def create(
        self, tenant_id: str, payload: GiftRequestCreate, actor: UserProfileResponse
    ) -> GiftRequestRead:
        self._require_can_request(actor)
        self._require_tenant_access(tenant_id, actor)
        values = payload.model_dump(mode="json")
        self._check_delivery_date(values.get("delivery_date"))
        _, recipient_name, _, _ = run_parallel(  # independent checks: one wait instead of four
            lambda: self._require_active_tenant(tenant_id),
            lambda: self._require_recipient(tenant_id, values["recipient_id"]),
            lambda: self._require_event(tenant_id, values["event_id"], values["recipient_id"]),
            lambda: self._require_occasion(tenant_id, values["occasion_id"]),
        )
        self._normalise_values(values, recipient_name=recipient_name)
        values.update({"tenant_id": tenant_id, "created_by_user_id": actor.id, "status": "DRAFT"})
        try:
            result = self.database.table("gift_requests").insert(values).select("*").execute()
        except APIError as exc:
            if exc.code == "PGRST205":
                raise HTTPException(
                    status_code=503,
                    detail="Gift request migration is missing or the Supabase schema cache needs reloading.",
                ) from exc
            logger.exception("Could not create gift request")
            raise HTTPException(status_code=409, detail="Gift request could not be created.") from exc
        except Exception as exc:
            logger.exception("Could not create gift request")
            raise HTTPException(status_code=409, detail="Gift request could not be created.") from exc
        if not result.data:
            raise HTTPException(status_code=409, detail="Gift request could not be created.")
        return self._enrich([result.data[0]])[0]

    @staticmethod
    def _check_delivery_date(value: str | None) -> None:
        if value and date.fromisoformat(value) < date.today():
            raise HTTPException(status_code=422, detail="The delivery date cannot be in the past.")

    @staticmethod
    def _normalise_values(values: dict[str, Any], *, recipient_name: str | None = None, current: dict[str, Any] | None = None) -> None:
        """Fill what the form leaves out: title, purpose and the single budget figure the credit flow uses."""
        current = current or {}
        if values.get("interests", "") is None:
            values.pop("interests")
        if values.get("budget_mode", "") is None:
            values.pop("budget_mode")
        mode = values.get("budget_mode", current.get("budget_mode", "SPECIFIC"))
        if mode == "TOFAA_RECOMMEND":
            values.update({"budget_min": None, "budget_max": None, "requested_budget": None, "requested_credits": None})
        elif "budget_max" in values or "budget_min" in values:
            high = values.get("budget_max", current.get("budget_max"))
            low = values.get("budget_min", current.get("budget_min"))
            if high is None and low is not None:
                values["budget_max"] = high = low
            if "requested_budget" not in values:
                values["requested_budget"] = high
            if values.get("requested_budget") is not None:
                values["requested_credits"] = credits_for(values["requested_budget"])
        if "title" in values and not values["title"] or ("title" not in values and not current.get("title")):
            values["title"] = f"Gift for {recipient_name}" if recipient_name else "Gift request"
        if "purpose" in values and not values["purpose"] or ("purpose" not in values and not current.get("purpose")):
            values["purpose"] = (values.get("gift_purpose") or current.get("gift_purpose") or "Gift request").replace("_", " ").capitalize()

    def list_for_tenant(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        status_filter: GiftRequestStatus | None,
        search: str | None = None,
        recipient_id: str | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
    ) -> GiftRequestPage:
        self._require_tenant_access(tenant_id, actor)
        query = self.database.table("gift_requests").select("*", count="exact").eq("tenant_id", tenant_id)
        if status_filter:
            query = query.eq("status", status_filter.value)
        if recipient_id:
            query = query.eq("recipient_id", recipient_id)
        if date_from:
            query = query.gte("created_at", date_from.isoformat())
        if date_to:
            query = query.lt("created_at", (date_to + timedelta(days=1)).isoformat())
        query = self._apply_search(query, tenant_id, search)
        return self._page(query, page, limit)

    def summary(self, tenant_id: str, actor: UserProfileResponse) -> GiftRequestSummary:
        """Counts per status for the filter tabs."""
        self._require_tenant_access(tenant_id, actor)
        found = self.database.rpc("gift_request_status_counts", {"p_tenant_id": tenant_id}).execute().data or {}
        counts = {status.value: int(found.get(status.value, 0)) for status in GiftRequestStatus}
        return GiftRequestSummary(total=sum(counts.values()), by_status=counts)

    def send_gifts(
        self,
        tenant_id: str,
        source_type: str,
        source_id: str,
        payload: SendGiftsRequest | SendEventGiftRequest,
        actor: UserProfileResponse,
    ) -> SendGiftsResult:
        """Set each chosen recipient's budget and send a gift request to TOFAA for each, in one step."""
        self._require_can_request(actor)
        require_permission(actor, Permission.GIFT_SPEND_MANAGE)
        self._require_tenant_access(tenant_id, actor)
        self._require_active_tenant(tenant_id)

        if source_type == "occasion":
            rows = (
                self.database.table("occasions").select("occasion_name,occasion_date")
                .eq("id", source_id).eq("is_active", True)
                .or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}").limit(1).execute().data
            )
            if not rows:
                raise HTTPException(status_code=404, detail="Occasion not found.")
            title, delivery_date = rows[0]["occasion_name"], rows[0]["occasion_date"]
            recipient_ids = {str(item) for item in getattr(payload, "recipient_ids", [])}
            group_ids = [str(item) for item in getattr(payload, "group_ids", [])]
            if group_ids:
                members = (
                    self.database.table("spend_recipient_group_members").select("recipient_id")
                    .eq("tenant_id", tenant_id).in_("group_id", group_ids).execute().data or []
                )
                recipient_ids.update(row["recipient_id"] for row in members)
        else:
            rows = (
                self.database.table("events").select("event_name,event_date,recipient_id")
                .eq("tenant_id", tenant_id).eq("id", source_id).eq("is_active", True).limit(1).execute().data
            )
            if not rows or not rows[0].get("recipient_id"):
                raise HTTPException(status_code=404, detail="Event not found.")
            title, delivery_date = rows[0]["event_name"], rows[0]["event_date"]
            recipient_ids = {rows[0]["recipient_id"]}
        if not recipient_ids:
            raise HTTPException(status_code=422, detail="Pick at least one group or person.")

        rupees = payload.budget_per_recipient
        credits = credits_for(rupees)

        result = self._rpc("send_gifts", {
            "p_tenant_id": tenant_id,
            "p_source_type": source_type,
            "p_source_id": source_id,
            "p_recipient_ids": sorted(recipient_ids),
            "p_budget_credits": credits,
            "p_budget_rupees": float(rupees),
            "p_title": title,
            "p_purpose": payload.note,
            "p_delivery_date": str(delivery_date),
            "p_actor_id": actor.id,
        }) or {}
        created = result.get("created") or []
        skipped = [str(item) for item in result.get("skipped") or []]
        return SendGiftsResult(
            created_count=len(created),
            skipped_count=len(skipped),
            request_ids=[row["id"] for row in created],
            skipped_recipient_ids=skipped,
            credits_per_recipient=credits,
            total_credits=credits * len(created),
        )

    def occasion_activity(self, tenant_id: str, actor: UserProfileResponse) -> OccasionActivity:
        """What happened to gifts sent for occasions and events: pending, approved, delivered recently."""
        self._require_tenant_access(tenant_id, actor)
        db = self.database
        since = (date.today() - timedelta(days=30)).isoformat()
        requests, delivered_rows = run_parallel(
            lambda: (
                db.table("gift_requests").select("*").eq("tenant_id", tenant_id)
                .in_("status", [*OPEN_STATUSES, "CONFIRMED", "IN_PROGRESS", "DISPATCHED"])
                .or_("occasion_id.not.is.null,event_id.not.is.null")
                .order("updated_at", desc=True).limit(100).execute().data or []
            ),
            lambda: (
                db.table("gifts").select("*").eq("tenant_id", tenant_id).eq("status", "DELIVERED")
                .gte("updated_at", since).order("updated_at", desc=True).limit(50).execute().data or []
            ),
        )
        delivered_request_ids = {row["request_id"] for row in delivered_rows if row.get("request_id")}
        pending: list[OccasionActivityItem] = []
        approved: list[OccasionActivityItem] = []
        for request in self._enrich(requests):
            item = OccasionActivityItem(
                request_id=request.id,
                title=request.title,
                recipient_name=request.recipient_name,
                source_name=request.occasion_name or request.event_name,
                budget=request.requested_budget,
                credits=request.requested_credits,
                status=request.status.value,
                happened_at=request.updated_at,
            )
            if request.status.value in FULFILMENT_STATUSES:
                if request.id not in delivered_request_ids:
                    approved.append(item)
            else:
                pending.append(item)
        recipient_ids = list({row["recipient_id"] for row in delivered_rows if row.get("recipient_id")})
        event_ids = list({row["event_id"] for row in delivered_rows if row.get("event_id")})
        occasion_ids = list({row["occasion_id"] for row in delivered_rows if row.get("occasion_id")})
        recipient_names, event_names, occasion_names = run_parallel(
            lambda: {r["id"]: r.get("name") for r in db.table("recipients").select("id,name").in_("id", recipient_ids).execute().data or []} if recipient_ids else {},
            lambda: {r["id"]: r.get("event_name") for r in db.table("events").select("id,event_name").in_("id", event_ids).execute().data or []} if event_ids else {},
            lambda: {r["id"]: r.get("occasion_name") for r in db.table("occasions").select("id,occasion_name").in_("id", occasion_ids).execute().data or []} if occasion_ids else {},
        )
        delivered = [
            OccasionActivityItem(
                request_id=row.get("request_id"),
                title=row.get("gift_name") or "Gift",
                recipient_name=recipient_names.get(row.get("recipient_id")),
                source_name=occasion_names.get(row.get("occasion_id")) or event_names.get(row.get("event_id")),
                budget=(float(row["unit_price"]) * int(row.get("quantity") or 1)) if row.get("unit_price") is not None else None,
                status="DELIVERED",
                happened_at=row["updated_at"],
            )
            for row in delivered_rows
        ]
        return OccasionActivity(pending=pending, approved=approved, delivered=delivered)

    def upcoming(self, tenant_id: str, actor: UserProfileResponse, *, days: int) -> list[UpcomingGiftItem]:
        """Birthdays and events in the next `days` days, soonest first."""
        self._require_tenant_access(tenant_id, actor)
        today = date.today()
        last = today + timedelta(days=days)

        db = self.database
        events, recipients = run_parallel(
            lambda: (
                db.table("events").select("id,recipient_id,event_name,event_date").eq("tenant_id", tenant_id).eq("is_active", True)
                .gte("event_date", today.isoformat()).lte("event_date", last.isoformat()).limit(500).execute().data or []
            ),
            lambda: (
                db.table("recipients").select("id,name,date_of_birth").eq("tenant_id", tenant_id)
                .is_("deleted_at", "null").limit(2000).execute().data or []
            ),
        )
        names = {row["id"]: row.get("name") for row in recipients}

        open_requests: dict[str, str] = {}
        event_ids = [row["id"] for row in events]
        if event_ids:
            for row in (
                self.database.table("gift_requests")
                .select("id,event_id,status")
                .eq("tenant_id", tenant_id)
                .in_("event_id", event_ids)
                .neq("status", "CANCELLED")
                .execute()
                .data
                or []
            ):
                open_requests.setdefault(row["event_id"], row["id"])

        items: list[UpcomingGiftItem] = []
        birthday_events: dict[tuple[str, date], dict[str, Any]] = {}
        for row in events:
            when = date.fromisoformat(str(row["event_date"]))
            recipient_id = row.get("recipient_id")
            if recipient_id is None:
                continue  # an event that is not tied to a person cannot start a request
            if "birthday" in str(row["event_name"]).lower():
                birthday_events[(recipient_id, when)] = row
                continue
            items.append(UpcomingGiftItem(
                kind="ANNIVERSARY" if "anniversary" in str(row["event_name"]).lower() else "EVENT", recipient_id=recipient_id, recipient_name=names.get(recipient_id),
                title=row["event_name"], date=when, days_away=(when - today).days,
                event_id=row["id"], request_id=open_requests.get(row["id"]),
            ))
        for row in recipients:
            raw = row.get("date_of_birth")
            if not raw:
                continue
            born = date.fromisoformat(str(raw))
            when = self._next_birthday(born, today)
            if when > last:
                continue
            existing = birthday_events.pop((row["id"], when), None)
            items.append(UpcomingGiftItem(
                kind="BIRTHDAY", recipient_id=row["id"], recipient_name=row.get("name"),
                title="Birthday", date=when, days_away=(when - today).days,
                event_id=existing["id"] if existing else None,
                request_id=open_requests.get(existing["id"]) if existing else None,
            ))
        for (recipient_id, when), row in birthday_events.items():  # birthday-style events on other dates
            items.append(UpcomingGiftItem(
                kind="BIRTHDAY", recipient_id=recipient_id, recipient_name=names.get(recipient_id),
                title=row["event_name"], date=when, days_away=(when - today).days,
                event_id=row["id"], request_id=open_requests.get(row["id"]),
            ))
        items.sort(key=lambda item: (item.date, item.recipient_name or ""))
        return items

    def duplicates(
        self, tenant_id: str, actor: UserProfileResponse, *, recipient_id: str, event_id: str | None, occasion_id: str | None,
    ) -> list[DuplicateRequest]:
        """Requests that are not cancelled for the same person and the same event (or occasion)."""
        self._require_tenant_access(tenant_id, actor)
        if not event_id and not occasion_id:
            return []
        query = (
            self.database.table("gift_requests").select("id,request_code,status,title")
            .eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).neq("status", "CANCELLED")
        )
        query = query.eq("event_id", event_id) if event_id else query.eq("occasion_id", occasion_id)
        return [DuplicateRequest.model_validate(row) for row in query.order("created_at", desc=True).limit(10).execute().data or []]

    @staticmethod
    def _next_birthday(born: date, today: date) -> date:
        def in_year(year: int) -> date:
            try:
                return born.replace(year=year)
            except ValueError:  # 29 Feb in a non-leap year
                return date(year, 2, 28)
        this_year = in_year(today.year)
        return this_year if this_year >= today else in_year(today.year + 1)

    def staff_queue(
        self,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        status_filter: GiftRequestStatus | None,
    ) -> GiftRequestPage:
        self._require_staff(actor)
        query = self.database.table("gift_requests").select("*", count="exact")
        tenant_ids = tenant_service.visible_tenant_ids(actor)
        if tenant_ids is not None:
            if not tenant_ids:
                return GiftRequestPage(
                    items=[],
                    pagination=PaginationMeta(page=page, limit=limit, total_records=0),
                    next_cursor=None,
                )
            query = query.in_("tenant_id", tenant_ids)
        if status_filter:
            query = query.eq("status", status_filter.value)
        return self._page(query, page, limit)

    def get(self, tenant_id: str, request_id: str, actor: UserProfileResponse) -> GiftRequestRead:
        self._require_tenant_access(tenant_id, actor)
        row = self._get_row(tenant_id, request_id)
        return self._enrich([row])[0]

    def history(
        self, tenant_id: str, request_id: str, actor: UserProfileResponse
    ) -> GiftRequestEventPage:
        self._require_tenant_access(tenant_id, actor)
        self._get_row(tenant_id, request_id)
        result = (
            self.database.table("gift_request_events")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("gift_request_id", request_id)
            .order("created_at")
            .order("id")
            .execute()
        )
        rows = result.data or []
        actors = self._profiles([row["actor_user_id"] for row in rows if row.get("actor_user_id")])
        return GiftRequestEventPage(
            items=[
                GiftRequestEventRead.model_validate({
                    **row,
                    "actor_name": actors.get(row.get("actor_user_id"), {}).get("full_name"),
                    "actor_role": actors.get(row.get("actor_user_id"), {}).get("role"),
                })
                for row in rows
            ]
        )

    def update(
        self,
        tenant_id: str,
        request_id: str,
        payload: GiftRequestUpdate,
        actor: UserProfileResponse,
    ) -> GiftRequestRead:
        require_permission(actor, Permission.GIFT_REQUEST_UPDATE)
        self._require_tenant_access(tenant_id, actor)
        values = payload.model_dump(mode="json", exclude_unset=True)
        current, recipient_name = run_parallel(
            lambda: self._get_row(tenant_id, request_id),
            lambda: self._require_recipient(tenant_id, values["recipient_id"]) if "recipient_id" in values else None,
        )
        if current["status"] not in EDITABLE_STATUSES:
            raise HTTPException(status_code=409, detail="Only draft or clarification requests can be edited.")
        self._check_delivery_date(values.get("delivery_date"))
        self._normalise_values(values, recipient_name=recipient_name, current=current)
        event_id = values.get("event_id", current["event_id"])
        occasion_id = values.get("occasion_id", current.get("occasion_id"))
        if event_id is not None and occasion_id is not None:
            raise HTTPException(status_code=422, detail="Only one of eventId or occasionId may be set.")
        run_parallel(
            lambda: self._require_event(tenant_id, event_id, values.get("recipient_id", current["recipient_id"])),
            lambda: self._require_occasion(tenant_id, occasion_id),
        )
        result = (
            self.database.table("gift_requests")
            .update(values)
            .eq("tenant_id", tenant_id)
            .eq("id", request_id)
            .in_("status", list(EDITABLE_STATUSES))
            .select("*")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=409, detail="Gift request changed state and cannot be edited.")
        return self._enrich([result.data[0]])[0]

    def transition(
        self,
        tenant_id: str,
        request_id: str,
        action: str,
        actor: UserProfileResponse,
        *,
        note: str | None = None,
        selected_option_index: int | None = None,
    ) -> GiftRequestRead:
        self._require_tenant_access(tenant_id, actor)
        if action not in ("submit", "cancel", "approve", "request_changes"):
            raise HTTPException(status_code=403, detail="This action is not available.")
        if action in ("approve", "request_changes") and actor.role == Role.KAM:
            raise HTTPException(status_code=403, detail="Only the client can decide on a proposal.")
        if actor.role == Role.CLIENT:
            require_permission(actor, Permission.GIFT_REQUEST_UPDATE)
        else:
            require_permission(actor, Permission.GIFT_REQUEST_REVIEW)
        if action == "submit":
            self._require_complete(self._get_row(tenant_id, request_id))
        previous = self._apply_selected_option(tenant_id, request_id, selected_option_index) if action == "approve" else None
        try:
            return self._transition_rpc(tenant_id, request_id, action, actor, note=note)
        except HTTPException:
            if previous:
                self._restore_option(tenant_id, request_id, previous)
            raise

    @staticmethod
    def _require_complete(row: dict[str, Any]) -> None:
        """A request can only go to TOFAA once the required form fields are filled in."""
        missing = []
        if not row.get("recipient_id"):
            missing.append("recipient_id")
        if not (row.get("occasion_id") or row.get("event_id")):
            missing.append("occasion")
        if not row.get("delivery_date"):
            missing.append("delivery_date")
        elif date.fromisoformat(str(row["delivery_date"])) < date.today():
            raise HTTPException(status_code=422, detail="The delivery date is in the past. Pick a new date before submitting.")
        if row.get("budget_mode", "SPECIFIC") == "SPECIFIC" and not (row.get("budget_max") or row.get("requested_budget")):
            missing.append("budget")
        if not row.get("initiated_via"):
            missing.append("initiated_via")
        if not row.get("relationship"):
            missing.append("relationship")
        if missing:
            raise HTTPException(
                status_code=422,
                detail="Please add " + ", ".join(SUBMIT_LABELS[item] for item in missing) + " before submitting.",
            )

    def staff_transition(
        self,
        request_id: str,
        action: str,
        actor: UserProfileResponse,
        *,
        note: str | None = None,
        proposal: dict[str, Any] | None = None,
    ) -> GiftRequestRead:
        self._require_staff(actor)
        tenant_id = self._request_tenant_id(request_id)
        tenant_service.require_context(tenant_id, actor, write=True)
        return self._transition_rpc(
            tenant_id, request_id, action, actor, note=note, proposal=proposal
        )

    def _transition_rpc(
        self,
        tenant_id: str,
        request_id: str,
        action: str,
        actor: UserProfileResponse,
        *,
        note: str | None = None,
        proposal: dict[str, Any] | None = None,
    ) -> GiftRequestRead:
        if action == "approve":
            row = self._rpc(
                "approve_gift_request_with_spend",
                {"p_tenant_id": tenant_id, "p_request_id": request_id, "p_actor_id": actor.id, "p_note": note},
            )
        else:
            row = self._rpc(
                "transition_gift_request",
                {
                    "p_tenant_id": tenant_id,
                    "p_request_id": request_id,
                    "p_actor_id": actor.id,
                    "p_action": action,
                    "p_note": note,
                    "p_proposal": proposal,
                },
            )
        return self._enrich([row])[0]

    def upload_reference(
        self, tenant_id: str, request_id: str, actor: UserProfileResponse,
        *, content: bytes, content_type: str, file_name: str,
    ) -> GiftRequestRead:
        require_permission(actor, Permission.GIFT_REQUEST_UPDATE)
        self._require_tenant_access(tenant_id, actor)
        row = self._get_row(tenant_id, request_id)
        if row["status"] not in EDITABLE_STATUSES:
            raise HTTPException(status_code=409, detail="A reference can only be attached to a draft or clarification request.")
        content_type = (content_type or "").split(";")[0].strip().lower()
        if content_type not in REFERENCE_TYPES:
            raise HTTPException(status_code=415, detail="Attach a JPG, PNG or PDF file.")
        if not content:
            raise HTTPException(status_code=422, detail="The file is empty.")
        if len(content) > REFERENCE_MAX_BYTES:
            raise HTTPException(status_code=413, detail="The file is too large. Attach one under 5 MB.")
        safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", file_name or "reference")[:80] or "reference"
        path = f"{tenant_id}/{request_id}/{uuid4().hex}.{REFERENCE_TYPES[content_type]}"
        storage = self.database.storage.from_(REFERENCE_BUCKET)
        try:
            storage.upload(path, content, {"content-type": content_type})
        except Exception as exc:  # the storage client raises its own error types
            logger.exception("Could not store gift request reference")
            raise HTTPException(status_code=503, detail="The file could not be saved. Please try again.") from exc
        reference = {"path": path, "fileName": safe_name, "contentType": content_type, "sizeBytes": len(content)}
        updated = self.database.table("gift_requests").update({"reference_file": reference}).eq("tenant_id", tenant_id).eq("id", request_id).in_("status", list(EDITABLE_STATUSES)).select("*").execute().data
        if not updated:
            self._remove_reference_object(path)
            raise HTTPException(status_code=409, detail="Gift request changed state and cannot be edited.")
        old = (row.get("reference_file") or {}).get("path")
        if old:
            self._remove_reference_object(old)
        return self._enrich([updated[0]])[0]

    def remove_reference(self, tenant_id: str, request_id: str, actor: UserProfileResponse) -> GiftRequestRead:
        require_permission(actor, Permission.GIFT_REQUEST_UPDATE)
        self._require_tenant_access(tenant_id, actor)
        row = self._get_row(tenant_id, request_id)
        if row["status"] not in EDITABLE_STATUSES:
            raise HTTPException(status_code=409, detail="The reference can only be removed from a draft or clarification request.")
        updated = self.database.table("gift_requests").update({"reference_file": None}).eq("tenant_id", tenant_id).eq("id", request_id).select("*").execute().data
        old = (row.get("reference_file") or {}).get("path")
        if old:
            self._remove_reference_object(old)
        return self._enrich([updated[0] if updated else row])[0]

    def reference_link(self, tenant_id: str, request_id: str, actor: UserProfileResponse) -> ReferenceFileLink:
        self._require_tenant_access(tenant_id, actor)
        path = (self._get_row(tenant_id, request_id).get("reference_file") or {}).get("path")
        if not path:
            raise HTTPException(status_code=404, detail="No reference file was attached.")
        try:
            signed = self.database.storage.from_(REFERENCE_BUCKET).create_signed_url(path, REFERENCE_URL_SECONDS)
        except Exception as exc:
            logger.exception("Could not sign gift request reference link")
            raise HTTPException(status_code=503, detail="The file could not be opened right now.") from exc
        url = signed.get("signedURL") or signed.get("signedUrl")
        if not url:
            raise HTTPException(status_code=503, detail="The file could not be opened right now.")
        return ReferenceFileLink(url=url, expires_in_seconds=REFERENCE_URL_SECONDS)

    def _remove_reference_object(self, path: str) -> None:
        try:
            self.database.storage.from_(REFERENCE_BUCKET).remove([path])
        except Exception:  # an orphaned file is harmless; never fail the request over it
            logger.warning("Could not delete gift request reference %s", path)

    def upload_proposal_image(
        self, request_id: str, actor: UserProfileResponse, *, content: bytes, content_type: str
    ) -> ProposalImageRead:
        """TOFAA staff attach a photo to a proposal option; the URL goes into the option's imageUrl."""
        self._require_staff(actor)
        tenant_id = self._request_tenant_id(request_id)
        tenant_service.require_context(tenant_id, actor, write=True)
        status_now = self._get_row(tenant_id, request_id)["status"]
        if status_now not in ("IN_REVIEW", "PROPOSAL_READY"):
            raise HTTPException(status_code=409, detail="Photos can only be added while the proposal is being prepared.")
        url = images.store_image(
            self.database, f"proposals/{tenant_id}/{request_id}", content, content_type, max_bytes=images.PHOTO_MAX_BYTES
        )
        return ProposalImageRead(url=url)

    def _page(self, query: Any, page: int, limit: int) -> GiftRequestPage:
        result = (
            query.order("created_at", desc=True)
            .order("id", desc=True)
            .range((page - 1) * limit, page * limit - 1)
            .execute()
        )
        rows = result.data or []
        total = result.count or 0
        return GiftRequestPage(
            items=self._enrich(rows),
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def _get_row(self, tenant_id: str, request_id: str) -> dict[str, Any]:
        result = (
            self.database.table("gift_requests")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("id", request_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Gift request not found.")
        return result.data[0]

    def _request_tenant_id(self, request_id: str) -> str:
        result = self.database.table("gift_requests").select("tenant_id").eq("id", request_id).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Gift request not found.")
        return result.data[0]["tenant_id"]

    def _require_recipient(self, tenant_id: str, recipient_id: str) -> str | None:
        result = (
            self.database.table("recipients")
            .select("id,name")
            .eq("tenant_id", tenant_id)
            .eq("id", recipient_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found in this tenant.")
        return result.data[0].get("name")

    def _require_event(
        self, tenant_id: str, event_id: str | None, recipient_id: str
    ) -> None:
        if event_id is None:
            return
        result = (
            self.database.table("events")
            .select("recipient_id")
            .eq("tenant_id", tenant_id)
            .eq("id", event_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Active event not found in this tenant.")
        event_recipient = result.data[0]["recipient_id"]
        if not event_recipient or event_recipient != recipient_id:
            raise HTTPException(status_code=422, detail="Event belongs to a different recipient.")

    def _require_occasion(self, tenant_id: str, occasion_id: str | None) -> None:
        if occasion_id is None:
            return
        result = (
            self.database.table("occasions")
            .select("id")
            .eq("id", occasion_id)
            .eq("is_active", True)
            .or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Active occasion not found in this tenant.")

    def _require_active_tenant(self, tenant_id: str) -> None:
        tenant = tenant_service.tenant_state(tenant_id)
        if tenant is None:
            raise HTTPException(status_code=404, detail="Tenant not found.")
        if tenant["status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="Tenant must be active to create gift requests.")

    def _apply_search(self, query: Any, tenant_id: str, search: str | None) -> Any:
        term = (search or "").strip().replace(",", " ").replace("(", " ").replace(")", " ")
        if not term:
            return query
        recipients = (
            self.database.table("recipients")
            .select("id")
            .eq("tenant_id", tenant_id)
            .ilike("name", f"%{term}%")
            .limit(200)
            .execute()
            .data
            or []
        )
        clauses = [f"title.ilike.%{term}%", f"request_code.ilike.%{term.lstrip('#')}%"]
        number = re.fullmatch(r"#?(?:tg-?)?(\d{1,9})", term, re.IGNORECASE)  # "TG-0008", "#8" or "8" find request 8
        if number:
            clauses.append(f"request_number.eq.{int(number.group(1))}")
        if recipients:
            clauses.append(f"recipient_id.in.({','.join(row['id'] for row in recipients)})")
        return query.or_(",".join(clauses))

    def _profiles(self, ids: list[str]) -> dict[str, dict[str, Any]]:
        ids = list({item for item in ids if item})
        if not ids:
            return {}
        rows = self.database.table("profiles").select("id,full_name,role,avatar_url").in_("id", ids).execute().data or []
        return {row["id"]: row for row in rows}

    def _enrich(self, rows: list[dict[str, Any]]) -> list[GiftRequestRead]:
        """Add the names the screens show (recipient, occasion, event, requester)."""
        if not rows:
            return []
        occasion_ids = list({row["occasion_id"] for row in rows if row.get("occasion_id")})
        event_ids = list({row["event_id"] for row in rows if row.get("event_id")})
        db = self.database
        recipient_rows, occasion_rows, event_rows, creators = run_parallel(
            lambda: db.table("recipients").select("id,name,mobile_number,avatar_url").in_("id", list({row["recipient_id"] for row in rows})).execute().data or [],
            lambda: db.table("occasions").select("id,occasion_name,occasion_date").in_("id", occasion_ids).execute().data or [] if occasion_ids else [],
            lambda: db.table("events").select("id,event_name,event_date").in_("id", event_ids).execute().data or [] if event_ids else [],
            lambda: self._profiles([row["created_by_user_id"] for row in rows]),
        )
        recipients = {row["id"]: row for row in recipient_rows}
        occasions = {row["id"]: row for row in occasion_rows}
        events = {row["id"]: row for row in event_rows}
        items = []
        for row in rows:
            event = events.get(row.get("event_id"), {})
            items.append(
                GiftRequestRead.model_validate({
                    **row,
                    "recipient_name": recipients.get(row["recipient_id"], {}).get("name"),
                    "recipient_mobile": recipients.get(row["recipient_id"], {}).get("mobile_number"),
                    "recipient_avatar_url": recipients.get(row["recipient_id"], {}).get("avatar_url"),
                    "occasion_name": occasions.get(row.get("occasion_id"), {}).get("occasion_name"),
                    "occasion_date": occasions.get(row.get("occasion_id"), {}).get("occasion_date"),
                    "event_name": event.get("event_name"),
                    "event_date": event.get("event_date"),
                    "created_by_name": creators.get(row["created_by_user_id"], {}).get("full_name"),
                    "created_by_role": creators.get(row["created_by_user_id"], {}).get("role"),
                    "created_by_avatar_url": creators.get(row["created_by_user_id"], {}).get("avatar_url"),
                })
            )
        return items

    def _apply_selected_option(self, tenant_id: str, request_id: str, index: int | None) -> dict[str, Any] | None:
        """Record the chosen option and set the credits to spend from its price (one recipient)."""
        row = self._get_row(tenant_id, request_id)
        if row["status"] != GiftRequestStatus.PROPOSAL_READY.value:
            return None  # the database reports the invalid state
        options = (row.get("proposal") or {}).get("options") or []
        if index is None:
            if len(options) > 1:
                raise HTTPException(status_code=422, detail="Pick one of the options before approving.")
            index = 0
        if index >= len(options):
            raise HTTPException(status_code=422, detail="That option does not exist.")
        values: dict[str, Any] = {"selected_option_index": index}
        price = options[index].get("price")
        if price is not None:
            values["requested_credits"] = credits_for(price)
            values["requested_budget"] = float(price)
        previous = {key: row.get(key) for key in values}
        self.database.table("gift_requests").update(values).eq("tenant_id", tenant_id).eq("id", request_id).execute()
        return previous

    def _restore_option(self, tenant_id: str, request_id: str, previous: dict[str, Any]) -> None:
        self.database.table("gift_requests").update(previous).eq("tenant_id", tenant_id).eq("id", request_id).execute()

    @staticmethod
    def _require_tenant_access(tenant_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.GIFT_REQUEST_READ)
        tenant_service.require_access(tenant_id, actor)

    @staticmethod
    def _require_can_request(actor: UserProfileResponse) -> None:
        """Gift requests are raised by the client's team (or their KAM), never by a super admin."""
        if actor.role == Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Super admins cannot create gift requests.")
        require_permission(actor, Permission.GIFT_REQUEST_CREATE)

    @staticmethod
    def _require_staff(actor: UserProfileResponse) -> None:
        if actor.role not in (Role.KAM, Role.SUPER_ADMIN):
            raise HTTPException(status_code=403, detail="Only assigned KAMs and super admins can review gift requests.")
        require_permission(actor, Permission.GIFT_REQUEST_REVIEW)

    def _rpc(self, function: str, params: dict[str, Any]) -> Any:
        try:
            result = self.database.rpc(function, params).execute()
            data = result.data
            return data[0] if isinstance(data, list) and len(data) == 1 else data
        except APIError as exc:
            logger.exception("Gift request database operation failed: %s", function)
            message = (exc.message or "").lower()
            if "gift_request_not_found" in message:
                raise HTTPException(status_code=404, detail="Gift request not found.") from exc
            if "invalid_gift_request_status" in message:
                raise HTTPException(status_code=409, detail="Gift request is not in a valid state for this action.") from exc
            if "gift_request_note_required" in message:
                raise HTTPException(status_code=422, detail="A note is required for this action.") from exc
            if "invalid_gift_proposal" in message:
                raise HTTPException(status_code=422, detail="A proposal with at least one option is required.") from exc
            if "occasion_not_available" in message:
                raise HTTPException(status_code=404, detail="That occasion is not available.") from exc
            if "event_not_found" in message:
                raise HTTPException(status_code=404, detail="That event was not found.") from exc
            if "recipient_not_found" in message:
                raise HTTPException(status_code=404, detail="One of the people you picked was not found.") from exc
            if "group_needs_recipients" in message:
                raise HTTPException(status_code=422, detail="Pick at least one group or person.") from exc
            if "invalid_spend_budget" in message:
                raise HTTPException(status_code=422, detail="Enter a budget greater than 0.") from exc
            if "budget_below_spent" in message:
                raise HTTPException(status_code=409, detail="That budget is lower than what is already spent.") from exc
            if "credit_account_not_found" in message:
                raise HTTPException(status_code=409, detail="You have no credits yet. Request credits first.") from exc
            if "spend_reservation_exceeds_balance" in message:
                raise HTTPException(status_code=409, detail="Your free credits do not cover this budget. Request more credits or lower the budget.") from exc
            if "gift_spend_source_or_credits_required" in message:
                raise HTTPException(status_code=422, detail="Set exactly one occasion/event and positive requestedCredits before approval.") from exc
            if "gift_spend_budget_missing" in message:
                raise HTTPException(status_code=409, detail="A spend budget must be allocated before approval.") from exc
            if "gift_spend_budget_exceeded" in message:
                raise HTTPException(status_code=409, detail="The requested credits exceed the remaining budget.") from exc
            if "gift_spend_limit_exceeded" in message:
                raise HTTPException(status_code=409, detail="The requested credits exceed the recipient limit.") from exc
            if "insufficient_credits" in message:
                raise HTTPException(status_code=409, detail="The tenant has insufficient credits for this approval.") from exc
            if exc.code in ("PGRST202", "PGRST205"):
                raise HTTPException(status_code=503, detail=f"A database update is missing ({function}). Apply the latest migrations, then retry.") from exc
            raise HTTPException(status_code=503, detail=f"Gift request operation could not be completed ({exc.code or 'unknown'}: {exc.message or 'no details'}).") from exc


gift_request_service = GiftRequestService()
