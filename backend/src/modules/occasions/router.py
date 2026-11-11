"""Tenant-scoped occasion endpoints."""

from typing import Annotated
from uuid import UUID

from datetime import date

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.authorization import SuperAdminDep
from src.modules.auth.dependencies import CurrentUserDep
from src.core.config import settings
from src.modules.occasions.schemas import (
    OccasionCreate,
    OccasionList,
    OccasionRead,
    OccasionUpdate,
    UpcomingOccasion,
)
from src.modules.occasions.overview import OccasionOverview, occasion_overview_service
from src.modules.occasions.service import occasion_service

router = APIRouter(tags=["Occasions"])


@router.get("/occasions", response_model=OccasionList)
def list_all_occasions(
    actor: SuperAdminDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    active_only: Annotated[bool, Query(alias="activeOnly")] = False,
    tenant_id: Annotated[UUID | None, Query(alias="tenantId")] = None,
) -> OccasionList:
    return occasion_service.list_all_occasions(
        actor, page=page, limit=limit, active_only=active_only,
        tenant_id=str(tenant_id) if tenant_id else None,
    )


@router.post(
    "/occasions", response_model=ApiResponse[OccasionRead], status_code=status.HTTP_201_CREATED,
)
def create_global_occasion(
    payload: Annotated[OccasionCreate, Body()], actor: SuperAdminDep,
) -> ApiResponse[OccasionRead]:
    return ApiResponse(
        data=occasion_service.create_global_occasion(payload, actor),
        message="Global occasion created successfully.",
    )


@router.get("/occasions/{occasion_id}", response_model=OccasionRead)
def get_any_occasion(occasion_id: UUID, actor: SuperAdminDep) -> OccasionRead:
    return occasion_service.get_any_occasion(str(occasion_id), actor)


@router.patch("/occasions/{occasion_id}", response_model=ApiResponse[OccasionRead])
def update_any_occasion(
    occasion_id: UUID, payload: Annotated[OccasionUpdate, Body()], actor: SuperAdminDep,
) -> ApiResponse[OccasionRead]:
    return ApiResponse(
        data=occasion_service.update_any_occasion(str(occasion_id), payload, actor),
        message="Occasion updated successfully.",
    )


@router.delete("/occasions/{occasion_id}", response_model=ApiResponse[dict])
def delete_any_occasion(occasion_id: UUID, actor: SuperAdminDep) -> ApiResponse[dict]:
    occasion_service.delete_any_occasion(str(occasion_id), actor)
    return ApiResponse(data={}, message="Occasion deleted successfully.")


@router.get("/tenants/{tenant_id}/occasions", response_model=OccasionList)
def list_occasions(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    active_only: Annotated[bool, Query(alias="activeOnly")] = False,
) -> OccasionList:
    return occasion_service.list_occasions(
        str(tenant_id), actor, page=page, limit=limit, active_only=active_only,
    )


@router.post(
    "/tenants/{tenant_id}/occasions",
    response_model=ApiResponse[OccasionRead],
    status_code=status.HTTP_201_CREATED,
)
def create_occasion(
    tenant_id: UUID,
    payload: Annotated[OccasionCreate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[OccasionRead]:
    return ApiResponse(
        data=occasion_service.create_occasion(str(tenant_id), payload, actor),
        message="Occasion created successfully.",
    )


@router.get("/tenants/{tenant_id}/occasions/upcoming", response_model=ApiResponse[list[UpcomingOccasion]])
def upcoming_occasions(
    tenant_id: UUID,
    actor: CurrentUserDep,
    days: Annotated[int | None, Query(ge=1, le=120)] = None,
) -> ApiResponse[list[UpcomingOccasion]]:
    """Occasions in the next ``days`` days (default: the planning window, 20 days), nearest first."""
    return ApiResponse(
        data=occasion_service.upcoming(str(tenant_id), actor, days=days or settings.UPCOMING_OCCASION_DAYS),
        message="Upcoming occasions retrieved successfully.",
    )


@router.get("/tenants/{tenant_id}/occasions/overview", response_model=OccasionOverview)
def occasions_overview(
    tenant_id: UUID,
    actor: CurrentUserDep,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
    days: Annotated[int | None, Query(ge=1, le=366)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    tab: Annotated[str, Query(description="ALL, NOT_PLANNED, BUDGET_ALLOCATED, REQUEST_SUBMITTED, IN_PROGRESS or DELIVERED")] = "ALL",
    sort: Annotated[str, Query(description="soonest, priority or name")] = "soonest",
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=500)] = 10,
) -> OccasionOverview:
    """Recipient dates and company occasions in one list, with planning status, budget and linked requests."""
    return occasion_overview_service.overview(
        str(tenant_id), actor, date_from=date_from, date_to=date_to, days=days, q=q, tab=tab, sort=sort, page=page, limit=limit,
    )


@router.get("/tenants/{tenant_id}/occasions/{occasion_id}", response_model=OccasionRead)
def get_occasion(tenant_id: UUID, occasion_id: UUID, actor: CurrentUserDep) -> OccasionRead:
    return occasion_service.get_occasion(str(tenant_id), str(occasion_id), actor)


@router.patch("/tenants/{tenant_id}/occasions/{occasion_id}", response_model=ApiResponse[OccasionRead])
def update_occasion(
    tenant_id: UUID,
    occasion_id: UUID,
    payload: Annotated[OccasionUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[OccasionRead]:
    return ApiResponse(
        data=occasion_service.update_occasion(str(tenant_id), str(occasion_id), payload, actor),
        message="Occasion updated successfully.",
    )


@router.delete(
    "/tenants/{tenant_id}/occasions/{occasion_id}",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
)
def delete_occasion(tenant_id: UUID, occasion_id: UUID, actor: CurrentUserDep) -> ApiResponse[dict]:
    occasion_service.delete_occasion(str(tenant_id), str(occasion_id), actor)
    return ApiResponse(data={}, message="Occasion deleted successfully.")
