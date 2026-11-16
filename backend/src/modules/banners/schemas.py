"""Request and response shapes for dashboard banners."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel

Placement = Literal["INSIGHT", "NOTE"]
Audience = Literal["ALL", "CLIENT", "STAFF"]


def _link(value: str | None, *, https_only: bool = False) -> str | None:
    """A banner link is an in-app path or an https address; anything else (javascript:, data:) is refused."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    ok = value.startswith("https://") if https_only else (value.startswith("/") and not value.startswith("//")) or value.startswith("https://")
    if not ok:
        raise ValueError("Use an https:// address" + ("" if https_only else " or a path starting with /") + ".")
    return value


class _BannerFields(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    @field_validator("cta_url", check_fields=False)
    @classmethod
    def _cta(cls, value: str | None) -> str | None:
        return _link(value)

    @field_validator("image_url", check_fields=False)
    @classmethod
    def _image(cls, value: str | None) -> str | None:
        return _link(value, https_only=True)


class BannerCreate(_BannerFields):
    placement: Placement = "INSIGHT"
    audience: Audience = "ALL"
    eyebrow: str | None = Field(default=None, min_length=1, max_length=60)
    title: str = Field(min_length=1, max_length=160)
    body: str | None = Field(default=None, max_length=500)
    cta_label: str | None = Field(default=None, min_length=1, max_length=40)
    cta_url: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=1000)
    sort_order: int = Field(default=0, ge=0, le=9999)
    is_active: bool = True
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _dates(self) -> "BannerCreate":
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("The end date is before the start date.")
        return self


class BannerUpdate(_BannerFields):
    placement: Placement | None = None
    audience: Audience | None = None
    eyebrow: str | None = Field(default=None, min_length=1, max_length=60)
    title: str | None = Field(default=None, min_length=1, max_length=160)
    body: str | None = Field(default=None, max_length=500)
    cta_label: str | None = Field(default=None, min_length=1, max_length=40)
    cta_url: str | None = Field(default=None, max_length=500)
    image_url: str | None = Field(default=None, max_length=1000)
    sort_order: int | None = Field(default=None, ge=0, le=9999)
    is_active: bool | None = None
    starts_on: date | None = None
    ends_on: date | None = None

    @model_validator(mode="after")
    def _patch(self) -> "BannerUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one banner field must be provided")
        for name in ("placement", "audience", "title", "sort_order", "is_active"):
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be null")
        if self.starts_on and self.ends_on and self.ends_on < self.starts_on:
            raise ValueError("The end date is before the start date.")
        return self


class BannerRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    placement: Placement
    audience: Audience
    eyebrow: str | None = None
    title: str
    body: str | None = None
    cta_label: str | None = None
    cta_url: str | None = None
    image_url: str | None = None
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
