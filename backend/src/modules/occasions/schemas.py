"""Request and response schemas for tenant occasions."""

from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


class OccasionCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    occasion_name: str = Field(min_length=1, max_length=150)
    occasion_date: date
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool = True


class OccasionUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    occasion_name: str | None = Field(default=None, min_length=1, max_length=150)
    occasion_date: date | None = None
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_patch(self) -> "OccasionUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one occasion field must be provided")
        for field in ("occasion_name", "occasion_date", "is_active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class OccasionRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str | None = None
    occasion_name: str
    occasion_date: date | None = None
    description: str | None = None
    is_active: bool
    created_by_user_id: str | None = None
    created_at: datetime | str
    updated_at: datetime | str


class OccasionList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[OccasionRead]
    pagination: PaginationMeta
    next_cursor: str | None = Field(default=None)


class UpcomingOccasion(BaseModel):
    """An occasion coming up soon, with how many gift requests this client already sent for it."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    occasion_name: str
    occasion_date: date
    description: str | None = None
    days_away: int
    is_global: bool  # created by TOFAA for every client, e.g. Diwali
    requests_sent: int
