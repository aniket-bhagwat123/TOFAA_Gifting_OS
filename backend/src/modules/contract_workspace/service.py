"""Contract workspace reads and tenant-scoped gift line management."""

from datetime import date
from decimal import Decimal
import logging
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.contract_workspace.schemas import (
    ContractParameters,
    ContractSpend,
    ContractTierBudget,
    ContractWorkspaceRead,
    GiftBulkUpdate,
    GiftBulkUpdateResult,
    GiftLineCancel,
    GiftLineCreate,
    GiftLinePage,
    GiftLineRead,
    GiftLineUpdate,
)
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)

_NON_COMMITTED_STATUSES = {"CANCELLED"}


class ContractWorkspaceService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def workspace(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
    ) -> ContractWorkspaceRead:
        self._authorize_read(tenant_id, actor)
        contract = self._active_contract(tenant_id)
        tier_rows = (
            self.database.table("contract_tier_budgets")
            .select("tier_key,budget_amount,per_gift_limit")
            .eq("tenant_id", tenant_id)
            .eq("contract_id", contract["id"])
            .order("tier_key")
            .execute()
            .data
            or []
        )
        rows, total = self._gift_page(tenant_id, contract["id"], page, limit)
        all_rows = (
            self.database.table("gifts")
            .select("unit_price,quantity,status")
            .eq("tenant_id", tenant_id)
            .eq("contract_id", contract["id"])
            .execute()
            .data
            or []
        )
        return ContractWorkspaceRead(
            tenant_id=tenant_id,
            contract=ContractParameters.model_validate(contract),
            tier_budgets=[ContractTierBudget.model_validate(row) for row in tier_rows],
            gift_plan=self._page_result(rows, total, page, limit, actor),
            spend=self._spend(contract, all_rows),
        )

    def list_gifts(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
    ) -> GiftLinePage:
        self._authorize_read(tenant_id, actor)
        contract = self._active_contract(tenant_id)
        rows, total = self._gift_page(tenant_id, contract["id"], page, limit)
        return self._page_result(rows, total, page, limit, actor)

    def create_gift(
        self, tenant_id: str, payload: GiftLineCreate, actor: UserProfileResponse
    ) -> GiftLineRead:
        self._authorize_team(tenant_id, actor)
        contract = self._active_contract(tenant_id)
        self._validate_recipient(tenant_id, str(payload.recipient_id))
        self._validate_spend_source(
            tenant_id, payload.event_id, payload.occasion_id, str(payload.recipient_id),
        )
        if payload.request_id:
            self._validate_request(
                tenant_id, str(payload.request_id), str(payload.recipient_id), payload.event_id, payload.occasion_id,
            )
        values = payload.model_dump(mode="json", exclude={"status"})
        values.update(
            {
                "tenant_id": tenant_id,
                "contract_id": contract["id"],
                "status": payload.status.value,
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
            }
        )
        try:
            result = self.database.table("gifts").insert(values).select("*").execute()
        except APIError as exc:
            logger.exception("Could not create contract gift line")
            if exc.code == "PGRST205":
                raise HTTPException(status_code=503, detail="Contract workspace migration is missing or the Supabase schema cache needs reloading.") from exc
            raise HTTPException(status_code=409, detail="Gift line could not be created; check related records and contract limits.") from exc
        if not result.data:
            raise HTTPException(status_code=409, detail="Gift line could not be created.")
        return self._enrich([result.data[0]], actor)[0]

    def update_gift(
        self, gift_id: str, payload: GiftLineUpdate, actor: UserProfileResponse
    ) -> GiftLineRead:
        self._require_team_role(actor)
        current = self._get_gift(gift_id)
        self._authorize_team(current["tenant_id"], actor)
        values = payload.model_dump(mode="json", exclude_unset=True)
        reason = values.pop("reason", None)
        if "recipient_id" in values:
            self._validate_recipient(current["tenant_id"], values["recipient_id"])
        request_id = values.get("request_id", current.get("request_id"))
        recipient_id = values.get("recipient_id", current["recipient_id"])
        event_id = values.get("event_id", current.get("event_id"))
        occasion_id = values.get("occasion_id", current.get("occasion_id"))
        # Changing the source requires explicitly clearing the previous source.
        if "event_id" in values and values["event_id"] is not None:
            occasion_id = None
            values["occasion_id"] = None
        elif "occasion_id" in values and values["occasion_id"] is not None:
            event_id = None
            values["event_id"] = None
        self._validate_spend_source(current["tenant_id"], event_id, occasion_id, recipient_id)
        if request_id:
            self._validate_request(current["tenant_id"], request_id, recipient_id, event_id, occasion_id)
        price_changed = "unit_price" in values and Decimal(str(values["unit_price"])) != Decimal(str(current["unit_price"]))
        if price_changed and current["status"] != "PLANNED":
            if not reason:
                raise HTTPException(status_code=422, detail="A reason is required to change the price after confirmation.")
            values["price_change_reason"] = reason
        values["updated_by_user_id"] = actor.id
        try:
            result = (
                self.database.table("gifts")
                .update(values)
                .eq("tenant_id", current["tenant_id"])
                .eq("id", gift_id)
                .neq("status", "CANCELLED")
                .select("*")
                .execute()
            )
        except APIError as exc:
            logger.exception("Could not update contract gift line")
            if exc.code == "PGRST205":
                raise HTTPException(status_code=503, detail="Contract workspace migration is missing or the Supabase schema cache needs reloading.") from exc
            raise HTTPException(status_code=409, detail="Gift line could not be updated.") from exc
        if not result.data:
            raise HTTPException(status_code=409, detail="Cancelled gift lines cannot be updated.")
        return self._enrich([result.data[0]], actor)[0]

    def cancel_gift(
        self, gift_id: str, payload: GiftLineCancel, actor: UserProfileResponse
    ) -> GiftLineRead:
        self._require_team_role(actor)
        current = self._get_gift(gift_id)
        self._authorize_team(current["tenant_id"], actor)
        if current["status"] == "CANCELLED":
            raise HTTPException(status_code=409, detail="Gift line is already cancelled.")
        try:
            result = (
                self.database.table("gifts")
                .update(
                    {
                        "status": "CANCELLED",
                        "cancellation_reason": payload.reason,
                        "updated_by_user_id": actor.id,
                    }
                )
                .eq("tenant_id", current["tenant_id"])
                .eq("id", gift_id)
                .neq("status", "CANCELLED")
                .select("*")
                .execute()
            )
        except APIError as exc:
            logger.exception("Could not cancel contract gift line")
            raise HTTPException(status_code=409, detail="Gift line could not be cancelled.") from exc
        if not result.data:
            raise HTTPException(status_code=409, detail="Gift line is already cancelled.")
        return self._enrich([result.data[0]], actor)[0]

    def bulk_update(
        self, payload: GiftBulkUpdate, actor: UserProfileResponse
    ) -> GiftBulkUpdateResult:
        self._require_team_role(actor)
        ids = [str(gift_id) for gift_id in payload.gift_ids]
        rows = (
            self.database.table("gifts")
            .select("id,tenant_id")
            .in_("id", ids)
            .execute()
            .data
            or []
        )
        if len(rows) != len(ids):
            raise HTTPException(status_code=404, detail="One or more gift lines were not found.")
        for tenant_id in {row["tenant_id"] for row in rows}:
            self._authorize_team(tenant_id, actor)
        fields = payload.model_fields_set
        try:
            result = self.database.rpc(
                "bulk_update_contract_gifts",
                {
                    "p_gift_ids": ids,
                    "p_actor_id": actor.id,
                    "p_set_status": "status" in fields,
                    "p_status": payload.status.value if payload.status else None,
                    "p_set_vendor": "vendor_name" in fields,
                    "p_vendor_name": payload.vendor_name,
                    "p_set_delivery_date": "delivery_date" in fields,
                    "p_delivery_date": payload.delivery_date.isoformat() if payload.delivery_date else None,
                },
            ).execute()
        except APIError as exc:
            logger.exception("Could not bulk update contract gift lines")
            if "gift_not_found" in (exc.message or ""):
                raise HTTPException(status_code=404, detail="One or more gift lines were not found.") from exc
            raise HTTPException(status_code=409, detail="Gift lines could not be updated.") from exc
        updated = result.data or []
        return GiftBulkUpdateResult(updated_count=len(updated), items=self._enrich(updated, actor))

    def export_rows(self, tenant_id: str, actor: UserProfileResponse) -> tuple[dict[str, Any], list[GiftLineRead]]:
        self._authorize_team(tenant_id, actor)
        contract = self._active_contract(tenant_id)
        result = (
            self.database.table("gifts")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("contract_id", contract["id"])
            .order("created_at", desc=True)
            .order("id", desc=True)
            .execute()
        )
        return contract, self._enrich(result.data or [], actor)

    def _active_contract(self, tenant_id: str) -> dict[str, Any]:
        today = date.today().isoformat()
        rows = (
            self.database.table("contracts")
            .select("id,tenant_id,contract_number,status,sla_tier,start_date,end_date,currency,contract_value")
            .eq("tenant_id", tenant_id)
            .eq("status", "ACTIVE")
            .lte("start_date", today)
            .gte("end_date", today)
            .order("start_date", desc=True)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=404, detail="No active contract found for this tenant.")
        return rows[0]

    def _gift_page(self, tenant_id: str, contract_id: str, page: int, limit: int) -> tuple[list[dict[str, Any]], int]:
        result = (
            self.database.table("gifts")
            .select("*", count="exact")
            .eq("tenant_id", tenant_id)
            .eq("contract_id", contract_id)
            .order("created_at", desc=True)
            .order("id", desc=True)
            .range((page - 1) * limit, page * limit - 1)
            .execute()
        )
        return result.data or [], result.count or 0

    def _page_result(
        self, rows: list[dict[str, Any]], total: int, page: int, limit: int, actor: UserProfileResponse
    ) -> GiftLinePage:
        return GiftLinePage(
            items=self._enrich(rows, actor),
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    @staticmethod
    def _spend(contract: dict[str, Any], rows: list[dict[str, Any]]) -> ContractSpend:
        committed = sum(
            (Decimal(str(row["unit_price"])) * int(row["quantity"]) for row in rows if row["status"] not in _NON_COMMITTED_STATUSES),
            Decimal("0"),
        )
        delivered = sum(
            (Decimal(str(row["unit_price"])) * int(row["quantity"]) for row in rows if row["status"] == "DELIVERED"),
            Decimal("0"),
        )
        contract_value = Decimal(str(contract["contract_value"]))
        raw_used_percent = (committed * 100 / contract_value) if contract_value else Decimal("0")
        used_percent = raw_used_percent.quantize(Decimal("0.1"))
        budget_alert = "95_PERCENT_REACHED" if raw_used_percent >= 95 else "80_PERCENT_REACHED" if raw_used_percent >= 80 else None
        return ContractSpend(
            committed=committed,
            delivered=delivered,
            contract_value=contract_value,
            used_percent=used_percent,
            budget_alert=budget_alert,
        )

    def _enrich(self, rows: list[dict[str, Any]], actor: UserProfileResponse) -> list[GiftLineRead]:
        recipient_ids = list({row["recipient_id"] for row in rows})
        event_ids = list({row["event_id"] for row in rows if row.get("event_id")})
        occasion_ids = list({row["occasion_id"] for row in rows if row.get("occasion_id")})
        recipients = (
            self.database.table("recipients")
            .select("id,name,tier")
            .in_("id", recipient_ids)
            .execute()
            .data
            if recipient_ids else []
        ) or []
        events = (
            self.database.table("events")
            .select("id,event_name")
            .in_("id", event_ids)
            .execute()
            .data
            if event_ids else []
        ) or []
        recipient_map = {item["id"]: item for item in recipients}
        event_map = {item["id"]: item for item in events}
        occasions = (
            self.database.table("occasions").select("id,occasion_name").in_("id", occasion_ids).execute().data
            if occasion_ids else []
        ) or []
        occasion_map = {item["id"]: item for item in occasions}
        team_view = actor.role in (Role.KAM, Role.SUPER_ADMIN)
        items = []
        for row in rows:
            recipient = recipient_map.get(row["recipient_id"], {})
            event = event_map.get(row.get("event_id"), {})
            occasion = occasion_map.get(row.get("occasion_id"), {})
            data = {
                **row,
                "recipient_name": recipient.get("name"),
                "recipient_tier": recipient.get("tier"),
                "event_name": event.get("event_name"),
                "occasion_name": occasion.get("occasion_name"),
            }
            if not team_view:
                data["vendor_name"] = None
                data["price_change_reason"] = None
            items.append(GiftLineRead.model_validate(data))
        return items

    def _get_gift(self, gift_id: str) -> dict[str, Any]:
        rows = (
            self.database.table("gifts")
            .select("*")
            .eq("id", gift_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Gift line not found.")
        return rows[0]

    def _validate_recipient(self, tenant_id: str, recipient_id: str) -> None:
        rows = (
            self.database.table("recipients")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("id", recipient_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=422, detail="Recipient does not belong to this tenant or is inactive.")

    def _validate_event(self, tenant_id: str, event_id: str, recipient_id: str) -> None:
        rows = (
            self.database.table("events")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("id", event_id)
            .eq("recipient_id", recipient_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=422, detail="Event was not found for this recipient or is inactive.")

    def _validate_spend_source(
        self, tenant_id: str, event_id: str | UUID | None, occasion_id: str | UUID | None,
        recipient_id: str | None = None,
    ) -> None:
        if (event_id is None) == (occasion_id is None):
            raise HTTPException(status_code=422, detail="Exactly one of eventId or occasionId is required.")
        if event_id is not None:
            if recipient_id is None:
                row = self.database.table("events").select("recipient_id").eq("tenant_id", tenant_id).eq("id", str(event_id)).eq("is_active", True).limit(1).execute().data or []
                if not row or not row[0].get("recipient_id"):
                    raise HTTPException(status_code=422, detail="Event must be active and belong to a recipient.")
            else:
                self._validate_event(tenant_id, str(event_id), recipient_id)
            return
        query = self.database.table("occasions").select("id").eq("id", str(occasion_id)).eq("is_active", True).or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}").limit(1)
        if not query.execute().data:
            raise HTTPException(status_code=422, detail="Occasion was not found for this tenant or is inactive.")

    def _validate_request(
        self, tenant_id: str, request_id: str, recipient_id: str, event_id: str | UUID | None, occasion_id: str | UUID | None,
    ) -> None:
        rows = (
            self.database.table("gift_requests")
            .select("id,recipient_id,event_id,occasion_id")
            .eq("tenant_id", tenant_id)
            .eq("id", request_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=422, detail="Gift request does not belong to this tenant.")
        if rows[0]["recipient_id"] != recipient_id:
            raise HTTPException(status_code=422, detail="Gift request is for a different recipient.")
        if rows[0].get("event_id") != (str(event_id) if event_id else None) or rows[0].get("occasion_id") != (str(occasion_id) if occasion_id else None):
            raise HTTPException(status_code=422, detail="Gift request is for a different occasion or event.")

    def _authorize_read(self, tenant_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.CONTRACT_WORKSPACE_READ)
        tenant_service.require_access(tenant_id, actor)

    def _authorize_team(self, tenant_id: str, actor: UserProfileResponse) -> None:
        self._require_team_role(actor)
        tenant_service.require_access(tenant_id, actor)

    @staticmethod
    def _require_team_role(actor: UserProfileResponse) -> None:
        if actor.role not in (Role.KAM, Role.SUPER_ADMIN):
            raise HTTPException(status_code=403, detail="Only assigned team members and super admins can manage gifts.")
        require_permission(actor, Permission.GIFT_MANAGE)


contract_workspace_service = ContractWorkspaceService()
