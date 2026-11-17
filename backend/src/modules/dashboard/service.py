"""The dashboard's data, built on the occasions overview so a date means the same thing everywhere."""

import calendar
import re
from datetime import date, timedelta

from fastapi import HTTPException
from supabase import Client

from src.core.concurrency import run_parallel
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.dashboard.schemas import (
    ActionItem, ActionRequired, CalendarItem, CalendarResponse, Category, DashboardOverview, DashboardSummary, PersonCard, UpcomingPeople,
)
from src.modules.occasions.overview import OccasionOverviewItem, occasion_overview_service
from src.modules.occasions.planning import PlanningStatus
from src.modules.tenants.service import tenant_service

# Who counts as outside the company (clients and business associates) or inside it (the team).
EXTERNAL = frozenset({"CLIENT", "PARTNER", "ADVISOR", "VENDOR"})
INTERNAL = frozenset({"EMPLOYEE"})
# The recipient type from the Add Recipient form (BUSINESS and INDIVIDUAL are the old names).
EXTERNAL_TYPES = frozenset({"EXTERNAL", "BUSINESS"})
INTERNAL_TYPES = frozenset({"INTERNAL", "INDIVIDUAL"})
PEOPLE_WINDOW_DAYS = 60
ADDRESS_WINDOW_DAYS = 30
MAX_PEOPLE = 5
MAX_ACTIONS = 6
_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
# A person's date: a birthday or anniversary the team can gift for (not a company festival).
PERSON_KINDS = frozenset({"BIRTHDAY", "ANNIVERSARY", "WORK_ANNIVERSARY"})


def category_of(item: OccasionOverviewItem, fact: dict | str | None) -> Category:
    """Which dashboard group a date belongs to: company occasions, then the person's relationship, then their External / Internal type.

    `fact` is the recipient's row (a bare relationship string is accepted too). The relationship wins when one is set, because older
    recipients have one; recipients added now have only the External / Internal type.
    """
    if item.source_type == "COMPANY":
        return "COMPANY"
    relationship, kind = (fact, None) if isinstance(fact, str) or fact is None else (fact.get("relationship"), fact.get("recipient_type"))
    if relationship in EXTERNAL:
        return "EXTERNAL"
    if relationship in INTERNAL:
        return "INTERNAL"
    if kind in EXTERNAL_TYPES:
        return "EXTERNAL"
    if kind in INTERNAL_TYPES:
        return "INTERNAL"
    return "OTHER"


def month_range(month: str) -> tuple[date, date]:
    if not _MONTH.match(month):
        raise HTTPException(status_code=422, detail="Month must look like 2026-11.")
    year, number = int(month[:4]), int(month[5:])
    return date(year, number, 1), date(year, number, calendar.monthrange(year, number)[1])


def has_address(address: dict | None) -> bool:
    return bool(address and str(address.get("addressLine1") or address.get("address_line1") or "").strip())


