"""Request and response shapes for gift ideas: an occasion, what to gift, and who to gift it to."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel

CATEGORIES = (
    "Festive", "Social & Family", "National & Wellness", "Corporate", "Professional Days", "Police & Armed Forces", "Seasonal Gifting",
    "Corporate Milestones", "Employee Life Events", "Client & Partner Moments", "Social & Personal", "PR & Brand Gifting",
)
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def date_text(start: date | None, end: date | None) -> str:
    """The date as people read it: "1 Jul", "13–18 Sep", "30 Sep – 8 Oct" or "No fixed date"."""
    if start is None:
        return "No fixed date"
    if end is None or end == start:
        return f"{start.day} {_MONTHS[start.month - 1]}"
    if (start.year, start.month) == (end.year, end.month):
        return f"{start.day}–{end.day} {_MONTHS[start.month - 1]}"
    return f"{start.day} {_MONTHS[start.month - 1]} – {end.day} {_MONTHS[end.month - 1]}"


class _Body(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True)


class GiftIdeaCreate(_Body):
    occasion: str = Field(min_length=1, max_length=150)
    gift_idea: str = Field(min_length=1, max_length=300)
    category: str | None = Field(default=None, min_length=1, max_length=60)
    gift_to: list[str] = Field(default_factory=list, max_length=20)
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _check(self) -> "GiftIdeaCreate":
        self.gift_to = [item.strip() for item in self.gift_to if item and item.strip()]
        if any(len(item) > 120 for item in self.gift_to):
            raise ValueError("Each 'gift to' entry must be under 120 characters.")
        if self.end_date and (self.start_date is None or self.end_date < self.start_date):
            raise ValueError("The end date must not be before the start date.")
        return self


class GiftIdeaUpdate(_Body):
    occasion: str | None = Field(default=None, min_length=1, max_length=150)
    gift_idea: str | None = Field(default=None, min_length=1, max_length=300)
    category: str | None = Field(default=None, min_length=1, max_length=60)
    gift_to: list[str] | None = Field(default=None, max_length=20)
    start_date: date | None = None
    end_date: date | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def _check(self) -> "GiftIdeaUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        for name in ("occasion", "gift_idea", "gift_to", "is_active"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        if self.gift_to is not None:
            self.gift_to = [item.strip() for item in self.gift_to if item and item.strip()]
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("The end date must not be before the start date.")
        return self


class GiftIdeaRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    occasion: str
    gift_idea: str
    category: str | None = None
    gift_to: list[str] = Field(default_factory=list)
    start_date: date | None = None
    end_date: date | None = None
    date_label: str | None = None
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class GiftIdeaList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[GiftIdeaRead]
    pagination: PaginationMeta
    next_cursor: str | None = None
