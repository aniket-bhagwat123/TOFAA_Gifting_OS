"""Schemas for the tenant gift request workflow."""

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


class GiftRequestStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    IN_REVIEW = "IN_REVIEW"
    NEEDS_INFO = "NEEDS_INFO"
    PROPOSAL_READY = "PROPOSAL_READY"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class GiftRequestFields(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    title: str = Field(min_length=1, max_length=180)
    recipient_id: UUID
    event_id: UUID | None = None
    occasion_id: UUID | None = None
    requested_credits: int | None = Field(default=None, gt=0, le=1_000_000_000)
    purpose: str = Field(min_length=1, max_length=2000)
    gift_preferences: str | None = Field(default=None, max_length=2000)
    requested_budget: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    delivery_date: date | None = None
    message: str | None = Field(default=None, max_length=1000)
    special_instructions: str | None = Field(default=None, max_length=2000)

    @field_validator("title", "purpose", mode="before")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class GiftRequestCreate(GiftRequestFields):
    @model_validator(mode="after")
    def require_one_spend_source(self) -> "GiftRequestCreate":
        if (self.event_id is None) == (self.occasion_id is None):
            raise ValueError("Exactly one of event_id or occasion_id is required")
        return self


class GiftRequestUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=180)
    recipient_id: UUID | None = None
    event_id: UUID | None = None
    occasion_id: UUID | None = None
    requested_credits: int | None = Field(default=None, gt=0, le=1_000_000_000)
    purpose: str | None = Field(default=None, min_length=1, max_length=2000)
    gift_preferences: str | None = Field(default=None, max_length=2000)
    requested_budget: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    delivery_date: date | None = None
    message: str | None = Field(default=None, max_length=1000)
    special_instructions: str | None = Field(default=None, max_length=2000)

    @field_validator("title", "purpose", mode="before")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_patch(self) -> "GiftRequestUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one gift request field must be provided")
        for field in ("title", "recipient_id", "purpose"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if "event_id" in self.model_fields_set and "occasion_id" in self.model_fields_set and self.event_id is not None and self.occasion_id is not None:
            raise ValueError("Only one of event_id or occasion_id may be set")
        return self


class GiftProposalOption(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: str = Field(min_length=1, max_length=180)
    description: str | None = Field(default=None, max_length=1000)
    price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class GiftProposal(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    options: list[GiftProposalOption] = Field(min_length=1, max_length=20)
    note: str | None = Field(default=None, max_length=2000)


class GiftProposalUpdate(GiftProposal):
    pass


class GiftRequestAction(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    note: str | None = Field(default=None, max_length=2000)


class GiftRequestRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    recipient_id: str
    event_id: str | None = None
    occasion_id: str | None = None
    created_by_user_id: str
    title: str
    purpose: str
    gift_preferences: str | None = None
    requested_budget: Decimal | None = None
    requested_credits: int | None = None
    delivery_date: date | None = None
    message: str | None = None
    special_instructions: str | None = None
    status: GiftRequestStatus
    proposal: GiftProposal | None = None
    status_note: str | None = None
    created_at: datetime | str
    updated_at: datetime | str


class GiftRequestEventRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    gift_request_id: str
    from_status: GiftRequestStatus | None = None
    to_status: GiftRequestStatus
    actor_user_id: str | None = None
    note: str | None = None
    created_at: datetime | str


class GiftRequestPage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[GiftRequestRead]
    pagination: PaginationMeta
    next_cursor: str | None = None


class GiftRequestEventPage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[GiftRequestEventRead]
