"""Tenant management routes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.authorization import SuperAdminDep
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.models import TenantStatus
from src.modules.tenants.schemas import TenantCreate, TenantList, TenantRead, TenantUpdate
from src.modules.tenants.service import tenant_service


router = APIRouter(prefix="/tenants", tags=["Tenants"])


@router.post("", response_model=ApiResponse[TenantRead], status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: Annotated[TenantCreate, Body()],
    actor: SuperAdminDep,
) -> ApiResponse[TenantRead]:
    """Create a tenant before inviting its users."""
    return ApiResponse(data=tenant_service.create(payload, actor), message="Tenant created successfully.")


@router.get("", response_model=TenantList)
def list_tenants(
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    search: Annotated[str | None, Query(max_length=100, pattern=r"^[A-Za-z0-9 .&'-]+$")] = None,
) -> TenantList:
    """List only tenants available to the authenticated role and assignment scope."""
    return tenant_service.list(actor, page=page, limit=limit, search=search)


@router.get("/{tenant_id}", response_model=TenantRead)
def get_tenant(tenant_id: UUID, actor: CurrentUserDep) -> TenantRead:
    return tenant_service.get(str(tenant_id), actor)


@router.patch("/{tenant_id}", response_model=ApiResponse[TenantRead])
def update_tenant(
    tenant_id: UUID,
    payload: Annotated[TenantUpdate, Body()],
    actor: SuperAdminDep,
) -> ApiResponse[TenantRead]:
    return ApiResponse(
        data=tenant_service.update(str(tenant_id), payload, actor),
        message="Tenant updated successfully.",
    )


@router.post("/{tenant_id}/activate", response_model=ApiResponse[TenantRead])
def activate_tenant(tenant_id: UUID, actor: SuperAdminDep) -> ApiResponse[TenantRead]:
    return ApiResponse(
        data=tenant_service.set_status(str(tenant_id), TenantStatus.ACTIVE, actor),
        message="Tenant activated successfully.",
    )


@router.post("/{tenant_id}/deactivate", response_model=ApiResponse[TenantRead])
def deactivate_tenant(tenant_id: UUID, actor: SuperAdminDep) -> ApiResponse[TenantRead]:
    return ApiResponse(
        data=tenant_service.set_status(str(tenant_id), TenantStatus.DEACTIVATED, actor),
        message="Tenant deactivated successfully.",
    )
