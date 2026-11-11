"""One list of everything worth gifting for: recipient dates (birthdays, anniversaries, other events) and company occasions.

Read-only and additive. Each row carries its planning status (derived by ``planning.py``), its budget, and the gift
requests that came from it, so the Occasions page can filter, sort, count and act without any further calls.
"""

from collections import Counter
from datetime import date, timedelta
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field
from supabase import Client

from src.core.concurrency import run_parallel
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.schema import to_camel
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.occasions.planning import PlanningStatus, lead_request_id, needs_attention, planning_status, priority_score
from src.modules.tenants.service import tenant_service

MAX_RANGE_DAYS = 366
PRIORITY_RANK = {"VIP": 0, "HIGH": 1, "NORMAL": 2}
SORTS = ("soonest", "priority", "name")
# The tab a status is counted under. "Awaiting approval" is a request the client still has to approve: still a submitted request.
TAB_OF = {
    PlanningStatus.NOT_PLANNED: "NOT_PLANNED",
    PlanningStatus.BUDGET_ALLOCATED: "BUDGET_ALLOCATED",
    PlanningStatus.REQUEST_SUBMITTED: "REQUEST_SUBMITTED",
    PlanningStatus.AWAITING_APPROVAL: "REQUEST_SUBMITTED",
    PlanningStatus.IN_PROGRESS: "IN_PROGRESS",
    PlanningStatus.DELIVERED: "DELIVERED",
}
OVERVIEW_TABS = tuple(dict.fromkeys(TAB_OF.values()))


class OpenRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    request_code: str | None = None
    status: str
    recipient_id: str | None = None


