"""Reusable role and tenant authorization dependencies."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status

from src.modules.auth.dependencies import get_current_active_user
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse


def require_roles(*allowed_roles: Role | str) -> Callable[..., UserProfileResponse]:
    """Build a dependency that rejects principals outside the allowed roles."""

    async def dependency(
        current_user: Annotated[UserProfileResponse, Depends(get_current_active_user)],
    ) -> UserProfileResponse:
        if current_user.role != Role.SUPER_ADMIN and current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return current_user

    return dependency


SuperAdminDep = Annotated[UserProfileResponse, Depends(require_roles(Role.SUPER_ADMIN))]
KamOrAdminDep = Annotated[UserProfileResponse, Depends(require_roles(Role.KAM, Role.SUPER_ADMIN))]
