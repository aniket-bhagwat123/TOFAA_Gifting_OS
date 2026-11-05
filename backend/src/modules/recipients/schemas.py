"""Recipient request and response DTOs."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


class RecipientAddress(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    address_line1: str = Field(min_length=3, max_length=300)
    address_line2: str | None = Field(default=None, max_length=300)
    city: str = Field(min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str = Field(pattern=r"^[0-9]{6}$")
    country: str = Field(default="IN", min_length=2, max_length=2, pattern=r"^[A-Z]{2}$")


class RecipientCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    name: str = Field(min_length=1, max_length=200)
    mobile_number: str = Field(pattern=r"^\+?[1-9][0-9]{7,14}$")
    address: RecipientAddress
    date_of_birth: date
    anniversary_date: date | None = None
    # Set later, when the recipient is edited.
    budget: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
        description="Per-gifting-occasion budget in INR.",
    )
    remark: str | None = Field(default=None, max_length=2000)

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_cannot_be_future(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return value


class RecipientUpdate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        alias_generator=to_camel,
        populate_by_name=True,
        str_strip_whitespace=True,
    )

    name: str | None = Field(default=None, min_length=1, max_length=200)
    mobile_number: str | None = Field(default=None, pattern=r"^\+?[1-9][0-9]{7,14}$")
    address: RecipientAddress | None = None
    date_of_birth: date | None = None
    anniversary_date: date | None = None
    budget: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    remark: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_patch(self) -> "RecipientUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one recipient field must be provided")
        required_fields = {"name", "mobile_number", "address", "date_of_birth", "budget"}
        if any(field in self.model_fields_set and getattr(self, field) is None for field in required_fields):
            raise ValueError("Required recipient fields cannot be null")
        return self

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_cannot_be_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return value


class RecipientRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    # Required on new writes; nullable here only for old rows awaiting data cleanup.
    name: str | None = None
    mobile_number: str
    address: RecipientAddress | None = None
    date_of_birth: date | None = None
    anniversary_date: date | None = None
    budget: Decimal | None = None
    remark: str | None = None


class RecipientList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[RecipientRead]
    pagination: PaginationMeta
    next_cursor: str | None = Field(
        default=None,
        description="Next page query values (page and limit), or null when there is no next page.",
    )
