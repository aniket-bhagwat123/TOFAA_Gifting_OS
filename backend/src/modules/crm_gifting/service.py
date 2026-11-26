"""Gift requests for TOFAA CRM, so a KAM can follow and handle their clients' requests there.

The CRM decides which clients the signed-in person may see and names them in every call; nothing outside that list
is ever returned. Drafts are left out: they are the client's own until submitted.
"""

from typing import Any

from fastapi import HTTPException

from src.core import audit
from src.core.concurrency import run_parallel
from src.core.config import settings
from src.modules.crm_gifting.actors import crm_actors
from src.modules.gift_requests.schemas import GiftRequestStatus
from src.modules.gift_requests.service import gift_request_service
from src.modules.tenants.service import tenant_service

STATUSES = [s.value for s in GiftRequestStatus if s != GiftRequestStatus.DRAFT]
# What TOFAA staff may do from each status (the database enforces the same rules). Approval stays with the client.
ACTIONS = {
    "SUBMITTED": ["start_review", "request_info"],
    "IN_REVIEW": ["publish_proposal", "request_info", "reject"],
    "NEEDS_INFO": ["reject"],
    "PROPOSAL_READY": ["request_info"],
    "CONFIRMED": ["start_fulfilment"],
    "IN_PROGRESS": ["dispatch"],
    "DISPATCHED": ["deliver"],
}
NOTE_REQUIRED = {"request_info", "reject"}


class CrmGiftingService:
    def __init__(self, requests=None, actors=None, tenants=None) -> None:
        self.requests = requests or gift_request_service
        self.actors = actors or crm_actors
        self.tenants = tenants or tenant_service

    @property
    def db(self):
        return self.requests.database

    def search(
        self, tenant_ids: list[str], *, status: GiftRequestStatus | None, search: str | None, page: int, limit: int,
    ) -> dict[str, Any]:
        empty = {"items": [], "total": 0, "page": page, "limit": limit, "counts": []}
        if not tenant_ids:
            return empty
        wanted = [status.value] if status and status.value in STATUSES else ([] if status else STATUSES)
        counts = self._counts(tenant_ids)  # one after the other: both of these use the shared worker pool inside
        if not wanted:  # drafts were asked for
            return {**empty, "counts": counts}
        query = self.db.table("gift_requests").select("*", count="exact").in_("tenant_id", tenant_ids).in_("status", wanted)
        found = self.requests._page(self.requests._apply_search(query, tenant_ids, search), page, limit)
        return {
            "items": [item.model_dump(mode="json", by_alias=True) for item in found.items],
            "total": found.pagination.total_records, "page": page, "limit": limit, "counts": counts,
        }

    def _counts(self, tenant_ids: list[str]) -> list[dict[str, Any]]:
        """Requests per status across these clients (a list, so status names survive the CRM's camelCase step)."""
        def count(status: str) -> int:
            return (self.db.table("gift_requests").select("id", count="exact").in_("tenant_id", tenant_ids)
                    .eq("status", status).limit(1).execute().count or 0)

        totals = run_parallel(*[lambda s=s: count(s) for s in STATUSES])
        return [{"status": s, "count": n} for s, n in zip(STATUSES, totals)]

    def _row(self, tenant_ids: list[str], request_id: str) -> dict[str, Any]:
        """The request, only if it belongs to one of these clients and has been submitted."""
        rows = []
        if tenant_ids:
            rows = (self.db.table("gift_requests").select("*").eq("id", request_id).in_("tenant_id", tenant_ids)
                    .in_("status", STATUSES).limit(1).execute().data or [])
        if not rows:
            raise HTTPException(status_code=404, detail="Gift request not found.")
        return rows[0]

    def act(
        self, tenant_ids: list[str], request_id: str, action: str, *, crm_user_id: str, crm_user_name: str,
        note: str | None = None, proposal: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not settings.CRM_KAM_ACTIONS_ENABLED:
            raise HTTPException(status_code=403, detail="Acting from the CRM is switched off in Gifting OS.")
        row = self._row(tenant_ids, request_id)
        # Check everything before an identity is created or anything is written.
        if action not in ACTIONS.get(row["status"], []):
            raise HTTPException(status_code=409, detail="Gift request is not in a valid state for this action.")
        note = (note or "").strip() or None
        if action in NOTE_REQUIRED and not note:
            raise HTTPException(status_code=422, detail="A note is required for this action.")
        if action == "publish_proposal" and not proposal:
            raise HTTPException(status_code=422, detail="A proposal with at least one option is required.")
        tenant = self.tenants.tenant_state(str(row["tenant_id"]))
        if not tenant or tenant["status"] == "DEACTIVATED":
            raise HTTPException(status_code=409, detail="This client is deactivated and cannot be changed.")
        actor = self.actors.get(crm_user_id, crm_user_name)
        audit.note(actor, str(row["tenant_id"]))
        self.requests._transition_rpc(
            str(row["tenant_id"]), request_id, action, actor, note=note,
            proposal=proposal if action == "publish_proposal" else None,
        )
        return self.detail(tenant_ids, request_id)

    def detail(self, tenant_ids: list[str], request_id: str) -> dict[str, Any]:
        rows = [self._row(tenant_ids, request_id)]
        events = (self.db.table("gift_request_events").select("*").eq("tenant_id", rows[0]["tenant_id"])
                  .eq("gift_request_id", request_id).order("created_at").order("id").execute().data or [])
        actors = self.requests._profiles([e["actor_user_id"] for e in events if e.get("actor_user_id")])
        history = [{
            "id": str(e["id"]), "fromStatus": e.get("from_status"), "toStatus": e["to_status"], "note": e.get("note"),
            "createdAt": e["created_at"], "actorName": actors.get(e.get("actor_user_id"), {}).get("full_name"),
            "actorRole": actors.get(e.get("actor_user_id"), {}).get("role"),
        } for e in events]
        request = self.requests._enrich([rows[0]])[0].model_dump(mode="json", by_alias=True)
        allowed = ACTIONS.get(rows[0]["status"], []) if settings.CRM_KAM_ACTIONS_ENABLED else []
        return {"request": request, "history": history, "actionsEnabled": settings.CRM_KAM_ACTIONS_ENABLED, "allowedActions": allowed}


crm_gifting_service = CrmGiftingService()
