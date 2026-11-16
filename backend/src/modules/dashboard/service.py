"""The dashboard's data, built on the occasions overview so a date means the same thing everywhere."""

import calendar
import re
from datetime import date, timedelta

from fastapi import HTTPException
from supabase import Client

from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.dashboard.schemas import (
    ActionItem, ActionRequired, CalendarItem, CalendarResponse, Category, DashboardSummary, PersonCard,
)
from src.modules.occasions.overview import OccasionOverviewItem, occasion_overview_service
from src.modules.occasions.planning import PlanningStatus
from src.modules.tenants.service import tenant_service

# Who counts as outside the company (clients and business associates) or inside it (the team).
EXTERNAL = frozenset({"CLIENT", "PARTNER", "ADVISOR", "VENDOR"})
INTERNAL = frozenset({"EMPLOYEE"})
PEOPLE_WINDOW_DAYS = 60
ADDRESS_WINDOW_DAYS = 30
MAX_PEOPLE = 5
MAX_ACTIONS = 6
_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
# A person's date: a birthday or anniversary the team can gift for (not a company festival).
PERSON_KINDS = frozenset({"BIRTHDAY", "ANNIVERSARY", "WORK_ANNIVERSARY"})


def category_of(item: OccasionOverviewItem, relationship: str | None) -> Category:
    if item.source_type == "COMPANY":
        return "COMPANY"
    if relationship in EXTERNAL:
        return "EXTERNAL"
    if relationship in INTERNAL:
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
            self.database.table("recipients").select("id,relationship,designation,address")
            .eq("tenant_id", tenant_id).is_("deleted_at", "null").limit(5000).execute().data or []
        )
        return {str(row["id"]): row for row in rows}

    def calendar(self, tenant_id: str, actor: UserProfileResponse, *, month: str, category: str) -> CalendarResponse:
        self._context(tenant_id, actor)
        start, end = month_range(month)
        facts = self._recipient_facts(tenant_id)
        items = occasion_overview_service._build(tenant_id, start, end, date.today())  # noqa: SLF001 - same module family
        entries = [
            CalendarItem(
                key=item.key, date=item.date, title=item.name, label=item.label, kind=item.kind,
                category=category_of(item, (facts.get(item.recipient_id or "") or {}).get("relationship")),
                recipient_id=item.recipient_id, occasion_id=item.occasion_id, event_id=item.event_id,
            )
            for item in items
        ]
        entries.sort(key=lambda entry: (entry.date, entry.title.lower()))
        counts = {"ALL": len(entries), **{name: sum(1 for e in entries if e.category == name) for name in ("EXTERNAL", "INTERNAL", "COMPANY")}}
        shown = entries if category == "ALL" else [entry for entry in entries if entry.category == category]
        return CalendarResponse(month=month, date_from=start, date_to=end, items=shown, counts=counts)

    def summary(self, tenant_id: str, actor: UserProfileResponse) -> DashboardSummary:
        self._context(tenant_id, actor)
        today = date.today()
        facts = self._recipient_facts(tenant_id)
        items = occasion_overview_service._build(tenant_id, today, today + timedelta(days=PEOPLE_WINDOW_DAYS), today)  # noqa: SLF001
        items.sort(key=lambda item: (item.date, item.name.lower()))

        people: dict[str, list[PersonCard]] = {"EXTERNAL": [], "INTERNAL": []}
        seen: set[tuple[str, str]] = set()
        actions: list[ActionItem] = []
        for item in items:
            fact = facts.get(item.recipient_id or "") or {}
            group = category_of(item, fact.get("relationship"))
            if item.recipient_id and item.kind in PERSON_KINDS and group in people and len(people[group]) < MAX_PEOPLE and (item.recipient_id, item.kind) not in seen:
                seen.add((item.recipient_id, item.kind))
                people[group].append(PersonCard(
                    recipient_id=item.recipient_id, name=item.name, avatar_url=item.recipient_avatar_url, designation=fact.get("designation"),
                    label=item.label, kind=item.kind, date=item.date, days_away=item.days_away,
                ))
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
        return DashboardSummary(
            important_external=people["EXTERNAL"], important_internal=people["INTERNAL"],
            action_required=ActionRequired(total=len(actions), items=actions[:MAX_ACTIONS]),
        )


dashboard_service = DashboardService()
