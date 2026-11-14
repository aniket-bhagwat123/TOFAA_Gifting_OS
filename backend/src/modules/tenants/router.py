"""Tenant management routes."""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from starlette.concurrency import run_in_threadpool

from src.core import audit
from src.core.schema import ApiResponse
from src.modules.auth.authorization import SuperAdminDep
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.auth.rbac import Role
from src.modules.tenants.models import TenantStatus
from src.modules.tenants.schemas import TenantCreate, TenantList, TenantRead, TenantUpdate, TenantUserUpsert
from src.modules.tenants.service import tenant_service
from src.modules.users.schemas import UserInviteCreate, UserUpdate
from src.modules.users.service import user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenants", tags=["Tenants"])
# Mounted behind the tenant guard because its path names a tenant.
activity_router = APIRouter(tags=["Activity"])


def _apply_users(tenant_id: str, users: list[TenantUserUpsert], actor) -> list[str]:
    """Create or update users listed in a tenant payload. Returns warning strings for failures."""
    warnings: list[str] = []
    for u in users:
        try:
            if u.id:
                # Update existing user — only the fields that were supplied
                update_fields: dict = {"client_role": str(u.role)}
                if u.full_name is not None:
                    update_fields["full_name"] = u.full_name
                if u.password:
                    update_fields["password"] = u.password
                user_service.update_user(tenant_id, u.id, UserUpdate(**update_fields), actor)
            else:
                # Create new user under this tenant — always CLIENT platform role
                user_service.create_invitation(
                    tenant_id,
                    UserInviteCreate(
                        email=u.email,
                        full_name=u.full_name,
                        password=u.password,
                        role=Role.CLIENT,
                        client_role=str(u.role),
                        send_invitation=False,
                    ),
                    actor,
                )
        except HTTPException as exc:
            label = u.email or u.id or "unknown"
            warnings.append(f"{label}: {exc.detail}")
        except Exception:
            label = u.email or u.id or "unknown"
            logger.exception("Unexpected error processing user %s for tenant %s", label, tenant_id)
            warnings.append(f"{label}: unexpected error.")
    return warnings


@router.post("", response_model=ApiResponse[TenantRead], status_code=status.HTTP_201_CREATED)
def create_tenant(
    payload: Annotated[TenantCreate, Body()],
    actor: SuperAdminDep,
) -> ApiResponse[TenantRead]:
    """Create a tenant and all its initial users in one request."""
    tenant = tenant_service.create(payload, actor)

    # Create every listed user under the new tenant — no separate API call needed.
    from src.modules.tenants.schemas import TenantUserUpsert as _Upsert
    upsert_users = [
        _Upsert(email=u.email, full_name=u.full_name, password=u.password, role=u.role)
        for u in payload.users
    ]
    warnings = _apply_users(tenant.id, upsert_users, actor)

    warning_msg = (
        f"Client created but {len(warnings)} user(s) could not be added: {'; '.join(warnings)}"
        if warnings else None
    )
    return ApiResponse(
        data=tenant.model_copy(update={"invitation_warning": warning_msg}),
        message="Tenant created successfully.",
    )


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
    actor: CurrentUserDep,
) -> ApiResponse[TenantRead]:
    """Update tenant details, deactivate users, and create/update users — all in one request."""
    # 1. Update scalar tenant fields (excludes users/deactivate lists)
    updated = tenant_service.update(str(tenant_id), payload, actor)

    # 2. Deactivate removed users
    for uid in payload.deactivate_user_ids:
        try:
            user_service.deactivate_user(str(tenant_id), uid, actor)
        except HTTPException as exc:
            logger.warning("Could not deactivate user %s for tenant %s: %s", uid, tenant_id, exc.detail)

    # 3. Create / update users listed in this request
    warnings = _apply_users(str(tenant_id), payload.users, actor)
    warning_msg = (
        f"Saved but {len(warnings)} user(s) could not be updated: {'; '.join(warnings)}"
        if warnings else None
    )
    response_data = updated.model_copy(update={"invitation_warning": warning_msg}) if warning_msg else updated
    return ApiResponse(data=response_data, message="Tenant updated successfully.")


@router.put("/{tenant_id}/logo", response_model=ApiResponse[TenantRead])
async def upload_tenant_logo(tenant_id: UUID, request: Request, actor: CurrentUserDep) -> ApiResponse[TenantRead]:
    """Raw image body (Content-Type: image/png, image/jpeg or image/webp, up to 2 MB)."""
    data = await run_in_threadpool(
        lambda body, kind: tenant_service.set_logo(str(tenant_id), actor, content=body, content_type=kind),
        await request.body(), request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Logo saved.")


@router.delete("/{tenant_id}/logo", response_model=ApiResponse[TenantRead])
def remove_tenant_logo(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[TenantRead]:
    return ApiResponse(data=tenant_service.set_logo(str(tenant_id), actor, content=None), message="Logo removed.")


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


@activity_router.get("/tenants/{tenant_id}/activity", response_model=audit.ActivityList)
def tenant_activity(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> audit.ActivityList:
    """Everything changed in this tenant. TOFAA staff appear to clients only as 'TOFAA', never by name."""
    return audit.list_activity(str(tenant_id), actor.role != Role.CLIENT, page=page, limit=limit)