class DashboardService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def _context(self, tenant_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.OCCASION_READ)
        tenant_service.require_access(tenant_id, actor)

    def _recipient_facts(self, tenant_id: str) -> dict[str, dict]:
        rows = (
            self.database.table("recipients").select("id,relationship,recipient_type,designation,address")
            .eq("tenant_id", tenant_id).is_("deleted_at", "null").limit(5000).execute().data or []
        )
        return {str(row["id"]): row for row in rows}

    def _gather(self, tenant_id: str, start: date, end: date) -> tuple[dict[str, dict], list[OccasionOverviewItem]]:
        """The recipients' facts and every dated item in the range, fetched side by side (the occasion build runs its own queries in parallel too).
        Nothing is looked up per person afterwards: the facts are one dictionary, so a dashboard costs a fixed number of queries."""
        facts, items = run_parallel(
            lambda: self._recipient_facts(tenant_id),
            lambda: occasion_overview_service._build(tenant_id, start, end, date.today()),  # noqa: SLF001 - same module family
        )
        return facts, items

    # ---- pieces built from the gathered data
    @staticmethod
    def _calendar(items: list[OccasionOverviewItem], facts: dict[str, dict], *, month: str, start: date, end: date, category: str) -> CalendarResponse:
        entries = [
            CalendarItem(
                key=item.key, date=item.date, title=item.name, label=item.label, kind=item.kind,
                category=category_of(item, facts.get(item.recipient_id or "")),
                recipient_id=item.recipient_id, occasion_id=item.occasion_id, event_id=item.event_id,
            )
            for item in items if start <= item.date <= end
        ]
        entries.sort(key=lambda entry: (entry.date, entry.title.lower()))
        counts = {"ALL": len(entries), **{name: sum(1 for e in entries if e.category == name) for name in ("EXTERNAL", "INTERNAL", "COMPANY")}}
        shown = entries if category == "ALL" else [entry for entry in entries if entry.category == category]
        return CalendarResponse(month=month, date_from=start, date_to=end, items=shown, counts=counts)

    @staticmethod
    def _people(items: list[OccasionOverviewItem], facts: dict[str, dict], *, limit: int) -> dict[str, list[PersonCard]]:
        """The nearest birthdays and anniversaries, once per person and kind, for each of External and Internal."""
        people: dict[str, list[PersonCard]] = {"EXTERNAL": [], "INTERNAL": []}
        seen: set[tuple[str, str]] = set()
        for item in sorted(items, key=lambda i: (i.date, i.name.lower())):
            fact = facts.get(item.recipient_id or "") or {}
            group = category_of(item, fact)
            if item.recipient_id and item.kind in PERSON_KINDS and group in people and len(people[group]) < limit and (item.recipient_id, item.kind) not in seen:
                seen.add((item.recipient_id, item.kind))
                people[group].append(PersonCard(
                    recipient_id=item.recipient_id, name=item.name, avatar_url=item.recipient_avatar_url, designation=fact.get("designation"),
                    label=item.label, kind=item.kind, date=item.date, days_away=item.days_away,
                ))
        return people

    @staticmethod
    def _actions(items: list[OccasionOverviewItem], facts: dict[str, dict]) -> ActionRequired:
        actions: list[ActionItem] = []
        for item in sorted(items, key=lambda i: (i.date, i.name.lower())):
            fact = facts.get(item.recipient_id or "") or {}
            if item.status == PlanningStatus.AWAITING_APPROVAL:
                actions.append(ActionItem(
                    key=f"proposal:{item.key}", kind="PROPOSAL_REVIEW", title=f"{item.name} – {item.label} Gift",
                    description="TOFAA has shared a proposal. Please review.", request_id=item.request_id, recipient_id=item.recipient_id,
                ))
            elif item.recipient_id and item.days_away <= ADDRESS_WINDOW_DAYS and not has_address(fact.get("address")):
                actions.append(ActionItem(
                    key=f"address:{item.key}", kind="ADDRESS_MISSING", title=f"{item.name} – {item.label}",
                    description="Delivery address is missing.", recipient_id=item.recipient_id,
                ))
        # Proposals first (someone is waiting on the client), then the nearest missing addresses.
        actions.sort(key=lambda action: action.kind != "PROPOSAL_REVIEW")
        return ActionRequired(total=len(actions), items=actions[:MAX_ACTIONS])

    # ---- endpoints
    def calendar(self, tenant_id: str, actor: UserProfileResponse, *, month: str, category: str) -> CalendarResponse:
        self._context(tenant_id, actor)
        start, end = month_range(month)
        facts, items = self._gather(tenant_id, start, end)
        return self._calendar(items, facts, month=month, start=start, end=end, category=category)

    def upcoming_people(self, tenant_id: str, actor: UserProfileResponse, *, category: str, limit: int, days: int) -> UpcomingPeople:
        self._context(tenant_id, actor)
        today = date.today()
        facts, items = self._gather(tenant_id, today, today + timedelta(days=days))
        people = self._people(items, facts, limit=limit)
        return UpcomingPeople(
            external=people["EXTERNAL"] if category in ("ALL", "EXTERNAL") else [],
            internal=people["INTERNAL"] if category in ("ALL", "INTERNAL") else [],
        )

    def summary(self, tenant_id: str, actor: UserProfileResponse) -> DashboardSummary:
        self._context(tenant_id, actor)
        today = date.today()
        facts, items = self._gather(tenant_id, today, today + timedelta(days=PEOPLE_WINDOW_DAYS))
        return self._summary(items, facts)

    def _summary(self, items: list[OccasionOverviewItem], facts: dict[str, dict]) -> DashboardSummary:
        people = self._people(items, facts, limit=MAX_PEOPLE)
        return DashboardSummary(important_external=people["EXTERNAL"], important_internal=people["INTERNAL"], action_required=self._actions(items, facts))

    def overview(self, tenant_id: str, actor: UserProfileResponse, *, month: str, category: str) -> DashboardOverview:
        """Everything the home page needs in one request: the month calendar, the upcoming people and what needs action.
        One pass over the data covers the month and the next 60 days, so the page does not pay for it twice."""
        self._context(tenant_id, actor)
        start, end = month_range(month)
        today = date.today()
        window_end = today + timedelta(days=PEOPLE_WINDOW_DAYS)
        facts, items = self._gather(tenant_id, min(start, today), max(end, window_end))
        upcoming = [item for item in items if today <= item.date <= window_end]
        return DashboardOverview(
            calendar=self._calendar(items, facts, month=month, start=start, end=end, category=category),
            summary=self._summary(upcoming, facts),
        )


dashboard_service = DashboardService()
