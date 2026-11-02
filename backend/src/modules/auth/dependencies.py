from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.core.security import decode_access_token
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse
from src.modules.auth.service import auth_service

security_bearer = HTTPBearer(auto_error=False)


async def get_token_from_header(
    auth_header: Annotated[HTTPAuthorizationCredentials | None, Depends(security_bearer)],
) -> str:
    """
    Extracts the bearer token from the Authorization header.
    Raises 401 Unauthorized if the header is missing or improperly formed.
    """
    if not auth_header or not auth_header.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization Bearer header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth_header.credentials


def get_current_user(
    token: Annotated[str, Depends(get_token_from_header)],
) -> UserProfileResponse:
    """
    Validates the Supabase JWT token and resolves the authenticated user profile.
    """
    token_payload = decode_access_token(token)
    user_profile = auth_service.get_profile_by_id(
        user_id=token_payload.sub,
        default_email=token_payload.email,
        default_name=token_payload.user_metadata.get("full_name"),
        default_must_reset_password=bool(token_payload.app_metadata.get("must_reset_password")),
    )
    return user_profile


def get_current_active_user(
    current_user: Annotated[UserProfileResponse, Depends(get_current_user)],
) -> UserProfileResponse:
    """
    Ensures that the authenticated user account is active.
    """
    if current_user.must_reset_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Set a new password before using tenant features.",
        )
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user account.",
        )
    if current_user.role not in set(Role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User role is not authorized.",
        )
    if current_user.role == Role.CLIENT and current_user.tenant_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Client onboarding is incomplete or inactive.",
        )
    return current_user


def get_optional_current_user(
    auth_header: Annotated[HTTPAuthorizationCredentials | None, Depends(security_bearer)],
) -> UserProfileResponse | None:
    """
    Returns the user profile if an Authorization header is provided and valid, otherwise None.
    Useful for optional authentication endpoints.
    """
    if not auth_header or not auth_header.credentials:
        return None
    try:
        token_payload = decode_access_token(auth_header.credentials)
        return auth_service.get_profile_by_id(
            user_id=token_payload.sub,
            default_email=token_payload.email,
            default_name=token_payload.user_metadata.get("full_name"),
            default_must_reset_password=bool(token_payload.app_metadata.get("must_reset_password")),
        )
    except Exception:
        return None


# Reusable dependency aliases adhering to FastAPI best practices
CurrentUserDep = Annotated[UserProfileResponse, Depends(get_current_active_user)]
OptionalUserDep = Annotated[UserProfileResponse | None, Depends(get_optional_current_user)]
TokenDep = Annotated[str, Depends(get_token_from_header)]
