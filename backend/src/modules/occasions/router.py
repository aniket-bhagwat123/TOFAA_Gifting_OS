"""Tenant-scoped occasion endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.authorization import SuperAdminDep
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.occasions.schemas import OccasionCreate, OccasionList, OccasionRead, OccasionUpdate
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
