"""Schemas for tenant credit requests and ledger APIs."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


class CreditRequestCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    requested_credits: int = Field(gt=0, le=1_000_000_000)
    note: str | None = Field(default=None, max_length=1000)


class PaymentSubmission(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    payment_reference: str = Field(min_length=3, max_length=150)
    paid_amount_minor: int = Field(gt=0)
    payment_proof_file_id: str | None = Field(default=None, min_length=1, max_length=500)


class CreditReview(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    review_note: str | None = Field(default=None, max_length=1000)


class CreditRejection(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    reason: str = Field(min_length=1, max_length=1000)


class PaymentVerification(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    verification_note: str | None = Field(default=None, max_length=1000)


class CreditAdjustment(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    direction: Literal["credit", "debit"]
    credits: int = Field(gt=0, le=1_000_000_000)
    reason: str = Field(min_length=1, max_length=1000)
    reference: str | None = Field(default=None, max_length=150)


class CreditRequestRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    id: str
    tenant_id: str
    requested_credits: int
    currency: str
    unit_price_minor: int
    amount_due_minor: int
    status: str
    note: str | None = None
    created_by_user_id: str | None = None
    reviewed_by_user_id: str | None = None
    review_note: str | None = None
    payment_reference: str | None = None
    payment_proof_file_id: str | None = None
    paid_amount_minor: int | None = None
    verification_note: str | None = None
    verified_by_user_id: str | None = None
    ledger_entry_id: str | None = None
    created_at: datetime | str
    updated_at: datetime | str


class CreditLedgerRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    id: str
    tenant_id: str
    entry_type: str
    credits_delta: int
    balance_after: int
    source_type: str
    source_id: str | None = None
    payment_reference: str | None = None
    description: str
    reason: str | None = None
    reference: str | None = None
    created_by_user_id: str | None = None
    created_at: datetime | str


class CreditRequestEventRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    id: str
    request_id: str
    from_status: str | None = None
    to_status: str
    actor_user_id: str | None = None
    note: str | None = None
    created_at: datetime | str


class CreditBalanceRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tenant_id: str
    available_credits: int
    currency: str
    as_of: datetime | str


class CreditRequestPage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[CreditRequestRead]
    pagination: PaginationMeta
    next_cursor: str | None = None


class CreditLedgerPage(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[CreditLedgerRead]
    pagination: PaginationMeta
    next_cursor: str | None = None


class CreditRequestHistory(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[CreditRequestEventRead]


class CreditUsageGroup(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    source_type: str
    credits_used: int
    entry_count: int


class CreditUsageSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    tenant_id: str
    from_date: date
    to_date: date
    total_credits_used: int
    groups: list[CreditUsageGroup]


class CreditUsageRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    id: str
    tenant_id: str
    credits_used: int
    balance_after: int
    source_type: str
    source_id: str | None = None
    description: str
    created_at: datetime | str


class CreditMutationResult(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    request: CreditRequestRead
    ledger_entry: CreditLedgerRead


