"""Tenant-scoped event CRUD and access checks."""

import logging

from fastapi import HTTPException
from supabase import Client

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.events.schemas import EventCreate, EventList, EventRead, EventUpdate
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)


class EventService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def list_tenant_events(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        recipient_id: str | None = None,
    ) -> EventList:
        self._require_tenant_access(tenant_id, actor, Permission.EVENT_READ)
        if recipient_id is not None:
            self._require_recipient(tenant_id, recipient_id)
        return self._list(tenant_id, actor, page=page, limit=limit, recipient_id=recipient_id)

    def list_recipient_events(
        self,
        tenant_id: str,
        recipient_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
    ) -> EventList:
        self._require_tenant_access(tenant_id, actor, Permission.EVENT_READ)
        self._require_recipient(tenant_id, recipient_id)
        return self._list(tenant_id, actor, page=page, limit=limit, recipient_id=recipient_id)

    def _list(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        recipient_id: str | None,
    ) -> EventList:
        query = (
            self.database.table("events")
            .select("*", count="exact")
            .eq("tenant_id", tenant_id)
            .order("event_date")
            .order("id")
        )
        if recipient_id is not None:
            query = query.eq("recipient_id", recipient_id)
        offset = (page - 1) * limit
        result = query.range(offset, offset + limit - 1).execute()
        rows = result.data or []
        total = result.count or 0
        return EventList(
            items=[EventRead.model_validate(row) for row in rows],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def get_event(self, tenant_id: str, event_id: str, actor: UserProfileResponse) -> EventRead:
        self._require_tenant_access(tenant_id, actor, Permission.EVENT_READ)
        result = (
            self.database.table("events")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("id", event_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Event not found.")
        return EventRead.model_validate(result.data[0])

    def create_event(
        self,
        tenant_id: str,
        payload: EventCreate,
        actor: UserProfileResponse,
        *,
        recipient_id: str | None = None,
    ) -> EventRead:
        require_permission(actor, Permission.EVENT_CREATE)
        self._require_tenant_editor(tenant_id, actor, Permission.EVENT_CREATE)
        if recipient_id is not None:
            self._require_recipient(tenant_id, recipient_id)
        values = payload.model_dump(mode="json")
        values.update(
            {
                "tenant_id": tenant_id,
                "recipient_id": recipient_id,
                "created_by_user_id": actor.id,
            }
        )
        try:
            result = self.database.table("events").insert(values).select("*").execute()
        except Exception as exc:
            logger.exception("Could not create event")
            raise HTTPException(status_code=409, detail="Event could not be created.") from exc
        if not result.data:
            raise HTTPException(status_code=409, detail="Event could not be created.")
        return EventRead.model_validate(result.data[0])

    def update_event(
        self,
        tenant_id: str,
        event_id: str,
        payload: EventUpdate,
        actor: UserProfileResponse,
    ) -> EventRead:
        require_permission(actor, Permission.EVENT_UPDATE)
        self._require_tenant_editor(tenant_id, actor, Permission.EVENT_UPDATE)
        self.get_event(tenant_id, event_id, actor)
        values = payload.model_dump(mode="json", exclude_unset=True)
        if "recipient_id" in values and values["recipient_id"] is not None:
            self._require_recipient(tenant_id, values["recipient_id"])
        try:
            result = (
                self.database.table("events")
                .update(values)
                .eq("tenant_id", tenant_id)
                .eq("id", event_id)
                .select("*")
                .execute()
            )
        except Exception as exc:
            logger.exception("Could not update event")
            raise HTTPException(status_code=409, detail="Event could not be updated.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="Event not found.")
        return EventRead.model_validate(result.data[0])

    def delete_event(self, tenant_id: str, event_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.EVENT_DELETE)
        self._require_tenant_editor(tenant_id, actor, Permission.EVENT_DELETE)
        self.get_event(tenant_id, event_id, actor)
        try:
            result = (
                self.database.table("events")
                .delete()
                .eq("tenant_id", tenant_id)
                .eq("id", event_id)
                .select("id")
                .execute()
            )
        except Exception as exc:
            logger.exception("Could not delete event")
            raise HTTPException(status_code=409, detail="Event could not be deleted.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="Event not found.")

    def _require_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
    ) -> None:
        result = (
            self.database.table("recipients")
            .select("id")
            .eq("tenant_id", tenant_id)
            .eq("id", recipient_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found in this tenant.")

    @staticmethod
    def _require_tenant_access(
        tenant_id: str,
        actor: UserProfileResponse,
        permission: Permission,
    ) -> None:
        require_permission(actor, permission)
        tenant_service.require_access(tenant_id, actor)

    @staticmethod
    def _require_tenant_editor(
        tenant_id: str,
        actor: UserProfileResponse,
        permission: Permission,
    ) -> None:
        if actor.role not in (Role.CLIENT, Role.SUPER_ADMIN):
            raise HTTPException(status_code=403, detail="Only tenant users and super admins can manage events.")
        EventService._require_tenant_access(tenant_id, actor, permission)


event_service = EventService()
