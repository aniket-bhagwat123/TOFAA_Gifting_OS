"""Request and response shapes for dashboard banners (a banner is just a 1000 x 90 picture)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel

Audience = Literal["ALL", "CLIENT", "STAFF"]


class BannerCreate(BaseModel):
    """Settings sent as query parameters alongside the uploaded picture."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    audience: Audience = "ALL"
    sort_order: int = Field(default=0, ge=0, le=9999)
    is_active: bool = True
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _dates(self) -> "BannerCreate":
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("The end date is before the start date.")
        return self


class BannerUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    audience: Audience | None = None
    sort_order: int | None = Field(default=None, ge=0, le=9999)
    is_active: bool | None = None
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _patch(self) -> "BannerUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one banner field must be provided")
        for name in ("audience", "sort_order", "is_active"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("The end date is before the start date.")
        return self


class BannerRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    audience: Audience
    image_url: str
    sort_order: int = 0
    is_active: bool = True
    starts_on: date | None = None
    ends_on: date | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BannerList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[BannerRead]
    pagination: PaginationMeta
    next_cursor: str | None = None
