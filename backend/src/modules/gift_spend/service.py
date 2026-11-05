"""Tenant-scoped budgets, credit reservations, and reminder inbox."""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from src.core.concurrency import run_parallel
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.gift_spend.schemas import (
    DefaultBudgetRead,
    DefaultBudgetSet,
    DefaultBudgetTarget,
    EventBudgetUpdate,
    EventSpendSummary,
    GiftSpendNotificationPage,
    GiftSpendNotificationRead,
    GiftSpendSettingsRead,
    GiftSpendSettingsUpdate,
    OccasionGroupAllocationRead,
    OccasionGroupCreate,
    OccasionGroupUpdate,
    OccasionGroupImport,
    OccasionSpendSummary,
    RecipientGroupCreate,
    RecipientGroupRead,
    RecipientGroupUpdate,
    OccasionRecipientBudgetUpdate,
    SpendRecipientAllocation,
    SpendSummary,
)
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)

# Stored in group_id for budgets that belong to a whole group rather than one person in a group.
NO_GROUP = "00000000-0000-0000-0000-000000000000"


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

    @staticmethod
    def _default_budget_error(exc: APIError) -> HTTPException:
        logger.exception("Default budget database operation failed")
        if exc.code in {"PGRST205", "42P01"}:  # the table does not exist yet: the migration has not been applied
            return HTTPException(status_code=503, detail="Budgets aren't available yet. The database update has not been applied.")
        return HTTPException(status_code=500, detail="The budget could not be saved. Please try again.")

    def list_default_budgets(self, tenant_id: str, actor: UserProfileResponse) -> list[DefaultBudgetRead]:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        try:
            rows = (
                self.database.table("spend_default_budgets")
                .select("target_type,target_id,group_id,budget_mode,budget_credits")
                .eq("tenant_id", tenant_id)
                .execute()
                .data
                or []
            )
        except APIError as exc:
            raise self._default_budget_error(exc) from exc
        return [DefaultBudgetRead.model_validate(row) for row in rows]

    def set_default_budget(
        self, tenant_id: str, payload: DefaultBudgetSet, actor: UserProfileResponse,
    ) -> DefaultBudgetRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        target_id = str(payload.target_id)
        table = "spend_recipient_groups" if payload.target_type == DefaultBudgetTarget.GROUP else "recipients"
        try:
            query = self.database.table(table).select("id").eq("tenant_id", tenant_id).eq("id", target_id)
            if payload.target_type == DefaultBudgetTarget.RECIPIENT:
                query = query.is_("deleted_at", "null")
            if not query.execute().data:
                raise HTTPException(status_code=404, detail="That group or recipient was not found.")
            if payload.target_type == DefaultBudgetTarget.RECIPIENT and not (
                self.database.table("spend_recipient_group_members")
                .select("recipient_id")
                .eq("tenant_id", tenant_id)
                .eq("group_id", str(payload.group_id))
                .eq("recipient_id", target_id)
                .execute()
                .data
            ):
                raise HTTPException(status_code=404, detail="That recipient is not in this group.")
            row = (
                self.database.table("spend_default_budgets")
                .upsert(
                    {
                        "tenant_id": tenant_id,
                        "target_type": payload.target_type.value,
                        "target_id": target_id,
                        "group_id": str(payload.group_id) if payload.target_type == DefaultBudgetTarget.RECIPIENT else NO_GROUP,
                        # A single person has no pool to share, so their budget is always per recipient.
                        "budget_mode": "PER_RECIPIENT"
                        if payload.target_type == DefaultBudgetTarget.RECIPIENT
                        else payload.budget_mode.value,
                        "budget_credits": payload.budget_credits,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    },
                    on_conflict="tenant_id,target_type,target_id,group_id",
                )
                .execute()
                .data
            )
        except APIError as exc:
            raise self._default_budget_error(exc) from exc
        return DefaultBudgetRead.model_validate(row[0])

    def delete_default_budget(
        self, tenant_id: str, target_type: DefaultBudgetTarget, target_id: str, group_id: str | None, actor: UserProfileResponse,
    ) -> None:
        """Remove a saved budget so the group or person goes back to the automatic split."""
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        try:
            (
                self.database.table("spend_default_budgets")
                .delete()
                .eq("tenant_id", tenant_id)
                .eq("target_type", target_type.value)
                .eq("target_id", target_id)
                .eq("group_id", group_id or NO_GROUP)
                .execute()
            )
        except APIError as exc:
            raise self._default_budget_error(exc) from exc

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

    def create_occasion_group(
        self, tenant_id: str, occasion_id: str, payload: OccasionGroupCreate, actor: UserProfileResponse,
    ) -> OccasionGroupAllocationRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        self._require_visible_occasion(tenant_id, occasion_id)
        result = self._rpc(
            "create_occasion_group",
            {
                "p_tenant_id": tenant_id,
                "p_occasion_id": occasion_id,
                "p_group_name": payload.group_name,
                "p_recipient_ids": [str(item) for item in payload.recipient_ids],
                "p_actor_id": actor.id,
            },
        )
        return self._allocation_stub(result)

    def update_occasion_group(
        self,
        tenant_id: str,
        occasion_id: str,
        allocation_id: str,
        payload: OccasionGroupUpdate,
        actor: UserProfileResponse,
    ) -> OccasionGroupAllocationRead:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        self._require_visible_occasion(tenant_id, occasion_id)
        fields = payload.model_fields_set
        result = self._rpc(
            "update_occasion_group",
            {
                "p_tenant_id": tenant_id,
                "p_occasion_id": occasion_id,
                "p_group_id": allocation_id,
                "p_group_name": payload.group_name if "group_name" in fields else None,
                "p_recipient_ids": (
                    [str(item) for item in payload.recipient_ids or []] if "recipient_ids" in fields else None
                ),
                "p_budget_mode": payload.budget_mode.value if payload.budget_mode else None,
                "p_budget_credits": payload.budget_credits,
            },
        )
        return self._allocation_stub(result)

    def delete_occasion_group(
        self, tenant_id: str, occasion_id: str, allocation_id: str, actor: UserProfileResponse,
    ) -> None:
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        self._require_visible_occasion(tenant_id, occasion_id)
        self._rpc(
            "delete_occasion_group",
            {"p_tenant_id": tenant_id, "p_occasion_id": occasion_id, "p_group_id": allocation_id},
        )

    @staticmethod
    def _allocation_stub(result: Any) -> OccasionGroupAllocationRead:
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
        payload: OccasionRecipientBudgetUpdate,
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
                "p_group_name": payload.group_name,
            },
        )
        return result[0] if isinstance(result, list) else result

    def remove_occasion_recipient(
        self, tenant_id: str, occasion_id: str, recipient_id: str, actor: UserProfileResponse,
    ) -> None:
        """Remove a person added directly to an occasion (not via a group) if nothing was spent."""
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_MANAGE)
        self._require_visible_occasion(tenant_id, occasion_id)
        rows = (
            self.database.table("occasion_budget_members")
            .select("recipient_id,group_allocation_id,spent_credits")
            .eq("tenant_id", tenant_id)
            .eq("occasion_id", occasion_id)
            .eq("recipient_id", recipient_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not rows:
            raise HTTPException(status_code=404, detail="This person is not part of the occasion.")
        if rows[0].get("group_allocation_id"):
            raise HTTPException(status_code=409, detail="This person belongs to a group in this occasion.")
        if (rows[0].get("spent_credits") or 0) > 0:
            raise HTTPException(status_code=409, detail="This person already has gifts, so they can't be removed.")
        try:
            (
                self.database.table("occasion_budget_members")
                .delete()
                .eq("tenant_id", tenant_id)
                .eq("occasion_id", occasion_id)
                .eq("recipient_id", recipient_id)
                .execute()
            )
        except APIError as exc:
            logger.exception("Could not remove occasion recipient")
            raise HTTPException(status_code=409, detail="This person could not be removed.") from exc

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

    def budget_balance(self, tenant_id: str, actor: UserProfileResponse) -> dict[str, int]:
        """Total credits, credits set aside in budgets, and what is still free to assign: two cheap reads."""
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        account, reserved = run_parallel(
            lambda: self.database.table("credit_accounts").select("available_credits").eq("tenant_id", tenant_id).limit(1).execute(),
            lambda: self.database.rpc("gift_spend_reserved_credits", {"p_tenant_id": tenant_id}).execute(),
        )
        total = account.data[0]["available_credits"] if account.data else 0
        held = reserved.data[0] if isinstance(reserved.data, list) and reserved.data else reserved.data
        held = int(held or 0)
        return {"total_credits": total, "reserved_credits": held, "unallocated_credits": max(total - held, 0)}

    def summary(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        occasion_id: str | None = None,
        event_id: str | None = None,
    ) -> SpendSummary:
        """Spend overview. Pass ``occasion_id`` or ``event_id`` to load only that one instead of the whole tenant."""
        self._require_tenant(tenant_id, actor, Permission.GIFT_SPEND_READ)
        scoped = occasion_id is not None or event_id is not None

        def fetch(table: str, skip: bool = False, **filters: str) -> list[dict[str, Any]]:
            if skip:
                return []
            query = self.database.table(table).select("*").eq("tenant_id", tenant_id)
            for column, value in filters.items():
                query = query.eq(column, value)
            return query.execute().data or []

        by_occasion = {"occasion_id": occasion_id} if occasion_id else {}
        account_result, groups, members, events = run_parallel(
            lambda: self.database.table("credit_accounts").select("available_credits").eq("tenant_id", tenant_id).limit(1).execute(),
            lambda: fetch("occasion_budget_groups", skip=event_id is not None, **by_occasion),
            lambda: fetch("occasion_budget_members", skip=event_id is not None, **by_occasion),
            lambda: fetch("event_spend_budgets", skip=occasion_id is not None, **({"event_id": event_id} if event_id else {})),
        )
        available = account_result.data[0]["available_credits"] if account_result.data else 0
        occasion_ids = list(
            {row["occasion_id"] for row in groups}
            | {row["occasion_id"] for row in members}
        )
        recipient_ids = list(
            {row["recipient_id"] for row in members}
            | {row["recipient_id"] for row in events}
        )
        event_ids = [row["event_id"] for row in events]
        occasion_rows = self._lookup_occasions(tenant_id, occasion_ids)
        recipient_rows = self._lookup(tenant_id, "recipients", recipient_ids, "id,name")
        event_rows = self._lookup(tenant_id, "events", event_ids, "id,event_name,event_date")
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
                        budget_source="INDIVIDUAL" if row["individual_budget_credits"] is not None else "GROUP",
                        group_name=group["group_name_snapshot"],
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
                    group_name=row.get("group_name"),
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
        summary = self.summary(tenant_id, actor, occasion_id=occasion_id)
        existing = next((item for item in summary.occasions if item.occasion_id == occasion_id), None)
        if existing:
            return existing
        occasion_rows = self._lookup_occasions(tenant_id, [occasion_id])
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
        summary = self.summary(tenant_id, actor, event_id=event_id)
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
        if not rows:
            raise HTTPException(status_code=404, detail="Event not found in this tenant.")
        event = rows[0]
        recipient_rows = self._lookup(tenant_id, "recipients", [event["recipient_id"]], "id,name")
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

    def _lookup(self, tenant_id: str, table: str, ids: list[str], columns: str) -> list[dict[str, Any]]:
        if not ids:
            return []
        return (
            self.database.table(table).select(columns).eq("tenant_id", tenant_id).in_("id", ids).execute().data
            or []
        )

    def _lookup_occasions(self, tenant_id: str, ids: list[str]) -> list[dict[str, Any]]:
        """Occasions are the tenant's own or global (no tenant)."""
        if not ids:
            return []
        return (
            self.database.table("occasions")
            .select("id,occasion_name")
            .in_("id", ids)
            .or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}")
            .execute()
            .data
            or []
        )

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
            if "budget_below_spend" in message:  # also matches budget_below_spent
                raise HTTPException(status_code=409, detail="The budget cannot be reduced below credits already spent.") from exc
            if "insufficient_credits" in message or "credit_account_not_found" in message:
                raise HTTPException(status_code=409, detail="The tenant does not have enough available credits.") from exc
            if "spend_reservation_exceeds_balance" in message or "credits_reserved_for_gift_spend" in message:
                raise HTTPException(status_code=409, detail="The change would use credits already reserved by a spend budget.") from exc
            if exc.code == "PGRST205":
                raise HTTPException(status_code=503, detail="Gift Spend migration is missing or the schema cache needs reloading.") from exc
            if "invalid_group_name" in message:
                raise HTTPException(status_code=422, detail="Give the group a name.") from exc
            if "group_needs_recipients" in message:
                raise HTTPException(status_code=422, detail="Pick at least one person for the group.") from exc
            if "occasion_group_name_taken" in message:
                raise HTTPException(status_code=409, detail="This occasion already has a group with that name.") from exc
            if "member_has_spend" in message or "group_has_spend" in message:
                raise HTTPException(status_code=409, detail="People who already have gifts cannot be removed.") from exc
            if "occasion_group_not_found" in message:
                raise HTTPException(status_code=404, detail="This group is not part of the occasion.") from exc
            if "invalid_spend_budget" in message:
                raise HTTPException(status_code=422, detail="Enter a budget greater than 0.") from exc
            if "occasion_not_in_tenant" in message:
                raise HTTPException(status_code=404, detail="Active occasion not found in this tenant.") from exc
            if exc.code == "23505":
                raise HTTPException(status_code=409, detail="This group has already been added to the occasion.") from exc
            if exc.code == "23503":
                raise HTTPException(
                    status_code=409,
                    detail="A person or user referenced here no longer exists. Refresh and try again.",
                ) from exc
            raise HTTPException(
                status_code=409,
                detail=f"Gift spend operation could not be completed ({exc.code or 'unknown'}: {exc.message or 'no details'}).",
            ) from exc


gift_spend_service = GiftSpendService()
