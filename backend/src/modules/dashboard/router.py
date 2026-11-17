"""Tenant dashboard endpoints: one call per card group, so the page loads in two requests."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Query

from src.modules.auth.dependencies import CurrentUserDep
from src.modules.dashboard.schemas import CalendarFilter, CalendarResponse, DashboardOverview, DashboardSummary, UpcomingPeople
from src.modules.dashboard.service import dashboard_service

router = APIRouter(tags=["Dashboard"])


@router.get("/tenants/{tenant_id}/dashboard/calendar", response_model=CalendarResponse)
def dashboard_calendar(
    tenant_id: UUID,
    actor: CurrentUserDep,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM; this month when left out")] = None,
    category: Annotated[CalendarFilter, Query()] = "ALL",
) -> CalendarResponse:
    """Everything worth gifting for in one month: birthdays, anniversaries and company occasions."""
    return dashboard_service.calendar(str(tenant_id), actor, month=month or date.today().strftime("%Y-%m"), category=category)


@router.get("/tenants/{tenant_id}/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(tenant_id: UUID, actor: CurrentUserDep) -> DashboardSummary:
    """Important people (external and internal) and what needs the client's action."""
    return dashboard_service.summary(str(tenant_id), actor)


@router.get("/tenants/{tenant_id}/dashboard/upcoming-people", response_model=UpcomingPeople)
def dashboard_upcoming_people(
    tenant_id: UUID,
    actor: CurrentUserDep,
    category: Annotated[Literal["ALL", "EXTERNAL", "INTERNAL"], Query()] = "ALL",
    limit: Annotated[int, Query(ge=1, le=50)] = 5,
    days: Annotated[int, Query(ge=1, le=366)] = 60,
) -> UpcomingPeople:
    """The nearest birthdays and anniversaries of External and Internal people (the type chosen when the recipient was added)."""
    return dashboard_service.upcoming_people(str(tenant_id), actor, category=category, limit=limit, days=days)


@router.get("/tenants/{tenant_id}/dashboard/overview", response_model=DashboardOverview)
def dashboard_overview(
    tenant_id: UUID,
    actor: CurrentUserDep,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", description="YYYY-MM; this month when left out")] = None,
    category: Annotated[CalendarFilter, Query()] = "ALL",
) -> DashboardOverview:
    """The month calendar, the upcoming People cards and the action list in one request, loaded in parallel."""
    return dashboard_service.overview(str(tenant_id), actor, month=month or date.today().strftime("%Y-%m"), category=category)
