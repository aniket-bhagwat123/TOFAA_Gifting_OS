"""HTTP DTOs for tenant management."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel
from src.modules.tenants.models import TenantStatus, TenantType


class ClientRole(StrEnum):
    """Business role within a client organisation. All values map to the CLIENT platform role."""
    OWNER = "OWNER"
    EA = "EA"
    HR = "HR"


class TenantUserCreate(BaseModel):
    """A user to create under this tenant in the same request."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str | None = Field(default=None, max_length=150)
    password: str = Field(min_length=8, max_length=128)
    role: ClientRole = ClientRole.OWNER


class TenantUserUpsert(BaseModel):
    """Upsert a user during a tenant update.
    - Provide ``id`` to update an existing user.
    - Omit ``id`` (and provide ``email``) to create a new user.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    id: str | None = Field(default=None)
    email: str | None = Field(default=None, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str | None = Field(default=None, max_length=150)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    role: ClientRole = ClientRole.OWNER

    @model_validator(mode="after")
    def new_user_needs_email_and_password(self) -> "TenantUserUpsert":
        if not self.id:
            if not self.email:
                raise ValueError("email is required when creating a new user (id not provided).")
            if not self.password:
                raise ValueError("password is required when creating a new user (id not provided).")
        return self


class TenantCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    tenant_type: TenantType
    name: str = Field(min_length=2, max_length=200)
    legal_name: str | None = Field(default=None, max_length=200)
    gstin: str | None = Field(default=None, min_length=15, max_length=15, pattern=r"^[A-Za-z0-9]{15}$")
    email_domain: str | None = Field(default=None, max_length=253)
    users: list[TenantUserCreate] = Field(default_factory=list, description="Users to create under this tenant.")

    @field_validator("tenant_type")
    @classmethod
    def reject_internal(cls, value: TenantType) -> TenantType:
        if value == TenantType.INTERNAL:
            raise ValueError("The TOFAA team tenant already exists and cannot be created.")
        return value


class TenantUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=200)
    legal_name: str | None = Field(default=None, max_length=200)
    gstin: str | None = Field(default=None, min_length=15, max_length=15, pattern=r"^[A-Za-z0-9]{15}$")
    email_domain: str | None = Field(default=None, max_length=253)
    users: list[TenantUserUpsert] = Field(
        default_factory=list,
        description="Users to create (no id) or update (with id) under this tenant.",
    )
    deactivate_user_ids: list[str] = Field(
        default_factory=list,
        description="IDs of existing users to deactivate.",
    )

    @model_validator(mode="after")
    def require_a_change(self) -> "TenantUpdate":
        scalar_fields = {"name", "legal_name", "gstin", "email_domain"}
        has_scalar = bool(self.model_fields_set & scalar_fields)
        has_user_changes = bool(self.users) or bool(self.deactivate_user_ids)
        if not has_scalar and not has_user_changes:
            raise ValueError("At least one field must be provided.")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Tenant name cannot be null.")
        return self


class TenantRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_type: TenantType
    name: str
    legal_name: str | None = None
    gstin: str | None = None
    email_domain: str | None = None
    logo_url: str | None = None
    status: TenantStatus
    created_at: str
    updated_at: str
    invitation_warning: str | None = Field(default=None, description="Set on creation when any user invitation failed.")


class TenantList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[TenantRead]
    pagination: PaginationMeta
    next_cursor: str | None = Field(
        default=None,
        description="Next page query values (page and limit), or null when there is no next page.",
    )
