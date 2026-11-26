"""Occasions, events and new gift requests made in TOFAA CRM for a client.

Reading the choices is always allowed. Creating anything needs CRM_KAM_ACTIONS_ENABLED, and everything is checked
before the CRM person's identity is made or anything is written. The same Gifting OS rules apply as on its screens.
"""

from datetime import date
from typing import Any

from fastapi import HTTPException

from src.core import audit
from src.core.concurrency import run_parallel
from src.core.config import settings
from src.modules.crm_gifting.actors import crm_actors
from src.modules.events.schemas import EventCreate
from src.modules.events.service import event_service
from src.modules.gift_requests.schemas import GiftRequestCreate
from src.modules.gift_requests.service import gift_request_service
from src.modules.occasions.schemas import OccasionCreate
from src.modules.occasions.service import occasion_service
from src.modules.tenants.service import tenant_service

SWITCHED_OFF = "Acting from the CRM is switched off in Gifting OS."


class CrmPlanningService:
    def __init__(self, requests=None, occasions=None, events=None, actors=None, tenants=None) -> None:
        self.requests = requests or gift_request_service
        self.occasions = occasions or occasion_service
        self.events = events or event_service
        self.actors = actors or crm_actors
        self.tenants = tenants or tenant_service

    def options(self, tenant_id: str, recipient_id: str | None) -> dict[str, Any]:
        """The client's active occasions (TOFAA's and their own) and, for a chosen person, their active events."""
        db = self.requests.database

        def events() -> list[dict[str, Any]]:
            if not recipient_id:
                return []
            return (db.table("events").select("id,event_name,event_date").eq("tenant_id", tenant_id)
                    .eq("recipient_id", recipient_id).eq("is_active", True).order("event_date").limit(200).execute().data or [])

        occasions, found = run_parallel(
            lambda: db.table("occasions").select("id,tenant_id,occasion_name,occasion_date")
            .or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}").eq("is_active", True).order("occasion_name").limit(500).execute().data or [],
            events,
        )
        return {
            "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED,
            "occasions": [{"id": str(o["id"]), "name": o["occasion_name"], "date": o.get("occasion_date"), "own": bool(o.get("tenant_id"))} for o in occasions],
            "events": [{"id": str(e["id"]), "name": e["event_name"], "date": e.get("event_date")} for e in found],
        }

    def _check_open(self, tenant_id: str) -> None:
        if not settings.CRM_KAM_ACTIONS_ENABLED:
            raise HTTPException(status_code=403, detail=SWITCHED_OFF)
        tenant = self.tenants.tenant_state(tenant_id)
        if not tenant or tenant["status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="This client must be active in Gifting OS.")

    def _actor(self, tenant_id: str, crm_user_id: str, crm_user_name: str):
        actor = self.actors.get(crm_user_id, crm_user_name)
        audit.note(actor, tenant_id)
        return actor

    def create_occasion(self, tenant_id: str, payload: OccasionCreate, *, crm_user_id: str, crm_user_name: str) -> dict[str, Any]:
        self._check_open(tenant_id)
        made = self.occasions.create_occasion(tenant_id, payload, self._actor(tenant_id, crm_user_id, crm_user_name))
        return {"id": made.id, "name": made.occasion_name}

    def create_event(
        self, tenant_id: str, recipient_id: str, payload: EventCreate, *, crm_user_id: str, crm_user_name: str,
    ) -> dict[str, Any]:
        self._check_open(tenant_id)
        self.requests._require_recipient(tenant_id, recipient_id)
        actor = self._actor(tenant_id, crm_user_id, crm_user_name)
        made = self.events.create_event(tenant_id, payload, actor, recipient_id=recipient_id)
        return {"id": made.id, "name": made.event_name}

    def create_request(self, tenant_id: str, payload: GiftRequestCreate, *, crm_user_id: str, crm_user_name: str) -> dict[str, Any]:
        """Create the request and send it to TOFAA, like a finished form on the Gifting OS screens."""
        self._check_open(tenant_id)
        values = payload.model_dump(mode="json")
        recipient = values["recipient_id"]
        self.requests._require_recipient(tenant_id, recipient)
        self.requests._require_event(tenant_id, values["event_id"], recipient)
        self.requests._require_occasion(tenant_id, values["occasion_id"])
        if values.get("delivery_date") and date.fromisoformat(values["delivery_date"]) < date.today():
            raise HTTPException(status_code=422, detail="The delivery date cannot be in the past.")
        self.requests._require_complete(values)  # no half-made draft is left behind
        actor = self._actor(tenant_id, crm_user_id, crm_user_name)
        draft = self.requests.create(tenant_id, payload, actor)
        sent = self.requests.transition(tenant_id, draft.id, "submit", actor)
        return {"id": sent.id, "requestCode": sent.request_code, "title": sent.title}


crm_planning_service = CrmPlanningService()
