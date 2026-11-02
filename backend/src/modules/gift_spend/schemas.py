"""API schemas for Gift Spend Management."""

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


class SpendBudgetMode(StrEnum):
    PER_RECIPIENT = "PER_RECIPIENT"
    SHARED_POOL = "SHARED_POOL"


class RecipientGroupCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    recipient_ids: list[UUID] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_unique_recipients(self) -> "RecipientGroupCreate":
        if len(set(self.recipient_ids)) != len(self.recipient_ids):
            raise ValueError("recipientIds must not contain duplicates")
        return self


class RecipientGroupUpdate(RecipientGroupCreate):
    pass


class RecipientGroupRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    name: str
    recipient_ids: list[str]
    created_at: datetime | str
    updated_at: datetime | str


class OccasionGroupImport(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    recipient_group_id: UUID
    budget_mode: SpendBudgetMode
    budget_credits: int = Field(gt=0, le=1_000_000_000)


class OccasionGroupBudgetUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    budget_mode: SpendBudgetMode
    budget_credits: int = Field(gt=0, le=1_000_000_000)


class RecipientOccasionBudgetUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    budget_credits: int = Field(gt=0, le=1_000_000_000)


class EventBudgetUpdate(RecipientOccasionBudgetUpdate):
    pass


class SpendRecipientAllocation(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    recipient_id: str
    recipient_name: str | None = None
    budget_credits: int | None = None
    spent_credits: int
    reserved_credits: int
    budget_source: str


class OccasionGroupAllocationRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    source_group_id: str
    group_name: str
    budget_mode: SpendBudgetMode
    budget_credits: int
    allocated_credits: int
    spent_credits: int
    reserved_credits: int
    members: list[SpendRecipientAllocation]


class OccasionSpendSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    occasion_id: str
    occasion_name: str
    tenant_id: str
    groups: list[OccasionGroupAllocationRead]
    recipients: list[SpendRecipientAllocation]
    allocated_credits: int
    spent_credits: int
    reserved_credits: int


class EventSpendSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    event_id: str
    event_name: str
    event_date: date
    tenant_id: str
    recipient_id: str
    recipient_name: str | None = None
    budget_credits: int
    spent_credits: int
    reserved_credits: int


class SpendSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tenant_id: str
    available_credits: int
    reserved_credits: int
    unallocated_credits: int
    total_allocated_credits: int
    total_spent_credits: int
    occasions: list[OccasionSpendSummary]
    events: list[EventSpendSummary]


class GiftSpendSettingsUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    reminder_days: list[int] = Field(default_factory=lambda: [30, 7, 1], min_length=1, max_length=10)

    @model_validator(mode="after")
    def validate_days(self) -> "GiftSpendSettingsUpdate":
        if any(day < 0 or day > 365 for day in self.reminder_days):
            raise ValueError("reminderDays must be between 0 and 365")
        if len(set(self.reminder_days)) != len(self.reminder_days):
            raise ValueError("reminderDays must not contain duplicates")
        return self


class GiftSpendSettingsRead(GiftSpendSettingsUpdate):
    tenant_id: str


class GiftSpendNotificationRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    notification_type: str
    source_type: str
    source_id: str
    title: str
    body: str
    lead_days: int
    event_date: date
    created_at: datetime | str
    read_at: datetime | str | None = None


class GiftSpendNotificationPage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[GiftSpendNotificationRead]
    pagination: PaginationMeta
    next_cursor: str | None = None