class OccasionOverviewItem(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    key: str
    source_type: Literal["RECIPIENT", "COMPANY"]
    kind: Literal["BIRTHDAY", "ANNIVERSARY", "WORK_ANNIVERSARY", "EVENT", "FESTIVAL", "COMPANY_EVENT"]
    label: str  # what the date is: Birthday, Festival, Annual Event ...
    name: str  # the recipient's name, or the company occasion's name
    date: date
    source_date: date | None = None  # the date as saved; a repeating occasion is shown on later dates too
    days_away: int
    status: PlanningStatus
    tab: str
    priority: Literal["NORMAL", "HIGH", "VIP"] = "NORMAL"
    repeat_annually: bool = False
    notes: str | None = None
    description: str | None = None
    recipient_id: str | None = None
    recipient_avatar_url: str | None = None
    relationship: str | None = None
    event_id: str | None = None
    occasion_id: str | None = None
    is_global: bool = False
    budget: float | None = None
    request_id: str | None = None  # the request to open: the one holding the status back
    requests: list[OpenRequest] = Field(default_factory=list)
    needs_attention: bool = False
    score: int = 0


class OccasionOverview(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    items: list[OccasionOverviewItem]
    counts: dict[str, int]
    pagination: PaginationMeta
    next_cursor: str | None = None
    date_from: date
    date_to: date


# ---- pure helpers (tested without a database) -------------------------------------------------

def _on_year(base: date, year: int) -> date:
    try:
        return base.replace(year=year)
    except ValueError:  # 29 Feb in a year without one
        return date(year, 2, 28)


def occurrences(base: date, repeat: bool, start: date, end: date) -> list[date]:
    """The dates ``base`` falls on inside [start, end]: once if it does not repeat, every year from its own year if it does."""
    if not repeat:
        return [base] if start <= base <= end else []
    found = (_on_year(base, year) for year in range(max(start.year, base.year), end.year + 1))
    return [when for when in found if start <= when <= end]


def sort_items(items: list[OccasionOverviewItem], sort: str) -> list[OccasionOverviewItem]:
    if sort == "priority":  # VIP first, then the most behind and closest, then date
        return sorted(items, key=lambda i: (PRIORITY_RANK[i.priority], -i.score, i.date, i.name.lower()))
    if sort == "name":
        return sorted(items, key=lambda i: (i.name.lower(), i.date))
    return sorted(items, key=lambda i: (i.date, i.name.lower()))


def tab_counts(items: list[OccasionOverviewItem]) -> dict[str, int]:
    counts = Counter(item.tab for item in items)
    return {"ALL": len(items), **{tab: counts[tab] for tab in OVERVIEW_TABS}}


def _recipient_kind(name: str, occasion_type: str | None) -> str:
    text = f"{occasion_type or ''} {name}".lower()
    if "work" in text and "anniversary" in text:
        return "WORK_ANNIVERSARY"
    if "birthday" in text:
        return "BIRTHDAY"
    if "anniversary" in text:
        return "ANNIVERSARY"
    return "EVENT"


# ---- service ----------------------------------------------------------------------------------

class OccasionOverviewService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def overview(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        date_from: date | None,
        date_to: date | None,
        days: int | None,
        q: str | None,
        tab: str,
        sort: str,
        page: int,
        limit: int,
    ) -> OccasionOverview:
        require_permission(actor, Permission.OCCASION_READ)
        tenant_service.require_access(tenant_id, actor)
        today = date.today()
        start = date_from or today
        end = date_to or start + timedelta(days=days or 90)
        if end < start:
            raise HTTPException(status_code=422, detail="The end date is before the start date.")
        if (end - start).days > MAX_RANGE_DAYS:
            raise HTTPException(status_code=422, detail=f"Choose a range of at most {MAX_RANGE_DAYS} days.")
        if tab != "ALL" and tab not in OVERVIEW_TABS:
            raise HTTPException(status_code=422, detail="Unknown status.")
        sort = sort if sort in SORTS else "soonest"

        items = self._build(tenant_id, start, end, today)
        if q and q.strip():
            needle = q.strip().lower()
            items = [i for i in items if needle in f"{i.name} {i.label} {i.relationship or ''}".lower()]
        counts = tab_counts(items)  # counts ignore the chosen tab so every tab always shows its own number
        if tab != "ALL":
            items = [i for i in items if i.tab == tab]
        items = sort_items(items, sort)
        total = len(items)
        window = items[(page - 1) * limit : page * limit]
        return OccasionOverview(
            items=window,
            counts=counts,
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
            date_from=start,
            date_to=end,
        )

    def _build(self, tenant_id: str, start: date, end: date, today: date) -> list[OccasionOverviewItem]:
        db = self.database
        events, recipients, occasions, requests, gifts, event_budgets, members, groups = run_parallel(
            lambda: db.table("events").select("*").eq("tenant_id", tenant_id).eq("is_active", True).limit(5000).execute().data or [],
            lambda: db.table("recipients").select("id,name,date_of_birth,anniversary_date,avatar_url").eq("tenant_id", tenant_id).is_("deleted_at", "null").limit(5000).execute().data or [],
            lambda: db.table("occasions").select("*").eq("is_active", True).or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}").limit(2000).execute().data or [],
            lambda: db.table("gift_requests").select("id,request_code,event_id,occasion_id,recipient_id,status,requested_budget,requested_credits,relationship,created_at").eq("tenant_id", tenant_id).neq("status", "CANCELLED").order("created_at", desc=True).limit(5000).execute().data or [],
            lambda: db.table("gifts").select("request_id,status").eq("tenant_id", tenant_id).not_.is_("request_id", "null").limit(10000).execute().data or [],
            lambda: db.table("event_spend_budgets").select("event_id,budget_credits").eq("tenant_id", tenant_id).limit(5000).execute().data or [],
            lambda: db.table("occasion_budget_members").select("occasion_id,recipient_id,group_allocation_id,individual_budget_credits").eq("tenant_id", tenant_id).limit(10000).execute().data or [],
            lambda: db.table("occasion_budget_groups").select("id,budget_mode,budget_credits").eq("tenant_id", tenant_id).limit(5000).execute().data or [],
        )

        by_recipient = {row["id"]: row for row in recipients}
        relationship_of: dict[str, str] = {}
        for row in requests:  # newest first, so the first one seen is the latest
            if row.get("recipient_id") and row.get("relationship"):
                relationship_of.setdefault(row["recipient_id"], row["relationship"])
        requests_by_event: dict[str, list[dict]] = {}
        requests_by_occasion: dict[str, list[dict]] = {}
        for row in requests:
            if row.get("event_id"):
                requests_by_event.setdefault(row["event_id"], []).append(row)
            if row.get("occasion_id"):
                requests_by_occasion.setdefault(row["occasion_id"], []).append(row)
        gift_states: dict[str, list[str]] = {}
        for row in gifts:
            gift_states.setdefault(row["request_id"], []).append(row["status"])
        event_budget = {row["event_id"]: row["budget_credits"] for row in event_budgets}
        group_budget = {row["id"]: row for row in groups}
        occasion_budget: dict[str, int] = {}
        for row in members:
            group = group_budget.get(row.get("group_allocation_id"))
            share = row.get("individual_budget_credits") or (group["budget_credits"] if group and group["budget_mode"] == "PER_RECIPIENT" else 0)
            occasion_budget[row["occasion_id"]] = occasion_budget.get(row["occasion_id"], 0) + (share or 0)
        shared_pools: dict[str, set[str]] = {}
        for row in members:
            group = group_budget.get(row.get("group_allocation_id"))
            if group and group["budget_mode"] == "SHARED_POOL":
                shared_pools.setdefault(row["occasion_id"], set()).add(group["id"])
        for occasion_id, pool_ids in shared_pools.items():
            occasion_budget[occasion_id] = occasion_budget.get(occasion_id, 0) + sum(group_budget[i]["budget_credits"] for i in pool_ids)
        occasions_with_budget = {row["occasion_id"] for row in members}

        def finish(base: dict[str, Any], *, linked: list[dict], has_budget: bool, budget: float | None) -> OccasionOverviewItem:
            states = [(row["status"], gift_states.get(row["id"], [])) for row in linked]
            status = planning_status(has_budget=has_budget, requests=states)
            days_away = (base["date"] - today).days
            spent = sum(float(row.get("requested_budget") or row.get("requested_credits") or 0) for row in linked)
            lead = lead_request_id([(row["id"], row["status"], gift_states.get(row["id"], [])) for row in linked])
            return OccasionOverviewItem(
                **base,
                days_away=days_away,
                status=status,
                tab=TAB_OF[status],
                budget=(spent or budget) or None,
                request_id=lead or (linked[0]["id"] if linked else None),
                requests=[OpenRequest(id=row["id"], request_code=row.get("request_code"), status=row["status"], recipient_id=row.get("recipient_id")) for row in linked],
                needs_attention=needs_attention(status, days_away),
                score=priority_score(status, days_away),
            )

        out: list[OccasionOverviewItem] = []
        taken: set[tuple[str, str, date]] = set()  # (recipient, kind, date) already shown from an event record

        for row in events:
            recipient_id = row.get("recipient_id")
            if not recipient_id or recipient_id not in by_recipient:
                continue  # an event with no person cannot start a request
            kind = _recipient_kind(row["event_name"], row.get("occasion_type"))
            # A birthday or anniversary event always comes back every year; other events only when asked to.
            repeat = bool(row.get("repeat_annually")) or kind in ("BIRTHDAY", "ANNIVERSARY", "WORK_ANNIVERSARY")
            who = by_recipient[recipient_id]
            for when in occurrences(date.fromisoformat(str(row["event_date"])), repeat, start, end):
                taken.add((recipient_id, kind, when))
                is_original = str(row["event_date"]) == when.isoformat()  # only the saved date carries the request and budget
                out.append(finish(
                    {
                        "key": f"event:{row['id']}:{when}", "source_type": "RECIPIENT", "kind": kind,
                        "label": row.get("occasion_type") or ("Birthday" if kind == "BIRTHDAY" else "Anniversary" if kind == "ANNIVERSARY" else row["event_name"]),
                        "name": who.get("name") or "Unnamed", "date": when, "priority": row.get("priority") or "NORMAL",
                        "repeat_annually": repeat, "notes": row.get("notes"), "description": row.get("description"),
                        "recipient_id": recipient_id, "recipient_avatar_url": who.get("avatar_url"),
                        "relationship": row.get("relationship") or relationship_of.get(recipient_id),
                        "event_id": row["id"], "source_date": row["event_date"],
                    },
                    linked=requests_by_event.get(row["id"], []) if is_original else [],
                    has_budget=is_original and row["id"] in event_budget,
                    budget=float(event_budget[row["id"]]) if is_original and row["id"] in event_budget else None,
                ))

        for recipient_id, who in by_recipient.items():
            for field, kind, label in (("date_of_birth", "BIRTHDAY", "Birthday"), ("anniversary_date", "ANNIVERSARY", "Anniversary")):
                raw = who.get(field)
                if not raw:
                    continue
                for when in occurrences(date.fromisoformat(str(raw)), True, start, end):
                    if (recipient_id, kind, when) in taken:
                        continue
                    out.append(finish(
                        {
                            "key": f"{kind.lower()}:{recipient_id}:{when}", "source_type": "RECIPIENT", "kind": kind, "label": label,
                            "name": who.get("name") or "Unnamed", "date": when, "repeat_annually": True,
                            "recipient_id": recipient_id, "recipient_avatar_url": who.get("avatar_url"),
                            "relationship": relationship_of.get(recipient_id),
                        },
                        linked=[], has_budget=False, budget=None,
                    ))

        for row in occasions:
            raw = row.get("occasion_date")
            if not raw:
                continue  # legacy rows were never given a date
            is_global = row.get("tenant_id") is None
            repeat = bool(row.get("repeat_annually"))
            for when in occurrences(date.fromisoformat(str(raw)), repeat, start, end):
                is_original = str(raw) == when.isoformat()
                out.append(finish(
                    {
                        "key": f"occasion:{row['id']}:{when}", "source_type": "COMPANY",
                        "kind": "FESTIVAL" if is_global else "COMPANY_EVENT",
                        "label": row.get("category") or ("Festival" if is_global else "Company Event"),
                        "name": row["occasion_name"], "date": when, "priority": row.get("priority") or "NORMAL",
                        "repeat_annually": repeat, "notes": row.get("notes"), "description": row.get("description"),
                        "occasion_id": row["id"], "is_global": is_global, "source_date": raw,
                    },
                    linked=requests_by_occasion.get(row["id"], []) if is_original else [],
                    has_budget=is_original and row["id"] in occasions_with_budget,
                    budget=float(occasion_budget.get(row["id"], 0)) if is_original else None,
                ))
        return out


occasion_overview_service = OccasionOverviewService()
