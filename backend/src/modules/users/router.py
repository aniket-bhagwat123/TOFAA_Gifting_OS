"""User management and invitation routes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Header, Query, Request, status
from starlette.concurrency import run_in_threadpool

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep, TokenDep
from src.modules.auth.schemas import UserProfileResponse
from src.modules.auth.authorization import SuperAdminDep
from src.core.security import decode_access_token
from src.modules.tenants.service import tenant_service
from src.modules.tenants.service import tenant_service
from src.modules.users.schemas import SuperAdminBootstrap, KamOption, UserInviteCreate, UserInviteRead, UserList, UserRead, UserUpdate
from src.modules.users.service import user_service


router = APIRouter(tags=["Users"])
# TOFAA staff accounts: super admin only, always in the internal tenant.
team_router = APIRouter(prefix="/admin/team", tags=["TOFAA Team"])
# Separate because the invited user has no active tenant context yet.
invitation_router = APIRouter(tags=["Users"])


@invitation_router.post("/bootstrap/super-admin", response_model=ApiResponse[dict], status_code=status.HTTP_201_CREATED)
def bootstrap_super_admin(
    payload: Annotated[SuperAdminBootstrap, Body()],
    x_bootstrap_secret: Annotated[str | None, Header()] = None,
) -> ApiResponse[dict]:
    """Create the first super admin once. Send the BOOTSTRAP_SECRET in the X-Bootstrap-Secret header."""
    return ApiResponse(
        data=user_service.bootstrap_super_admin(x_bootstrap_secret, payload),
        message="Super admin created.",
    )


@router.get("/admin/kams", response_model=list[KamOption])
def list_active_kams(actor: SuperAdminDep) -> list[KamOption]:
    """List active KAM accounts and their UUIDs for client provisioning."""
    return user_service.list_active_kams(actor)


@router.post(
    "/tenants/{tenant_id}/users",
    response_model=ApiResponse[UserInviteRead],
    status_code=status.HTTP_202_ACCEPTED,
)
def invite_user(
    tenant_id: UUID,
    payload: Annotated[UserInviteCreate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[UserInviteRead]:
    """Invite a user to one tenant; the path tenant ID is authoritative."""
    return ApiResponse(
        data=user_service.create_invitation(str(tenant_id), payload, actor),
        message="User invitation created successfully.",
    )


@router.get("/tenants/{tenant_id}/users", response_model=UserList)
def list_users(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> UserList:
    return user_service.list_users(str(tenant_id), actor, page=page, limit=limit)


@router.get("/tenants/{tenant_id}/users/{user_id}", response_model=UserRead)
def get_user(tenant_id: UUID, user_id: UUID, actor: CurrentUserDep) -> UserRead:
    return user_service.get_user(str(tenant_id), str(user_id), actor)


@router.patch("/tenants/{tenant_id}/users/{user_id}", response_model=ApiResponse[UserRead])
def update_user(
    tenant_id: UUID,
    user_id: UUID,
    payload: Annotated[UserUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[UserRead]:
    return ApiResponse(
        data=user_service.update_user(str(tenant_id), str(user_id), payload, actor),
        message="User updated successfully.",
    )


@router.put("/me/avatar", response_model=ApiResponse[UserProfileResponse], tags=["Shared API"])
async def upload_my_avatar(request: Request, actor: CurrentUserDep) -> ApiResponse[UserProfileResponse]:
    """Raw image body (Content-Type: image/png, image/jpeg or image/webp, up to 2 MB)."""
    data = await run_in_threadpool(
        lambda body, kind: user_service.set_avatar(actor.id, content=body, content_type=kind),
        await request.body(), request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Photo saved.")


@router.delete("/me/avatar", response_model=ApiResponse[UserProfileResponse], tags=["Shared API"])
def remove_my_avatar(actor: CurrentUserDep) -> ApiResponse[UserProfileResponse]:
    return ApiResponse(data=user_service.set_avatar(actor.id, content=None), message="Photo removed.")


@router.put("/tenants/{tenant_id}/users/{user_id}/avatar", response_model=ApiResponse[UserRead])
async def upload_member_avatar(tenant_id: UUID, user_id: UUID, request: Request, actor: CurrentUserDep) -> ApiResponse[UserRead]:
    data = await run_in_threadpool(
        lambda body, kind: user_service.set_member_avatar(str(tenant_id), str(user_id), actor, content=body, content_type=kind),
        await request.body(), request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Photo saved.")


@router.delete("/tenants/{tenant_id}/users/{user_id}/avatar", response_model=ApiResponse[UserRead])
def remove_member_avatar(tenant_id: UUID, user_id: UUID, actor: CurrentUserDep) -> ApiResponse[UserRead]:
    return ApiResponse(data=user_service.set_member_avatar(str(tenant_id), str(user_id), actor, content=None), message="Photo removed.")


@router.post(
    "/tenants/{tenant_id}/users/{user_id}/activate",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    responses={
        401: {"description": "Missing or invalid bearer token."},
        403: {"description": "The user does not have permission to activate users."},
        404: {"description": "User is not a member of this tenant."},
        409: {"description": "The user could not be activated."},
        500: {"description": "Unexpected server error. Include the X-Request-Id when reporting it."},
    },
)
def activate_user(tenant_id: UUID, user_id: UUID, actor: CurrentUserDep) -> ApiResponse[dict]:
    user_service.activate_user(str(tenant_id), str(user_id), actor)
    return ApiResponse(data={}, message="User activated successfully.")


@router.post(
    "/tenants/{tenant_id}/users/{user_id}/deactivate",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    responses={
        401: {"description": "Missing or invalid bearer token."},
        403: {"description": "The user does not have permission to deactivate users."},
        404: {"description": "User is not a member of this tenant."},
        409: {"description": "The membership could not be deactivated."},
        500: {"description": "Unexpected server error. Include the X-Request-Id when reporting it."},
    },
)
def deactivate_user(tenant_id: UUID, user_id: UUID, actor: CurrentUserDep) -> ApiResponse[dict]:
    user_service.deactivate_user(str(tenant_id), str(user_id), actor)
    return ApiResponse(data={}, message="User deactivated successfully.")


@router.post(
    "/tenants/{tenant_id}/users/{user_id}/resend-invite",
    response_model=ApiResponse[UserInviteRead],
)
def resend_invitation(
    tenant_id: UUID,
    user_id: UUID,
    actor: CurrentUserDep,
) -> ApiResponse[UserInviteRead]:
    return ApiResponse(
        data=user_service.resend_invitation(str(tenant_id), str(user_id), actor),
        message="User invitation resent successfully.",
    )


@invitation_router.post("/auth/invitations/accept", response_model=ApiResponse[UserRead])
def accept_invitation(token: TokenDep) -> ApiResponse[UserRead]:
    """Activate the invitation for the user identified by the verified bearer token."""
    token_subject = decode_access_token(token).sub
    return ApiResponse(
        data=user_service.accept_invitation(token_subject),
        message="User invitation accepted successfully.",
    )


@team_router.get("", response_model=UserList)
def list_team(
    actor: SuperAdminDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> UserList:
    return user_service.list_users(tenant_service.internal_tenant_id(), actor, page=page, limit=limit)


@team_router.post("", response_model=ApiResponse[UserInviteRead], status_code=status.HTTP_202_ACCEPTED)
def invite_team_member(payload: Annotated[UserInviteCreate, Body()], actor: SuperAdminDep) -> ApiResponse[UserInviteRead]:
    return ApiResponse(
        data=user_service.create_invitation(tenant_service.internal_tenant_id(), payload, actor),
        message="Team invitation created successfully.",
    )


@team_router.patch("/{user_id}", response_model=ApiResponse[UserRead])
def update_team_member(
    user_id: UUID, payload: Annotated[UserUpdate, Body()], actor: SuperAdminDep
) -> ApiResponse[UserRead]:
    return ApiResponse(
        data=user_service.update_user(tenant_service.internal_tenant_id(), str(user_id), payload, actor),
        message="Team member updated successfully.",
    )


@team_router.post("/{user_id}/activate", response_model=ApiResponse[dict])
def activate_team_member(user_id: UUID, actor: SuperAdminDep) -> ApiResponse[dict]:
    user_service.activate_user(tenant_service.internal_tenant_id(), str(user_id), actor)
    return ApiResponse(data={}, message="Team member activated successfully.")


@team_router.post("/{user_id}/deactivate", response_model=ApiResponse[dict])
def deactivate_team_member(user_id: UUID, actor: SuperAdminDep) -> ApiResponse[dict]:
    user_service.deactivate_user(tenant_service.internal_tenant_id(), str(user_id), actor)
    return ApiResponse(data={}, message="Team member deactivated successfully.")


@team_router.post("/{user_id}/resend-invite", response_model=ApiResponse[UserInviteRead])
def resend_team_invitation(user_id: UUID, actor: SuperAdminDep) -> ApiResponse[UserInviteRead]:
    return ApiResponse(
        data=user_service.resend_invitation(tenant_service.internal_tenant_id(), str(user_id), actor),
        message="Team invitation resent successfully.",
    )
