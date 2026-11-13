"""Recipient request and response DTOs."""

from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


Relationship = Literal["CLIENT", "EMPLOYEE", "PARTNER", "ADVISOR", "VENDOR", "FAMILY", "SPOUSE", "CHILD", "PARENT", "SIBLING", "FRIEND", "OTHER"]
RecipientStatus = Literal["ACTIVE", "ARCHIVED"]
RecipientType = Literal["INDIVIDUAL", "BUSINESS"]
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


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
    mobile_number: str | None = Field(default=None, pattern=r"^\+?[1-9][0-9]{7,14}$")
    address: RecipientAddress | None = None
    date_of_birth: date | None = None
    anniversary_date: date | None = None
    email: str | None = Field(default=None, max_length=254, pattern=EMAIL_PATTERN)
    company: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    recipient_type: RecipientType = "INDIVIDUAL"
    # Skip the "this person may already exist" check after the user has seen the possible matches.
    allow_duplicate: bool = False
    # Set later, when the recipient is edited.
    budget: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=12,
        decimal_places=2,
        description="Per-gifting-occasion budget in INR.",
    )
    remark: str | None = Field(default=None, max_length=2000)
    relationship: Relationship | None = None
    designation: str | None = Field(default=None, max_length=120)
    is_primary: bool = False

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_cannot_be_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
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
    relationship: Relationship | None = None
    designation: str | None = Field(default=None, max_length=120)
    status: RecipientStatus | None = None
    is_primary: bool | None = None
    email: str | None = Field(default=None, max_length=254, pattern=EMAIL_PATTERN)
    company: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    recipient_type: RecipientType | None = None
    # The version the editor started from. If someone saved in the meantime the API answers 409 instead of overwriting.
    version: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_patch(self) -> "RecipientUpdate":
        if not self.model_fields_set - {"version"}:
            raise ValueError("At least one recipient field must be provided")
        required_fields = {"name", "address", "date_of_birth", "budget", "status", "is_primary", "recipient_type", "version"}
        if any(field in self.model_fields_set and getattr(self, field) is None for field in required_fields):
            raise ValueError("Required recipient fields cannot be null")
        return self

    @field_validator("date_of_birth")
    @classmethod
    def date_of_birth_cannot_be_future(cls, value: date | None) -> date | None:
        if value is not None and value > date.today():
            raise ValueError("date_of_birth cannot be in the future")
        return value


class NextOccasion(BaseModel):
    """The soonest birthday or anniversary, worked out from the saved dates."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    kind: Literal["BIRTHDAY", "ANNIVERSARY"]
    label: str
    date: date
    days_away: int


class GroupRef(BaseModel):
    """A recipient group a person belongs to, as shown beside their name."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    name: str


class RecipientRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    # Required on new writes; nullable here only for old rows awaiting data cleanup.
    name: str | None = None
    mobile_number: str | None = None
    address: RecipientAddress | None = None
    date_of_birth: date | None = None
    anniversary_date: date | None = None
    budget: Decimal | None = None
    remark: str | None = None
    avatar_url: str | None = None
    relationship: str | None = None
    designation: str | None = None
    status: str = "ACTIVE"
    is_primary: bool = False
    email: str | None = None
    company: str | None = None
    city: str | None = None
    recipient_type: str = "INDIVIDUAL"
    version: int = 1
    next_occasion: NextOccasion | None = None
    completeness: dict | None = None
    # Filled in on the list only.
    groups: list[GroupRef] = Field(default_factory=list)


class RecipientSummary(BaseModel):
    """Counts and filter choices for the recipients page."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    total: int
    active: int
    archived: int
    cities: list[str]
    relationships: list[str]


class RecipientList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[RecipientRead]
    pagination: PaginationMeta
    next_cursor: str | None = Field(
        default=None,
        description="Next page query values (page and limit), or null when there is no next page.",
    )
