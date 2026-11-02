"""Tenant-scoped gift request use cases and workflow authorization."""

import logging
from typing import Any

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

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
    GiftRequestUpdate,
)
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)


class GiftRequestService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def create(
        self, tenant_id: str, payload: GiftRequestCreate, actor: UserProfileResponse
    ) -> GiftRequestRead:
        require_permission(actor, Permission.GIFT_REQUEST_CREATE)
        self._require_staff(actor)
        self._require_tenant_access(tenant_id, actor)
        self._require_active_tenant(tenant_id)
        values = payload.model_dump(mode="json")
        self._require_recipient(tenant_id, values["recipient_id"])
        self._require_event(tenant_id, values["event_id"], values["recipient_id"])
        self._require_occasion(tenant_id, values["occasion_id"])
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
        row = result.data[0]
        return GiftRequestRead.model_validate(row)

    def list_for_tenant(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        status_filter: GiftRequestStatus | None,
    ) -> GiftRequestPage:
        self._require_tenant_access(tenant_id, actor)
        query = self.database.table("gift_requests").select("*", count="exact").eq("tenant_id", tenant_id)
        if status_filter:
            query = query.eq("status", status_filter.value)
        return self._page(query, page, limit)

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
        if actor.role == Role.KAM:
            assignments = (
                self.database.table("team_client_assignments")
                .select("tenant_id")
                .eq("user_id", actor.id)
                .eq("active", True)
                .execute()
            )
            tenant_ids = list({row["tenant_id"] for row in assignments.data or []})
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
        return GiftRequestRead.model_validate(row)

    def history(
        self, tenant_id: str, request_id: str, actor: UserProfileResponse
    ) -> GiftRequestEventPage:
        self.get(tenant_id, request_id, actor)
        result = (
            self.database.table("gift_request_events")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("gift_request_id", request_id)
            .order("created_at")
            .order("id")
            .execute()
        )
        return GiftRequestEventPage(
            items=[GiftRequestEventRead.model_validate(row) for row in result.data or []]
        )

    def update(
        self,
        tenant_id: str,
        request_id: str,
        payload: GiftRequestUpdate,
        actor: UserProfileResponse,
    ) -> GiftRequestRead:
        require_permission(actor, Permission.GIFT_REQUEST_UPDATE)
        self._require_staff(actor)
        self.get(tenant_id, request_id, actor)
        values = payload.model_dump(mode="json", exclude_unset=True)
        if "recipient_id" in values:
            self._require_recipient(tenant_id, values["recipient_id"])
        current = self._get_row(tenant_id, request_id)
        if current["status"] not in (GiftRequestStatus.DRAFT.value, GiftRequestStatus.NEEDS_INFO.value):
            raise HTTPException(status_code=409, detail="Only draft or clarification requests can be edited.")
        self._require_event(
            tenant_id,
            values.get("event_id", current["event_id"]),
            values.get("recipient_id", current["recipient_id"]),
        )
        event_id = values.get("event_id", current["event_id"])
        occasion_id = values.get("occasion_id", current.get("occasion_id"))
        if event_id is not None and occasion_id is not None:
            raise HTTPException(status_code=422, detail="Only one of eventId or occasionId may be set.")
        self._require_occasion(tenant_id, occasion_id)
        result = (
            self.database.table("gift_requests")
            .update(values)
            .eq("tenant_id", tenant_id)
            .eq("id", request_id)
            .in_("status", ["DRAFT", "NEEDS_INFO"])
            .select("*")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=409, detail="Gift request changed state and cannot be edited.")
        return GiftRequestRead.model_validate(result.data[0])

    def transition(
        self,
        tenant_id: str,
        request_id: str,
        action: str,
        actor: UserProfileResponse,
        *,
        note: str | None = None,
    ) -> GiftRequestRead:
        self._require_tenant_access(tenant_id, actor)
        self._require_staff(actor)
        return self._transition_rpc(tenant_id, request_id, action, actor, note=note)

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
        self._require_tenant_access(tenant_id, actor)
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
        return GiftRequestRead.model_validate(row)

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
            items=[GiftRequestRead.model_validate(row) for row in rows],
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

    def _require_recipient(self, tenant_id: str, recipient_id: str) -> None:
        result = (
            self.database.table("recipients")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("id", recipient_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found in this tenant.")

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
        result = self.database.table("tenants").select("status").eq("id", tenant_id).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Tenant not found.")
        if result.data[0]["status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="Tenant must be active to create gift requests.")

    @staticmethod
    def _require_tenant_access(tenant_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.GIFT_REQUEST_READ)
        tenant_service.require_access(tenant_id, actor)

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
            if exc.code == "PGRST205":
                raise HTTPException(status_code=503, detail="Gift request database migration is missing or the schema cache needs reloading.") from exc
            raise HTTPException(status_code=503, detail="Gift request operation could not be completed.") from exc


gift_request_service = GiftRequestService()
