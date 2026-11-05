"""Gift Spend Management APIs."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
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
    SpendSummary,
)
from src.modules.gift_spend.service import gift_spend_service

router = APIRouter(prefix="/tenants/{tenant_id}/gift-spend", tags=["Gift Spend Management"])


@router.get("/groups", response_model=ApiResponse[list[RecipientGroupRead]])
def list_recipient_groups(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[list[RecipientGroupRead]]:
    return ApiResponse(
        data=gift_spend_service.list_groups(str(tenant_id), actor),
        message="Recipient groups retrieved successfully.",
    )


@router.post("/groups", response_model=ApiResponse[RecipientGroupRead], status_code=status.HTTP_201_CREATED)
def create_recipient_group(
    tenant_id: UUID,
    payload: Annotated[RecipientGroupCreate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[RecipientGroupRead]:
    return ApiResponse(
        data=gift_spend_service.save_group(str(tenant_id), payload, actor),
        message="Recipient group created successfully.",
    )


@router.put("/groups/{group_id}", response_model=ApiResponse[RecipientGroupRead])
def update_recipient_group(
    tenant_id: UUID,
    group_id: UUID,
    payload: Annotated[RecipientGroupUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[RecipientGroupRead]:
    return ApiResponse(
        data=gift_spend_service.save_group(
            str(tenant_id), payload, actor, group_id=str(group_id),
        ),
        message="Recipient group updated successfully.",
    )


@router.get("/default-budgets", response_model=ApiResponse[list[DefaultBudgetRead]])
def list_default_budgets(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[list[DefaultBudgetRead]]:
    return ApiResponse(
        data=gift_spend_service.list_default_budgets(str(tenant_id), actor),
        message="Default budgets retrieved successfully.",
    )


@router.put("/default-budgets", response_model=ApiResponse[DefaultBudgetRead])
def set_default_budget(
    tenant_id: UUID,
    payload: Annotated[DefaultBudgetSet, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[DefaultBudgetRead]:
    return ApiResponse(
        data=gift_spend_service.set_default_budget(str(tenant_id), payload, actor),
        message="Budget saved successfully.",
    )


@router.delete("/default-budgets", response_model=ApiResponse[dict])
def delete_default_budget(
    tenant_id: UUID,
    target_type: Annotated[DefaultBudgetTarget, Query(alias="targetType")],
    target_id: Annotated[UUID, Query(alias="targetId")],
    actor: CurrentUserDep,
    group_id: Annotated[UUID | None, Query(alias="groupId")] = None,
) -> ApiResponse[dict]:
    gift_spend_service.delete_default_budget(
        str(tenant_id), target_type, str(target_id), str(group_id) if group_id else None, actor,
    )
    return ApiResponse(data={}, message="Budget removed successfully.")


@router.delete("/groups/{group_id}", response_model=ApiResponse[dict])
def delete_recipient_group(tenant_id: UUID, group_id: UUID, actor: CurrentUserDep) -> ApiResponse[dict]:
    gift_spend_service.delete_group(str(tenant_id), str(group_id), actor)
    return ApiResponse(data={}, message="Recipient group deleted successfully.")


@router.post(
    "/occasions/{occasion_id}/groups/import",
    response_model=ApiResponse[OccasionGroupAllocationRead],
    status_code=status.HTTP_201_CREATED,
)
def import_group_to_occasion(
    tenant_id: UUID,
    occasion_id: UUID,
    payload: Annotated[OccasionGroupImport, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[OccasionGroupAllocationRead]:
    created = gift_spend_service.import_group(str(tenant_id), str(occasion_id), payload, actor)
    summary = gift_spend_service.occasion_summary(str(tenant_id), str(occasion_id), actor)
    allocation = next(item for item in summary.groups if item.id == created.id)
    return ApiResponse(
        data=allocation,
        message="Recipient group imported into the occasion budget.",
    )


@router.post(
    "/occasions/{occasion_id}/groups",
    response_model=ApiResponse[OccasionGroupAllocationRead],
    status_code=status.HTTP_201_CREATED,
)
def create_occasion_group(
    tenant_id: UUID,
    occasion_id: UUID,
    payload: Annotated[OccasionGroupCreate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[OccasionGroupAllocationRead]:
    created = gift_spend_service.create_occasion_group(str(tenant_id), str(occasion_id), payload, actor)
    summary = gift_spend_service.occasion_summary(str(tenant_id), str(occasion_id), actor)
    allocation = next(item for item in summary.groups if item.id == created.id)
    return ApiResponse(data=allocation, message="Group created.")


@router.put(
    "/occasions/{occasion_id}/groups/{allocation_id}",
    response_model=ApiResponse[OccasionGroupAllocationRead],
)
def update_occasion_group(
    tenant_id: UUID,
    occasion_id: UUID,
    allocation_id: UUID,
    payload: Annotated[OccasionGroupUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[OccasionGroupAllocationRead]:
    gift_spend_service.update_occasion_group(
        str(tenant_id), str(occasion_id), str(allocation_id), payload, actor,
    )
    summary = gift_spend_service.occasion_summary(str(tenant_id), str(occasion_id), actor)
    allocation = next(item for item in summary.groups if item.id == str(allocation_id))
    return ApiResponse(data=allocation, message="Group updated.")


@router.delete("/occasions/{occasion_id}/groups/{allocation_id}", response_model=ApiResponse[dict])
def delete_occasion_group(
    tenant_id: UUID, occasion_id: UUID, allocation_id: UUID, actor: CurrentUserDep,
) -> ApiResponse[dict]:
    gift_spend_service.delete_occasion_group(str(tenant_id), str(occasion_id), str(allocation_id), actor)
    return ApiResponse(data={}, message="Group removed from the occasion.")


@router.put(
    "/occasions/{occasion_id}/recipients/{recipient_id}/budget",
    response_model=ApiResponse[dict],
)
def set_occasion_recipient_budget(
    tenant_id: UUID,
    occasion_id: UUID,
    recipient_id: UUID,
    payload: Annotated[OccasionRecipientBudgetUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[dict]:
    data = gift_spend_service.set_occasion_recipient_budget(
        str(tenant_id), str(occasion_id), str(recipient_id), payload, actor,
    )
    return ApiResponse(data=data, message="Recipient occasion budget saved.")


@router.delete(
    "/occasions/{occasion_id}/recipients/{recipient_id}/budget",
    response_model=ApiResponse[dict],
)
def remove_occasion_recipient(
    tenant_id: UUID, occasion_id: UUID, recipient_id: UUID, actor: CurrentUserDep,
) -> ApiResponse[dict]:
    gift_spend_service.remove_occasion_recipient(str(tenant_id), str(occasion_id), str(recipient_id), actor)
    return ApiResponse(data={}, message="Person removed from the occasion.")


@router.get("/occasions/{occasion_id}/summary", response_model=ApiResponse[OccasionSpendSummary])
def occasion_spend_summary(
    tenant_id: UUID, occasion_id: UUID, actor: CurrentUserDep,
) -> ApiResponse[OccasionSpendSummary]:
    return ApiResponse(
        data=gift_spend_service.occasion_summary(str(tenant_id), str(occasion_id), actor),
        message="Occasion spend summary retrieved.",
    )


@router.put("/events/{event_id}/budget", response_model=ApiResponse[dict])
def set_event_budget(
    tenant_id: UUID,
    event_id: UUID,
    payload: Annotated[EventBudgetUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[dict]:
    data = gift_spend_service.set_event_budget(str(tenant_id), str(event_id), payload, actor)
    return ApiResponse(data=data, message="Event budget saved.")


@router.get("/events/{event_id}/summary", response_model=ApiResponse[EventSpendSummary])
def event_spend_summary(
    tenant_id: UUID, event_id: UUID, actor: CurrentUserDep,
) -> ApiResponse[EventSpendSummary]:
    return ApiResponse(
        data=gift_spend_service.event_summary(str(tenant_id), str(event_id), actor),
        message="Event spend summary retrieved.",
    )


@router.get("/balance", response_model=ApiResponse[dict])
def gift_spend_balance(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[dict]:
    """Light version of /summary: total, set-aside and unassigned credits, without loading every budget."""
    from src.modules.gift_spend.schemas import to_camel_keys

    return ApiResponse(
        data=to_camel_keys(gift_spend_service.budget_balance(str(tenant_id), actor)),
        message="Gift spend balance retrieved.",
    )


@router.get("/summary", response_model=ApiResponse[SpendSummary])
def gift_spend_summary(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[SpendSummary]:
    return ApiResponse(
        data=gift_spend_service.summary(str(tenant_id), actor),
        message="Gift spend summary retrieved.",
    )


@router.get("/settings", response_model=ApiResponse[GiftSpendSettingsRead])
def get_gift_spend_settings(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[GiftSpendSettingsRead]:
    return ApiResponse(
        data=gift_spend_service.read_settings(str(tenant_id), actor),
        message="Gift spend settings retrieved.",
    )


@router.put("/settings", response_model=ApiResponse[GiftSpendSettingsRead])
def update_gift_spend_settings(
    tenant_id: UUID,
    payload: Annotated[GiftSpendSettingsUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftSpendSettingsRead]:
    return ApiResponse(
        data=gift_spend_service.update_settings(str(tenant_id), payload, actor),
        message="Gift spend settings updated.",
    )


@router.get("/notifications", response_model=ApiResponse[GiftSpendNotificationPage])
def list_notifications(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    unread_only: Annotated[bool, Query(alias="unreadOnly")] = False,
) -> ApiResponse[GiftSpendNotificationPage]:
    return ApiResponse(
        data=gift_spend_service.list_notifications(
            str(tenant_id), actor, page=page, limit=limit, unread_only=unread_only,
        ),
        message="Notifications retrieved successfully.",
    )


@router.patch("/notifications/{notification_id}/read", response_model=ApiResponse[GiftSpendNotificationRead])
def mark_notification_read(
    tenant_id: UUID, notification_id: UUID, actor: CurrentUserDep,
) -> ApiResponse[GiftSpendNotificationRead]:
    return ApiResponse(
        data=gift_spend_service.mark_notification_read(
            str(tenant_id), str(notification_id), actor,
        ),
        message="Notification marked as read.",
    )
