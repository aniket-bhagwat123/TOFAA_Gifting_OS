import re
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.schema import to_camel
from src.modules.auth.rbac import Role


# ============================================================================
# Request Schemas
# ============================================================================

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


class ProfileUpdateRequest(BaseModel):
    """What a signed-in user may change on their own profile. Role, tenant and status are never editable here."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    mobile_number: str | None = Field(default=None, description="International number such as +919876543210. Empty clears it.")

    @field_validator("full_name", "email", "mobile_number", mode="before")
    @classmethod
    def _strip(cls, value: Any) -> Any:
        return value.strip() if isinstance(value, str) else value

    @field_validator("mobile_number")
    @classmethod
    def _valid_mobile(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return value
        if not re.fullmatch(r"\+?[1-9][0-9]{7,14}", value):
            raise ValueError("Enter a valid mobile number, with country code (for example +919876543210).")
        return value

    @model_validator(mode="after")
    def _require_a_change(self) -> "ProfileUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("At least one profile field must be provided")
        if "full_name" in self.model_fields_set and self.full_name is None:
            raise ValueError("Name cannot be empty")
        if "email" in self.model_fields_set and self.email is None:
            raise ValueError("Email cannot be empty")
        return self


# ============================================================================
# Response Schemas
# ============================================================================

class UserProfileResponse(BaseModel):
    id: str = Field(description="User unique identifier (UUID)")
    email: str = Field(description="User's email address")
    full_name: str | None = Field(default=None, description="User's full name")
    avatar_url: str | None = Field(default=None, description="Avatar image URL")
    mobile_number: str | None = Field(default=None, description="Mobile number with country code")
    role: Role = Field(default=Role.CLIENT, description="Application role")
    tenant_id: str | None = Field(default=None, description="The user's tenant. Null when the account has no tenant, such as a platform super admin.")
    is_active: bool = Field(default=True, description="Account active status")
    must_reset_password: bool = Field(default=False, description="Whether the user must replace their temporary password")
    client_role: str | None = Field(default=None, description="Business role within a client org (OWNER/EA/HR); null for platform staff")
    tenant_name: str | None = Field(default=None, description="Display name of the user's tenant organisation")
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
