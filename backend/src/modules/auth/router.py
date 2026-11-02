from typing import Annotated
from fastapi import APIRouter, Body, Depends, status

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep, TokenDep
from src.modules.auth.schemas import (
    AuthResponse,
    MessageResponse,
    PasswordResetRequest,
    PasswordUpdateRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserLoginRequest,
    UserProfileResponse,
    UserRegisterRequest,
)
from src.modules.auth.service import auth_service

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)


@router.post(
    "/register",
    response_model=ApiResponse[AuthResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user",
    description="Creates a new user in Supabase Auth. A user profile is automatically generated via database triggers.",
)
async def register(payload: Annotated[UserRegisterRequest, Body()]) -> ApiResponse[AuthResponse]:
    return ApiResponse(
        data=auth_service.register(payload),
        message="Registration successful.",
    )


@router.post(
    "/login",
    response_model=AuthResponse,
    status_code=status.HTTP_200_OK,
    summary="User login",
    description="Authenticates credentials against Supabase Auth and returns JWT access & refresh tokens.",
)
def login(payload: Annotated[UserLoginRequest, Body()]) -> AuthResponse:
    return auth_service.login(payload)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
    description="Issues a new JWT access and refresh token pair using an unexpired refresh token.",
)
def refresh_token(payload: Annotated[RefreshTokenRequest, Body()]) -> TokenResponse:
    return auth_service.refresh(payload)


@router.post(
    "/logout",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="User logout",
    description="Invalidates the user's current session in Supabase Auth.",
)
def logout(token: TokenDep) -> MessageResponse:
    auth_service.logout(token)
    return MessageResponse(message="Successfully logged out.")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    status_code=status.HTTP_200_OK,
    summary="Request password reset",
    description="Sends a password reset email if the provided email exists in Supabase Auth.",
)
def forgot_password(payload: Annotated[PasswordResetRequest, Body()]) -> MessageResponse:
    auth_service.request_password_reset(payload)
    return MessageResponse(
        message="If this email is registered, password reset instructions have been dispatched."
    )


@router.post(
    "/reset-password",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    summary="Update user password",
    description="Updates the password for the currently authenticated user.",
)
def reset_password(
    token: TokenDep,
    payload: Annotated[PasswordUpdateRequest, Body()],
) -> ApiResponse[dict]:
    auth_service.update_password(token, payload)
    return ApiResponse(data={}, message="Password successfully updated.")


@router.get(
    "/me",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current user profile",
    description="Returns the profile information for the currently authenticated user extracted from the JWT and database.",
)
def get_me(current_user: CurrentUserDep) -> UserProfileResponse:
    return current_user
