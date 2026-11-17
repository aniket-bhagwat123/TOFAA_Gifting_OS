"""Shapes for the dashboard: the month calendar and the summary cards."""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.core.schema import to_camel

Category = Literal["EXTERNAL", "INTERNAL", "COMPANY", "OTHER"]
CalendarFilter = Literal["ALL", "EXTERNAL", "INTERNAL", "COMPANY"]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class CalendarItem(_Camel):
    key: str
    date: date
    title: str  # the person, or the company occasion
    label: str  # Birthday, Anniversary, Diwali ...
    kind: str
    category: Category
    recipient_id: str | None = None
    occasion_id: str | None = None
    event_id: str | None = None


class CalendarResponse(_Camel):
    month: str  # YYYY-MM
    date_from: date
    date_to: date
    items: list[CalendarItem]
    counts: dict[str, int]


class PersonCard(_Camel):
    recipient_id: str
    name: str
    avatar_url: str | None = None
    designation: str | None = None
    label: str
    kind: str
    date: date
    days_away: int


class ActionItem(_Camel):
    key: str
    kind: Literal["PROPOSAL_REVIEW", "ADDRESS_MISSING"]
    title: str
    description: str
    request_id: str | None = None
    recipient_id: str | None = None


class ActionRequired(_Camel):
    total: int
    items: list[ActionItem]


class DashboardSummary(_Camel):
    important_external: list[PersonCard] = Field(default_factory=list)
    important_internal: list[PersonCard] = Field(default_factory=list)
    action_required: ActionRequired


class UpcomingPeople(_Camel):
    external: list[PersonCard] = Field(default_factory=list)
    internal: list[PersonCard] = Field(default_factory=list)


class DashboardOverview(_Camel):
    """The home page in one response."""

    calendar: CalendarResponse
    summary: DashboardSummary
