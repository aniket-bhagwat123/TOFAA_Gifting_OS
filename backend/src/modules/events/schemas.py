"""Request and response schemas for tenant and recipient events."""

from datetime import date, datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.pagination import PaginationMeta
from src.core.schema import to_camel


Priority = Literal["NORMAL", "HIGH", "VIP"]


class EventCreate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    event_name: str = Field(min_length=1, max_length=150)
    event_date: date
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool = True
    occasion_type: str | None = Field(default=None, min_length=1, max_length=60)
    relationship: str | None = Field(default=None, min_length=1, max_length=60)
    repeat_annually: bool | None = None
    priority: Priority | None = None
    notes: str | None = Field(default=None, max_length=2000)


class EventUpdate(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    event_name: str | None = Field(default=None, min_length=1, max_length=150)
    event_date: date | None = None
    recipient_id: UUID | None = None
    description: str | None = Field(default=None, max_length=2000)
    is_active: bool | None = None
    occasion_type: str | None = Field(default=None, min_length=1, max_length=60)
    relationship: str | None = Field(default=None, min_length=1, max_length=60)
    repeat_annually: bool | None = None
    priority: Priority | None = None
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_patch(self) -> "EventUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one event field must be provided")
        for field in ("event_name", "event_date", "is_active", "repeat_annually", "priority"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class EventRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    tenant_id: str
    recipient_id: str | None = None
    event_name: str
    event_date: date
    description: str | None = None
    is_active: bool
    occasion_type: str | None = None
    relationship: str | None = None
    repeat_annually: bool = False
    priority: Priority = "NORMAL"
    notes: str | None = None
    created_by_user_id: str | None = None
    created_at: datetime | str
    updated_at: datetime | str


class EventList(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[EventRead]
    pagination: PaginationMeta
    next_cursor: str | None = Field(default=None)
