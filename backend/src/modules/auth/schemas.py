from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field

from src.core.schema import to_camel
from src.modules.auth.rbac import Role


# ============================================================================
# Request Schemas
# ============================================================================

class UserRegisterRequest(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", description="User's email address")
    password: str = Field(min_length=8, max_length=128, description="User password (min 8 characters)")
    full_name: str | None = Field(default=None, max_length=150, description="Full name of the user")


class UserLoginRequest(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", description="User's email address")
    password: str = Field(description="User password")


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(description="Valid Supabase refresh token")


class PasswordResetRequest(BaseModel):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", description="Account email to send recovery instructions")


class PasswordUpdateRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    new_password: str = Field(min_length=8, max_length=128, description="New password (min 8 characters)")


# ============================================================================
# Response Schemas
# ============================================================================

class UserProfileResponse(BaseModel):
    id: str = Field(description="User unique identifier (UUID)")
    email: str = Field(description="User's email address")
    full_name: str | None = Field(default=None, description="User's full name")
    avatar_url: str | None = Field(default=None, description="Avatar image URL")
    role: Role = Field(default=Role.CLIENT, description="Application role")
    tenant_id: str | None = Field(default=None, description="Tenant company for client users")
    is_active: bool = Field(default=True, description="Account active status")
    must_reset_password: bool = Field(default=False, description="Whether the user must replace their temporary password")
    created_at: datetime | str | None = Field(default=None, description="Timestamp user was created")
    updated_at: datetime | str | None = Field(default=None, description="Timestamp profile was last updated")


class TokenResponse(BaseModel):
    access_token: str = Field(description="JWT Bearer access token")
    token_type: str = Field(default="bearer", description="Token type, typically 'bearer'")
    expires_in: int | None = Field(default=3600, description="Token validity in seconds")
    expires_at: int | None = Field(default=None, description="Unix timestamp when token expires")
    refresh_token: str = Field(description="Refresh token used to obtain a new access token")


class AuthResponse(BaseModel):
    user: UserProfileResponse = Field(description="User profile details")
    session: TokenResponse | None = Field(default=None, description="Session authentication tokens")
    message: str | None = Field(default=None, description="Informational message")


class MessageResponse(BaseModel):
    message: str = Field(description="Response message")
