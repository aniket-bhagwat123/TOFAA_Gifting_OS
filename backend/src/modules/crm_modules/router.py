"""Home, Gift Calendar, Gift Ideas, Events and Activity for TOFAA CRM (server to server, shared key, no signed-in user).

Every call is for one client, which the CRM has already checked its user may see. The same Gifting OS services as the
OS screens are used, so the same rules apply. Reading is always allowed; changing needs CRM_KAM_ACTIONS_ENABLED, and a
change is recorded in the client's activity under the CRM person's hidden Gifting OS identity.
"""

from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from src.core import audit
from src.core.concurrency import run_parallel
from src.core.config import settings
from src.core.schema import to_camel
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse
from src.modules.crm_gifting.actors import crm_actors
from src.modules.crm_gifting.planning import SWITCHED_OFF, crm_planning_service
from src.modules.crm_gifting.router import require_crm_key
from src.modules.dashboard.schemas import CalendarFilter
from src.modules.dashboard.service import dashboard_service
from src.modules.events.schemas import EventCreate, EventUpdate
from src.modules.events.service import event_service
from src.modules.gift_ideas.schemas import GiftIdeaCreate, GiftIdeaUpdate
from src.modules.gift_ideas.service import gift_idea_service
from src.modules.occasions.overview import occasion_overview_service
from src.modules.occasions.schemas import OccasionCreate, OccasionUpdate
from src.modules.occasions.service import occasion_service
from src.modules.tenants.service import tenant_service

router = APIRouter(
    prefix="/integrations/crm/modules", tags=["CRM integration"], include_in_schema=False,
    dependencies=[Depends(require_crm_key)],
)

# Reads only: it names nobody and is never saved. It passes the same staff checks a TOFAA team member would.
VIEWER = UserProfileResponse(
    id="00000000-0000-0000-0000-000000000000", email="crm-viewer@crm.invalid", full_name="TOFAA CRM", role=Role.KAM, is_active=True,
)


def _json(model: Any) -> Any:
    return model.model_dump(mode="json", by_alias=True)


def client(tenant_id: UUID) -> str:
    """A real client of Gifting OS (never TOFAA's internal tenant); anything else is "not found"."""
    tenant_service.require_context(str(tenant_id), VIEWER)
    return str(tenant_id)


Client = Annotated[str, Depends(client)]


