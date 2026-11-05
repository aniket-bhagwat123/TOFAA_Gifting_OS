"""Typed tenant persistence model for the Supabase ``tenants`` table."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.core.schema import to_camel


class TenantStatus(StrEnum):
    PENDING_SETUP = "PENDING_SETUP"
    ACTIVE = "ACTIVE"
    DEACTIVATED = "DEACTIVATED"


class TenantType(StrEnum):
    ORGANIZATION = "ORGANIZATION"
    INDIVIDUAL = "INDIVIDUAL"
    INTERNAL = "INTERNAL"


class Tenant(BaseModel):
    """A tenant and the root of all tenant-owned records."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: UUID
    tenant_type: TenantType
    name: str = Field(min_length=2, max_length=200)
    legal_name: str | None = Field(default=None, max_length=200)
    gstin: str | None = Field(
        default=None,
        min_length=15,
        max_length=15,
        pattern=r"^[A-Za-z0-9]{15}$",
    )
    email_domain: str | None = Field(default=None, max_length=253)
    status: TenantStatus = TenantStatus.PENDING_SETUP
    created_at: datetime
    updated_at: datetime
