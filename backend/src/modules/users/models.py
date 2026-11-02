"""Typed user and tenant-membership persistence models."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from src.core.schema import to_camel
from src.modules.auth.rbac import Role


UserRole = Role


class MembershipType(StrEnum):
    CLIENT = "CLIENT"
    PLATFORM = "PLATFORM"


class MembershipStatus(StrEnum):
    INVITED = "INVITED"
    ACTIVE = "ACTIVE"
    DEACTIVATED = "DEACTIVATED"


class User(BaseModel):
    """An auth profile joined to its single tenant membership."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str | None = Field(default=None, max_length=150)
    role: UserRole = UserRole.CLIENT
    is_active: bool = True
    membership_status: MembershipStatus = MembershipStatus.INVITED
    created_at: datetime
    updated_at: datetime


class TenantMembership(BaseModel):
    """A user's exclusive tenant binding; user_id is unique in the database."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    user_id: UUID
    membership_type: MembershipType
    status: MembershipStatus
    created_at: datetime
    updated_at: datetime
