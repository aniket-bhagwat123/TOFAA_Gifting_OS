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


class OccasionGroupCreate(BaseModel):
    """Create a group straight inside an occasion: a name and its people. No budget yet."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    group_name: str = Field(min_length=1, max_length=100)
    recipient_ids: list[UUID] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def validate_unique_recipients(self) -> "OccasionGroupCreate":
        if len(set(self.recipient_ids)) != len(self.recipient_ids):
            raise ValueError("recipient_ids must not contain duplicates")
        return self


class OccasionGroupUpdate(BaseModel):
    """Change any of: name, people, split type, budget. Send only what changes."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    group_name: str | None = Field(default=None, min_length=1, max_length=100)
    recipient_ids: list[UUID] | None = Field(default=None, min_length=1, max_length=1000)
    budget_mode: SpendBudgetMode | None = None
    budget_credits: int | None = Field(default=None, gt=0, le=1_000_000_000)

    @model_validator(mode="after")
    def validate_patch(self) -> "OccasionGroupUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        for field in ("group_name", "recipient_ids", "budget_mode", "budget_credits"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        if self.recipient_ids and len(set(self.recipient_ids)) != len(self.recipient_ids):
            raise ValueError("recipient_ids must not contain duplicates")
        return self


class OccasionGroupBudgetUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    budget_mode: SpendBudgetMode
    budget_credits: int = Field(gt=0, le=1_000_000_000)


class RecipientOccasionBudgetUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    budget_credits: int = Field(gt=0, le=1_000_000_000)


class OccasionRecipientBudgetUpdate(RecipientOccasionBudgetUpdate):
    # 0 means "credits not set yet": the person is in the occasion but can't be gifted.
    budget_credits: int = Field(ge=0, le=1_000_000_000)
    group_name: str | None = Field(default=None, max_length=100)


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
    group_name: str | None = None


class OccasionGroupAllocationRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    source_group_id: str | None = None
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


def to_camel_keys(values: dict[str, int]) -> dict[str, int]:
    return {to_camel(key): value for key, value in values.items()}


class DefaultBudgetTarget(StrEnum):
    GROUP = "GROUP"
    RECIPIENT = "RECIPIENT"


class DefaultBudgetSet(BaseModel):
    """Save a default budget on a recipient group or one recipient (no occasion needed)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    target_type: DefaultBudgetTarget
    target_id: UUID
    # A person's budget belongs to one group, so it is required for RECIPIENT and ignored for GROUP.
    group_id: UUID | None = None
    budget_mode: SpendBudgetMode = SpendBudgetMode.PER_RECIPIENT
    budget_credits: int = Field(gt=0, le=1_000_000_000)

    @model_validator(mode="after")
    def validate_group_for_recipient(self) -> "DefaultBudgetSet":
        if self.target_type == DefaultBudgetTarget.RECIPIENT and self.group_id is None:
            raise ValueError("groupId is required for a recipient budget")
        return self


class DefaultBudgetRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    target_type: DefaultBudgetTarget
    target_id: str
    group_id: str | None = None
    budget_mode: SpendBudgetMode
    budget_credits: int
