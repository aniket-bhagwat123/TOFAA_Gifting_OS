"""Request and response schemas for contract workspaces and gift lines."""

from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field, field_validator, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


class ContractGiftStatus(StrEnum):
    PLANNED = "PLANNED"
    IN_PREPARATION = "IN_PREPARATION"
    DISPATCHED = "DISPATCHED"
    IN_TRANSIT = "IN_TRANSIT"
    DELIVERED = "DELIVERED"
    ISSUE_REPORTED = "ISSUE_REPORTED"
    CANCELLED = "CANCELLED"


class GiftLineCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    recipient_id: UUID
    event_id: UUID | None = None
    occasion_id: UUID | None = None
    request_id: UUID | None = None
    gift_name: str = Field(min_length=1, max_length=180)
    customisation: str | None = Field(default=None, max_length=2000)
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    quantity: int = Field(default=1, ge=1, le=10000)
    delivery_date: date | None = None
    vendor_name: str | None = Field(default=None, max_length=180)
    status: ContractGiftStatus = ContractGiftStatus.PLANNED

    @field_validator("gift_name", "customisation", "vendor_name", mode="before")
    @classmethod
    def trim_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("gift_name")
    @classmethod
    def require_nonblank_name(cls, value: str) -> str:
        if not value:
            raise ValueError("gift_name cannot be blank")
        return value

    @model_validator(mode="after")
    def cannot_start_cancelled(self) -> "GiftLineCreate":
        if self.status == ContractGiftStatus.CANCELLED:
            raise ValueError("Use the cancel endpoint to cancel gifts")
        if (self.event_id is None) == (self.occasion_id is None):
            raise ValueError("Exactly one of event_id or occasion_id is required")
        return self


class GiftLineUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    recipient_id: UUID | None = None
    event_id: UUID | None = None
    occasion_id: UUID | None = None
    request_id: UUID | None = None
    gift_name: str | None = Field(default=None, min_length=1, max_length=180)
    customisation: str | None = Field(default=None, max_length=2000)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    quantity: int | None = Field(default=None, ge=1, le=10000)
    delivery_date: date | None = None
    vendor_name: str | None = Field(default=None, max_length=180)
    reason: str | None = Field(default=None, max_length=1000)

    @field_validator("gift_name", "customisation", "vendor_name", "reason", mode="before")
    @classmethod
    def trim_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_patch(self) -> "GiftLineUpdate":
        if not (self.model_fields_set - {"reason"}):
            raise ValueError("At least one gift field must be provided")
        for key in ("recipient_id", "gift_name", "unit_price", "quantity"):
            if key in self.model_fields_set and getattr(self, key) is None:
                raise ValueError(f"{key} cannot be null")
        if "gift_name" in self.model_fields_set and not self.gift_name:
            raise ValueError("gift_name cannot be blank")
        if self.event_id is not None and self.occasion_id is not None:
            raise ValueError("Only one of event_id or occasion_id may be set")
        return self


class GiftLineCancel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    reason: str = Field(min_length=1, max_length=1000)

    @field_validator("reason", mode="before")
    @classmethod
    def trim_reason(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("reason")
    @classmethod
    def require_nonblank_reason(cls, value: str) -> str:
        if not value:
            raise ValueError("reason cannot be blank")
        return value


class GiftBulkUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    gift_ids: list[UUID] = Field(min_length=1, max_length=100)
    status: ContractGiftStatus | None = None
    vendor_name: str | None = Field(default=None, max_length=180)
    delivery_date: date | None = None

    @field_validator("vendor_name", mode="before")
    @classmethod
    def trim_vendor(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def require_update_fields(self) -> "GiftBulkUpdate":
        if not self.model_fields_set.intersection({"status", "vendor_name", "delivery_date"}):
            raise ValueError("At least one bulk update field must be provided")
        if self.status == ContractGiftStatus.CANCELLED:
            raise ValueError("Use the cancel endpoint to cancel gifts")
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status cannot be null")
        return self


class GiftLineRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    contract_id: str
    recipient_id: str
    recipient_name: str | None = None
    recipient_tier: str | None = None
    event_id: str | None = None
    event_name: str | None = None
    occasion_id: str | None = None
    occasion_name: str | None = None
    request_id: str | None = None
    gift_name: str
    customisation: str | None = None
    unit_price: Decimal
    quantity: int
    delivery_date: date | None = None
    vendor_name: str | None = None
    status: ContractGiftStatus
    price_change_reason: str | None = None
    created_at: datetime | str
    updated_at: datetime | str

    @computed_field
    @property
    def line_total(self) -> Decimal:
        return self.unit_price * self.quantity


class GiftLinePage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[GiftLineRead]
    pagination: PaginationMeta
    next_cursor: str | None = None


class ContractParameters(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    contract_number: str
    status: str
    sla_tier: str
    start_date: date
    end_date: date
    currency: str
    contract_value: Decimal


class ContractTierBudget(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tier_key: str
    budget_amount: Decimal
    per_gift_limit: Decimal | None = None


class ContractSpend(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    committed: Decimal
    delivered: Decimal
    contract_value: Decimal
    used_percent: Decimal
    budget_alert: str | None = None


class ContractWorkspaceRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tenant_id: str
    contract: ContractParameters
    tier_budgets: list[ContractTierBudget]
    gift_plan: GiftLinePage
    spend: ContractSpend


class GiftBulkUpdateResult(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    updated_count: int
    items: list[GiftLineRead]
