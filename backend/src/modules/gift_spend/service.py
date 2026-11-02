"""Tenant-scoped budgets, credit reservations, and reminder inbox."""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.gift_spend.schemas import (
    EventBudgetUpdate,
    EventSpendSummary,
    GiftSpendNotificationPage,
    GiftSpendNotificationRead,
    GiftSpendSettingsRead,
    GiftSpendSettingsUpdate,
    OccasionGroupAllocationRead,
    OccasionGroupBudgetUpdate,
    OccasionGroupImport,
    OccasionSpendSummary,
    RecipientGroupCreate,
    RecipientGroupRead,
    RecipientGroupUpdate,
    RecipientOccasionBudgetUpdate,
    SpendRecipientAllocation,
    SpendSummary,
)
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)


class GiftSpendService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def list_groups(self, tenant_id: str, actor: UserProfileResponse) -> list[RecipientGroupRead]:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        groups = (
            self.database.table("spend_recipient_groups")
            .select("id,tenant_id,name,created_at,updated_at")
            .eq("tenant_id", tenant_id)
            .order("name")
            .order("id")
            .execute()
            .data
            or []
        )
        if not groups:
            return []
        memberships = (
            self.database.table("spend_recipient_group_members")
            .select("group_id,recipient_id")
            .eq("tenant_id", tenant_id)
            .in_("group_id", [row["id"] for row in groups])
            .execute()
            .data
            or []
        )
        by_group: dict[str, list[str]] = {row["id"]: [] for row in groups}
        for membership in memberships:
            by_group[membership["group_id"]].append(membership["recipient_id"])
        return [
            RecipientGroupRead.model_validate({**row, "recipient_ids": by_group[row["id"]]})
            for row in groups
        ]

    def save_group(
        self,
        tenant_id: str,
        payload: RecipientGroupCreate | RecipientGroupUpdate,
        actor: UserProfileResponse,
        *,
        group_id: str | None = None,
    ) -> RecipientGroupRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        result = self._rpc(
            "save_spend_recipient_group",
            {
                "p_tenant_id": tenant_id,
                "p_group_id": group_id,
                "p_name": payload.name,
                "p_recipient_ids": [str(recipient_id) for recipient_id in payload.recipient_ids],
                "p_actor_id": actor.id,
            },
        )
        if not result:
            raise HTTPException(status_code=409, detail="Recipient group could not be saved.")
        group = result[0] if isinstance(result, list) else result
        return RecipientGroupRead.model_validate(
            {**group, "recipient_ids": [str(recipient_id) for recipient_id in payload.recipient_ids]}
        )

    def delete_group(self, tenant_id: str, group_id: str, actor: UserProfileResponse) -> None:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        try:
            result = (
                self.database.table("spend_recipient_groups")
                .delete()
                .eq("tenant_id", tenant_id)
                .eq("id", group_id)
                .select("id")
                .execute()
            )
        except APIError as exc:
            logger.exception("Could not delete saved recipient group")
            if exc.code == "23503":
                raise HTTPException(
                    status_code=409,
                    detail="This group has been imported into an occasion and cannot be deleted.",
                ) from exc
            raise HTTPException(status_code=409, detail="Recipient group could not be deleted.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient group not found.")

    def import_group(
        self,
        tenant_id: str,
        occasion_id: str,
        payload: OccasionGroupImport,
        actor: UserProfileResponse,
    ) -> OccasionGroupAllocationRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        self._require_visible_occasion(tenant_id, occasion_id)
        result = self._rpc(
            "import_spend_group_for_occasion",
            {
                "p_tenant_id": tenant_id,
                "p_occasion_id": occasion_id,
                "p_group_id": str(payload.recipient_group_id),
                "p_budget_mode": payload.budget_mode.value,
                "p_budget_credits": payload.budget_credits,
                "p_actor_id": actor.id,
            },
        )
        row = result[0] if isinstance(result, list) else result
        return OccasionGroupAllocationRead.model_validate(
            {
                **row,
                "group_name": row.get("group_name_snapshot"),
                "allocated_credits": 0,
                "spent_credits": 0,
                "reserved_credits": 0,
                "members": [],
            }
        )

    def update_group_allocation(
        self,
        tenant_id: str,
        occasion_id: str,
        allocation_id: str,
        payload: OccasionGroupBudgetUpdate,
        actor: UserProfileResponse,
    ) -> OccasionGroupAllocationRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        self._require_visible_occasion(tenant_id, occasion_id)
        result = self._rpc(
            "update_occasion_group_budget",
            {
                "p_tenant_id": tenant_id,
                "p_occasion_id": occasion_id,
                "p_allocation_id": allocation_id,
                "p_budget_mode": payload.budget_mode.value,
                "p_budget_credits": payload.budget_credits,
            },
        )
        row = result[0] if isinstance(result, list) else result
        return OccasionGroupAllocationRead.model_validate(
            {
                **row,
                "group_name": row.get("group_name_snapshot"),
                "allocated_credits": 0,
                "spent_credits": 0,
                "reserved_credits": 0,
                "members": [],
            }
        )

    def set_occasion_recipient_budget(
        self,
        tenant_id: str,
        occasion_id: str,
        recipient_id: str,
        payload: RecipientOccasionBudgetUpdate,
        actor: UserProfileResponse,
    ) -> dict[str, Any]:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        self._require_visible_occasion(tenant_id, occasion_id)
        result = self._rpc(
            "set_occasion_recipient_budget",
            {
                "p_tenant_id": tenant_id,
                "p_occasion_id": occasion_id,
                "p_recipient_id": recipient_id,
                "p_budget_credits": payload.budget_credits,
            },
        )
        return result[0] if isinstance(result, list) else result

    def set_event_budget(
        self,
        tenant_id: str,
        event_id: str,
        payload: EventBudgetUpdate,
        actor: UserProfileResponse,
    ) -> dict[str, Any]:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        event = self._require_event(tenant_id, event_id)
        result = self._rpc(
            "set_event_spend_budget",
            {
                "p_tenant_id": tenant_id,
                "p_event_id": event_id,
                "p_recipient_id": event["recipient_id"],
                "p_budget_credits": payload.budget_credits,
                "p_actor_id": actor.id,
            },
        )
        return result[0] if isinstance(result, list) else result

    def summary(self, tenant_id: str, actor: UserProfileResponse) -> SpendSummary:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        account_result = (
            self.database.table("credit_accounts")
            .select("available_credits")
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )
        available = account_result.data[0]["available_credits"] if account_result.data else 0

        groups = (
            self.database.table("occasion_budget_groups")
            .select("*")
            .eq("tenant_id", tenant_id)
            .execute()
            .data
            or []
        )
        members = (
            self.database.table("occasion_budget_members")
            .select("*")
            .eq("tenant_id", tenant_id)
            .execute()
            .data
            or []
        )
        events = (
            self.database.table("event_spend_budgets")
            .select("*")
            .eq("tenant_id", tenant_id)
            .execute()
            .data
            or []
        )
        occasion_ids = list(
            {row["occasion_id"] for row in groups}
            | {row["occasion_id"] for row in members}
        )
        recipient_ids = list(
            {row["recipient_id"] for row in members}
            | {row["recipient_id"] for row in events}
        )
        event_ids = [row["event_id"] for row in events]
        occasion_rows = self._lookup("occasions", occasion_ids, "id,occasion_name")
        recipient_rows = self._lookup("recipients", recipient_ids, "id,name")
        event_rows = self._lookup("events", event_ids, "id,event_name,event_date")
        occasion_names = {row["id"]: row["occasion_name"] for row in occasion_rows}
        recipient_names = {row["id"]: row.get("name") for row in recipient_rows}
        event_data = {row["id"]: row for row in event_rows}
        members_by_group: dict[str, list[dict[str, Any]]] = {}
        standalone_by_occasion: dict[str, list[dict[str, Any]]] = {}
        for member in members:
            group_id = member.get("group_allocation_id")
            if group_id:
                members_by_group.setdefault(group_id, []).append(member)
            else:
                standalone_by_occasion.setdefault(member["occasion_id"], []).append(member)

        groups_by_occasion: dict[str, list[OccasionGroupAllocationRead]] = {}
        group_rows: dict[str, Any] = {}
        for group in groups:
            group_rows[group["id"]] = group
            group_members = members_by_group.get(group["id"], [])
            spent = sum(row["spent_credits"] for row in group_members)
            if group["budget_mode"] == "PER_RECIPIENT":
                member_caps = [
                    row["individual_budget_credits"]
                    if row["individual_budget_credits"] is not None
                    else group["budget_credits"]
                    for row in group_members
                ]
                allocated = sum(member_caps)
            else:
                member_caps = [row["individual_budget_credits"] for row in group_members]
                allocated = group["budget_credits"]
            member_reads = []
            for row, member_cap in zip(group_members, member_caps, strict=True):
                member_spent = row["spent_credits"]
                member_reads.append(
                    SpendRecipientAllocation(
                        recipient_id=row["recipient_id"],
                        recipient_name=recipient_names.get(row["recipient_id"]),
                        budget_credits=member_cap,
                        spent_credits=member_spent,
                        reserved_credits=(
                            max(member_cap - member_spent, 0)
                            if group["budget_mode"] == "PER_RECIPIENT" and member_cap is not None
                            else 0
                        ),
                        budget_source="GROUP",
                    )
                )
            allocation = OccasionGroupAllocationRead(
                id=group["id"],
                source_group_id=group["source_group_id"],
                group_name=group["group_name_snapshot"],
                budget_mode=group["budget_mode"],
                budget_credits=group["budget_credits"],
                allocated_credits=allocated,
                spent_credits=spent,
                reserved_credits=max(allocated - spent, 0),
                members=member_reads,
            )
            groups_by_occasion.setdefault(group["occasion_id"], []).append(allocation)

        occasion_summaries: list[OccasionSpendSummary] = []
        for occasion_id in occasion_ids:
            occasion_groups = groups_by_occasion.get(occasion_id, [])
            individual_rows = standalone_by_occasion.get(occasion_id, [])
            recipient_reads = [
                SpendRecipientAllocation(
                    recipient_id=row["recipient_id"],
                    recipient_name=recipient_names.get(row["recipient_id"]),
                    budget_credits=row["individual_budget_credits"],
                    spent_credits=row["spent_credits"],
                    reserved_credits=max(row["individual_budget_credits"] - row["spent_credits"], 0),
                    budget_source="INDIVIDUAL",
                )
                for row in individual_rows
            ]
            allocated = sum(group.allocated_credits for group in occasion_groups) + sum(
                item.budget_credits or 0 for item in recipient_reads
            )
            spent = sum(group.spent_credits for group in occasion_groups) + sum(
                item.spent_credits for item in recipient_reads
            )
            reserved = sum(group.reserved_credits for group in occasion_groups) + sum(
                item.reserved_credits for item in recipient_reads
            )
            occasion_summaries.append(
                OccasionSpendSummary(
                    occasion_id=occasion_id,
                    occasion_name=occasion_names.get(occasion_id, ""),
                    tenant_id=tenant_id,
                    groups=occasion_groups,
                    recipients=recipient_reads,
                    allocated_credits=allocated,
                    spent_credits=spent,
                    reserved_credits=reserved,
                )
            )

        event_summaries = [
            EventSpendSummary(
                event_id=row["event_id"],
                event_name=event_data.get(row["event_id"], {}).get("event_name", ""),
                event_date=event_data[row["event_id"]]["event_date"],
                tenant_id=tenant_id,
                recipient_id=row["recipient_id"],
                recipient_name=recipient_names.get(row["recipient_id"]),
                budget_credits=row["budget_credits"],
                spent_credits=row["spent_credits"],
                reserved_credits=max(row["budget_credits"] - row["spent_credits"], 0),
            )
            for row in events
        ]
        reserved = sum(item.reserved_credits for item in occasion_summaries) + sum(
            item.reserved_credits for item in event_summaries
        )
        spent = sum(item.spent_credits for item in occasion_summaries) + sum(
            item.spent_credits for item in event_summaries
        )
        return SpendSummary(
            tenant_id=tenant_id,
            available_credits=available,
            reserved_credits=reserved,
            unallocated_credits=max(available - reserved, 0),
            total_allocated_credits=reserved + spent,
            total_spent_credits=spent,
            occasions=occasion_summaries,
            events=event_summaries,
        )

    def occasion_summary(
        self, tenant_id: str, occasion_id: str, actor: UserProfileResponse,
    ) -> OccasionSpendSummary:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        self._require_visible_occasion(tenant_id, occasion_id)
        summary = self.summary(tenant_id, actor)
        existing = next((item for item in summary.occasions if item.occasion_id == occasion_id), None)
        if existing:
            return existing
        occasion_rows = self._lookup("occasions", [occasion_id], "id,occasion_name")
        return OccasionSpendSummary(
            occasion_id=occasion_id,
            occasion_name=occasion_rows[0]["occasion_name"] if occasion_rows else "",
            tenant_id=tenant_id,
            groups=[],
            recipients=[],
            allocated_credits=0,
            spent_credits=0,
            reserved_credits=0,
        )

    def event_summary(
        self, tenant_id: str, event_id: str, actor: UserProfileResponse,
    ) -> EventSpendSummary:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        summary = self.summary(tenant_id, actor)
        existing = next((item for item in summary.events if item.event_id == event_id), None)
        if existing:
            return existing
        rows = (
            self.database.table("events")
            .select("id,event_name,event_date,recipient_id")
            .eq("tenant_id", tenant_id)
            .eq("id", event_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        event = rows[0]
        recipient_rows = self._lookup("recipients", [event["recipient_id"]], "id,name")
        return EventSpendSummary(
            event_id=event_id,
            event_name=event["event_name"],
            event_date=event["event_date"],
            tenant_id=tenant_id,
            recipient_id=event["recipient_id"],
            recipient_name=recipient_rows[0].get("name") if recipient_rows else None,
            budget_credits=0,
            spent_credits=0,
            reserved_credits=0,
        )

    def read_settings(self, tenant_id: str, actor: UserProfileResponse) -> GiftSpendSettingsRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        result = (
            self.database.table("gift_spend_settings")
            .select("tenant_id,reminder_days")
            .eq("tenant_id", tenant_id)
            .limit(1)
            .execute()
        )
        row = result.data[0] if result.data else {"tenant_id": tenant_id, "reminder_days": [30, 7, 1]}
        return GiftSpendSettingsRead.model_validate(row)

    def update_settings(
        self,
        tenant_id: str,
        payload: GiftSpendSettingsUpdate,
        actor: UserProfileResponse,
    ) -> GiftSpendSettingsRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        result = (
            self.database.table("gift_spend_settings")
            .upsert({"tenant_id": tenant_id, "reminder_days": payload.reminder_days, "updated_by_user_id": actor.id})
            .select("tenant_id,reminder_days")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=409, detail="Reminder settings could not be saved.")
        return GiftSpendSettingsRead.model_validate(result.data[0])

    def list_notifications(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        unread_only: bool,
    ) -> GiftSpendNotificationPage:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        query = (
            self.database.table("gift_spend_notifications")
            .select("*", count="exact")
            .eq("tenant_id", tenant_id)
            .eq("user_id", actor.id)
        )
        if unread_only:
            query = query.is_("read_at", "null")
        offset = (page - 1) * limit
        result = (
            query.order("created_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        total = result.count or 0
        return GiftSpendNotificationPage(
            items=[GiftSpendNotificationRead.model_validate(row) for row in result.data or []],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def mark_notification_read(
        self,
        tenant_id: str,
        notification_id: str,
        actor: UserProfileResponse,
    ) -> GiftSpendNotificationRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        result = (
            self.database.table("gift_spend_notifications")
            .update({"read_at": datetime.now(timezone.utc).isoformat()})
            .eq("tenant_id", tenant_id)
            .eq("user_id", actor.id)
            .eq("id", notification_id)
            .select("*")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Notification not found.")
        return GiftSpendNotificationRead.model_validate(result.data[0])

    def _require_visible_occasion(self, tenant_id: str, occasion_id: str) -> None:
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

    def _require_event(self, tenant_id: str, event_id: str) -> dict[str, Any]:
        result = (
            self.database.table("events")
            .select("id,recipient_id")
            .eq("tenant_id", tenant_id)
            .eq("id", event_id)
            .eq("is_active", True)
            .not_.is_("recipient_id", "null")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Active recipient event not found in this tenant.")
        return result.data[0]

    def _require_tenant(
        self, tenant_id: str, actor: UserProfileResponse, permission: Permission,
    ) -> None:
        require_permission(actor, permission)
        tenant_service.require_access(tenant_id, actor)

    def _lookup(self, table: str, ids: list[str], columns: str) -> list[dict[str, Any]]:
        if not ids:
            return []
        return self.database.table(table).select(columns).in_("id", ids).execute().data or []

    def _rpc(self, function: str, params: dict[str, Any]) -> Any:
        try:
            result = self.database.rpc(function, params).execute()
            return result.data
        except APIError as exc:
            logger.exception("Gift spend database operation failed: %s", function)
            message = (exc.message or "").lower()
            if "gift_spend_limit_exceeded" in message:
                raise HTTPException(status_code=409, detail="Budget reservations exceed available credits.") from exc
            if "gift_spend_budget_missing" in message:
                raise HTTPException(status_code=409, detail="A budget must be allocated before approving this gift.") from exc
            if "gift_spend_budget_exceeded" in message:
                raise HTTPException(status_code=409, detail="The requested credits exceed the remaining budget.") from exc
            if "recipient_not_found" in message or "recipient_not_in_tenant" in message:
                raise HTTPException(status_code=404, detail="One or more recipients were not found in this tenant.") from exc
            if "group_not_found" in message or "spend_group_not_found" in message:
                raise HTTPException(status_code=404, detail="Recipient group not found in this tenant.") from exc
            if "occasion_not_found" in message or "occasion_not_available" in message:
                raise HTTPException(status_code=404, detail="Active occasion not found in this tenant.") from exc
            if "event_not_found" in message or "event_recipient_mismatch" in message:
                raise HTTPException(status_code=404, detail="Active recipient event not found in this tenant.") from exc
            if "recipient_already_grouped" in message or "occasion_group_membership_conflict" in message:
                raise HTTPException(status_code=409, detail="A recipient can belong to only one group per occasion.") from exc
            if "group_already_imported" in message:
                raise HTTPException(status_code=409, detail="This group has already been imported into the occasion.") from exc
            if "budget_below_spend" in message:
                raise HTTPException(status_code=409, detail="The budget cannot be reduced below credits already spent.") from exc
            if "insufficient_credits" in message or "credit_account_not_found" in message:
                raise HTTPException(status_code=409, detail="The tenant does not have enough available credits.") from exc
            if "spend_reservation_exceeds_balance" in message or "credits_reserved_for_gift_spend" in message:
                raise HTTPException(status_code=409, detail="The change would use credits already reserved by a spend budget.") from exc
            if exc.code == "PGRST205":
                raise HTTPException(status_code=503, detail="Gift Spend migration is missing or the schema cache needs reloading.") from exc
            raise HTTPException(status_code=409, detail="Gift spend operation could not be completed.") from exc


gift_spend_service = GiftSpendService()
