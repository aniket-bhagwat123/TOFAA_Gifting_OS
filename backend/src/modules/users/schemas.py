"""HTTP DTOs for tenant-scoped user management."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel
from src.modules.tenants.models import TenantStatus
from src.modules.users.models import UserRole


class UserInviteCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str | None = Field(default=None, max_length=150)
    role: UserRole = UserRole.CLIENT
    domain_override_reason: str | None = Field(default=None, min_length=5, max_length=500)


class UserUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    full_name: str | None = Field(default=None, max_length=150)
    is_active: bool | None = Field(default=None)

    @model_validator(mode="after")
    def require_a_change(self) -> "UserUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one user field must be provided")
        return self


class UserRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    email: str
    full_name: str | None = None
    role: UserRole
    is_active: bool
    tenant_status: TenantStatus
    created_at: datetime | str
    updated_at: datetime | str


class KamOption(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    email: str
    full_name: str | None = None


class UserInviteRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    invitation_id: str
    tenant_id: str
    email: str
    status: str
    expires_at: datetime | str


class UserList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[UserRead]
    pagination: PaginationMeta
    next_cursor: str | None = Field(
        default=None,
        description="Next page query values (page and limit), or null when there is no next page.",
    )