class Actor(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    actor_id: UUID  # the signed-in CRM user
    actor_name: str = Field(min_length=1, max_length=100)


class OccasionWrite(Actor):
    occasion: OccasionCreate


class OccasionChange(Actor):
    changes: OccasionUpdate


class EventWrite(Actor):
    recipient_id: UUID
    event: EventCreate


class EventChange(Actor):
    changes: EventUpdate


class IdeaWrite(Actor):
    idea: GiftIdeaCreate


class IdeaChange(Actor):
    changes: GiftIdeaUpdate


def _writer(tenant_id: str, who: Actor) -> UserProfileResponse:
    """Everything is checked before the CRM person's identity is made or anything is written."""
    crm_planning_service._check_open(tenant_id)
    return crm_planning_service._actor(tenant_id, str(who.actor_id), who.actor_name)


# --- reading ----------------------------------------------------------------------------------------------------------

@router.get("/gift-ideas")
def gift_ideas(
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    search: Annotated[str | None, Query(max_length=100)] = None,
    include_hidden: Annotated[bool, Query(alias="includeHidden")] = False,
) -> dict:
    viewer = VIEWER.model_copy(update={"role": Role.SUPER_ADMIN}) if include_hidden else VIEWER  # hidden ideas, for the CRM admin
    found = _json(gift_idea_service.list(viewer, page=page, limit=limit, search=search))
    return {"data": {**found, "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED}, "message": "OK"}


def _ideas_open() -> None:
    if not settings.CRM_KAM_ACTIONS_ENABLED:
        raise HTTPException(status_code=403, detail=SWITCHED_OFF)


@router.get("/{tenant_id}/home")
def home(
    tenant: Client,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")] = None,
    category: Annotated[CalendarFilter, Query()] = "ALL",
) -> dict:
    overview, recent = run_parallel(
        lambda: dashboard_service.overview(tenant, VIEWER, month=month or date.today().strftime("%Y-%m"), category=category),
        lambda: audit.list_activity(tenant, True, page=1, limit=6),
    )
    return {"data": {**_json(overview), "activity": _json(recent)["items"]}, "message": "OK"}


@router.get("/{tenant_id}/calendar")
def calendar(
    tenant: Client,
    q: Annotated[str | None, Query(max_length=100)] = None,
    tab: Annotated[str, Query(max_length=30)] = "ALL",
    sort: Annotated[str, Query(max_length=20)] = "soonest",
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=500)] = 20,
) -> dict:
    found = occasion_overview_service.overview(
        tenant, VIEWER, date_from=None, date_to=None, days=None, q=q, tab=tab, sort=sort, page=page, limit=limit,
    )
    return {"data": {**_json(found), "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED}, "message": "OK"}


@router.get("/{tenant_id}/occasions")
def occasions(tenant: Client, page: Annotated[int, Query(ge=1)] = 1, limit: Annotated[int, Query(ge=1, le=500)] = 100) -> dict:
    found = occasion_service.list_occasions(tenant, VIEWER, page=page, limit=limit, active_only=False)
    return {"data": {**_json(found), "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED}, "message": "OK"}


@router.get("/{tenant_id}/events")
def events(tenant: Client, page: Annotated[int, Query(ge=1)] = 1, limit: Annotated[int, Query(ge=1, le=500)] = 20) -> dict:
    found = _json(event_service.list_tenant_events(tenant, VIEWER, page=page, limit=limit))
    ids = sorted({e["recipientId"] for e in found["items"] if e.get("recipientId")})
    names = {}
    if ids:
        rows = event_service.database.table("recipients").select("id,name").eq("tenant_id", tenant).in_("id", ids).execute().data or []
        names = {str(r["id"]): r["name"] for r in rows}
    items = [{**e, "recipientName": names.get(e.get("recipientId"))} for e in found["items"]]
    return {"data": {**found, "items": items, "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED}, "message": "OK"}


@router.get("/{tenant_id}/recipients")
def recipients(tenant: Client, q: Annotated[str | None, Query(max_length=100)] = None) -> dict:
    """People to choose from when adding an event: names only."""
    query = event_service.database.table("recipients").select("id,name").eq("tenant_id", tenant)
    term = (q or "").strip().replace("%", " ").replace(",", " ")
    if term:
        query = query.ilike("name", f"%{term}%")
    rows = query.order("name").limit(100).execute().data or []
    return {"data": [{"id": str(r["id"]), "name": r["name"]} for r in rows], "message": "OK"}


@router.get("/{tenant_id}/activity")
def activity(tenant: Client, page: Annotated[int, Query(ge=1)] = 1, limit: Annotated[int, Query(ge=1, le=500)] = 20) -> dict:
    return {"data": _json(audit.list_activity(tenant, True, page=page, limit=limit)), "message": "OK"}


# --- changing ---------------------------------------------------------------------------------------------------------

@router.post("/gift-ideas", status_code=201)
def create_gift_idea(body: IdeaWrite) -> dict:
    _ideas_open()
    made = gift_idea_service.create(body.idea, crm_actors.get(str(body.actor_id), body.actor_name))  # saved as the author
    return {"data": _json(made), "message": "Gift idea added."}


@router.patch("/gift-ideas/{idea_id}")
def update_gift_idea(idea_id: UUID, body: IdeaChange) -> dict:
    _ideas_open()
    return {"data": _json(gift_idea_service.update(str(idea_id), body.changes)), "message": "Gift idea updated."}


@router.delete("/gift-ideas/{idea_id}")
def delete_gift_idea(idea_id: UUID, who: Annotated[Actor, Query()]) -> dict:
    _ideas_open()
    gift_idea_service.delete(str(idea_id))
    return {"data": {}, "message": "Gift idea deleted."}

@router.post("/{tenant_id}/occasions", status_code=201)
def create_occasion(tenant_id: UUID, body: OccasionWrite) -> dict:
    tenant = client(tenant_id)
    made = occasion_service.create_occasion(tenant, body.occasion, _writer(tenant, body))
    return {"data": _json(made), "message": "Occasion created."}


@router.patch("/{tenant_id}/occasions/{occasion_id}")
def update_occasion(tenant_id: UUID, occasion_id: UUID, body: OccasionChange) -> dict:
    tenant = client(tenant_id)
    made = occasion_service.update_occasion(tenant, str(occasion_id), body.changes, _writer(tenant, body))
    return {"data": _json(made), "message": "Occasion updated."}


@router.delete("/{tenant_id}/occasions/{occasion_id}")
def delete_occasion(tenant_id: UUID, occasion_id: UUID, who: Annotated[Actor, Query()]) -> dict:
    tenant = client(tenant_id)
    occasion_service.delete_occasion(tenant, str(occasion_id), _writer(tenant, who))
    return {"data": {}, "message": "Occasion deleted."}


@router.post("/{tenant_id}/events", status_code=201)
def create_event(tenant_id: UUID, body: EventWrite) -> dict:
    tenant = client(tenant_id)
    made = event_service.create_event(tenant, body.event, _writer(tenant, body), recipient_id=str(body.recipient_id))
    return {"data": _json(made), "message": "Event created."}


@router.patch("/{tenant_id}/events/{event_id}")
def update_event(tenant_id: UUID, event_id: UUID, body: EventChange) -> dict:
    tenant = client(tenant_id)
    made = event_service.update_event(tenant, str(event_id), body.changes, _writer(tenant, body))
    return {"data": _json(made), "message": "Event updated."}


@router.delete("/{tenant_id}/events/{event_id}")
def delete_event(tenant_id: UUID, event_id: UUID, who: Annotated[Actor, Query()]) -> dict:
    tenant = client(tenant_id)
    event_service.delete_event(tenant, str(event_id), _writer(tenant, who))
    return {"data": {}, "message": "Event deleted."}
