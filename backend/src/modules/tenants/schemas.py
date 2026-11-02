"""HTTP DTOs for tenant management."""

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel
from src.modules.tenants.models import TenantStatus, TenantType


class TenantCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    tenant_type: TenantType
    name: str = Field(min_length=2, max_length=200)
    legal_name: str | None = Field(default=None, max_length=200)
    gstin: str | None = Field(default=None, min_length=15, max_length=15, pattern=r"^[A-Za-z0-9]{15}$")
    email_domain: str | None = Field(default=None, max_length=253)


class TenantUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: str | None = Field(default=None, min_length=2, max_length=200)
    legal_name: str | None = Field(default=None, max_length=200)
    gstin: str | None = Field(default=None, min_length=15, max_length=15, pattern=r"^[A-Za-z0-9]{15}$")
    email_domain: str | None = Field(default=None, max_length=253)

    @model_validator(mode="after")
    def require_a_change(self) -> "TenantUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one tenant field must be provided")
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("Tenant name cannot be null")
        return self


class TenantRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_type: TenantType
    name: str
    legal_name: str | None = None
    gstin: str | None = None
    email_domain: str | None = None
    status: TenantStatus
    created_at: str
    updated_at: str


class TenantList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[TenantRead]
    pagination: PaginationMeta
    next_cursor: str | None = Field(
        default=None,
        description="Next page query values (page and limit), or null when there is no next page.",
    )
