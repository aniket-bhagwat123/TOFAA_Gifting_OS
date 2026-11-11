"""Tenant-scoped occasion CRUD."""

import logging
from collections import Counter
from datetime import date, timedelta

from fastapi import HTTPException
from supabase import Client

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse
from src.modules.occasions.schemas import (
    OccasionCreate,
    OccasionList,
    OccasionRead,
    OccasionUpdate,
    UpcomingOccasion,
)
from src.modules.tenants.service import tenant_service

logger = logging.getLogger(__name__)


class OccasionService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def _require_tenant_access(
        self, tenant_id: str, actor: UserProfileResponse, permission: Permission,
    ) -> None:
        require_permission(actor, permission)
        tenant_service.require_access(tenant_id, actor)

    def list_occasions(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        active_only: bool,
    ) -> OccasionList:
        self._require_tenant_access(tenant_id, actor, Permission.OCCASION_READ)
        query = (self.database.table("occasions").select("*", count="exact")
                 .or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}"))
        if active_only:
            query = query.eq("is_active", True)
        offset = (page - 1) * limit
        result = query.order("occasion_name").order("id").range(offset, offset + limit - 1).execute()
        rows = result.data or []
        total = result.count or 0
        return OccasionList(
            items=[OccasionRead.model_validate(row) for row in rows],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def upcoming(self, tenant_id: str, actor: UserProfileResponse, *, days: int) -> list[UpcomingOccasion]:
        """Active occasions in the next ``days`` days (TOFAA's and the client's own), nearest first."""
        self._require_tenant_access(tenant_id, actor, Permission.OCCASION_READ)
        today = date.today()
        rows = (
            self.database.table("occasions")
            .select("id,tenant_id,occasion_name,occasion_date,description")
            .or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}")
            .eq("is_active", True)
            .gte("occasion_date", today.isoformat())
            .lte("occasion_date", (today + timedelta(days=days)).isoformat())
            .order("occasion_date")
            .order("occasion_name")
            .limit(100)
            .execute()
            .data
            or []
        )
        sent: Counter[str] = Counter()
        if rows:
            requests = (
                self.database.table("gift_requests")
                .select("occasion_id")
                .eq("tenant_id", tenant_id)
                .in_("occasion_id", [row["id"] for row in rows])
                .neq("status", "CANCELLED")
                .execute()
                .data
                or []
            )
            sent.update(row["occasion_id"] for row in requests)
        return [
            UpcomingOccasion(
                id=row["id"],
                occasion_name=row["occasion_name"],
                occasion_date=row["occasion_date"],
                description=row.get("description"),
                days_away=(date.fromisoformat(str(row["occasion_date"])) - today).days,
                is_global=row.get("tenant_id") is None,
                requests_sent=sent[row["id"]],
            )
            for row in rows
        ]

    def get_occasion(
        self, tenant_id: str, occasion_id: str, actor: UserProfileResponse,
    ) -> OccasionRead:
        self._require_tenant_access(tenant_id, actor, Permission.OCCASION_READ)
        result = (self.database.table("occasions").select("*").eq("id", occasion_id)
                  .or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}").limit(1).execute())
        if not result.data:
            raise HTTPException(status_code=404, detail="Occasion not found.")
        return OccasionRead.model_validate(result.data[0])

    def list_all_occasions(
        self,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        active_only: bool,
        tenant_id: str | None = None,
    ) -> OccasionList:
        require_permission(actor, Permission.OCCASION_READ)
        if actor.role != Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only super admins can list all occasions.")
        query = self.database.table("occasions").select("*", count="exact")
        if tenant_id is not None:
            tenant_service.require_context(tenant_id, actor)
            query = query.or_(f"tenant_id.is.null,tenant_id.eq.{tenant_id}")
        if active_only:
            query = query.eq("is_active", True)
        offset = (page - 1) * limit
        result = query.order("occasion_name").order("id").range(offset, offset + limit - 1).execute()
        rows = result.data or []
        total = result.count or 0
        return OccasionList(
            items=[OccasionRead.model_validate(row) for row in rows],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def create_global_occasion(
        self, payload: OccasionCreate, actor: UserProfileResponse,
    ) -> OccasionRead:
        require_permission(actor, Permission.OCCASION_CREATE)
        if actor.role != Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only super admins can create global occasions.")
        values = payload.model_dump(mode="json")
        values["occasion_name"] = values["occasion_name"].strip()
        values.update(tenant_id=None, created_by_user_id=actor.id)
        try:
            result = self.database.table("occasions").insert(values).select("*").execute()
        except Exception as exc:
            logger.exception("Could not create global occasion")
            raise HTTPException(status_code=409, detail="Occasion could not be created.") from exc
        if not result.data:
            raise HTTPException(status_code=409, detail="Occasion could not be created.")
        return OccasionRead.model_validate(result.data[0])

    def get_any_occasion(self, occasion_id: str, actor: UserProfileResponse) -> OccasionRead:
        require_permission(actor, Permission.OCCASION_READ)
        if actor.role != Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Only super admins can view all occasions.")
        result = self.database.table("occasions").select("*").eq("id", occasion_id).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Occasion not found.")
        return OccasionRead.model_validate(result.data[0])

    def create_occasion(
        self, tenant_id: str, payload: OccasionCreate, actor: UserProfileResponse,
    ) -> OccasionRead:
        if actor.role == Role.SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Use the global occasion endpoint as super admin.")
        self._require_tenant_access(tenant_id, actor, Permission.OCCASION_CREATE)
        values = payload.model_dump(mode="json")
        values["occasion_name"] = values["occasion_name"].strip()
        values.update(tenant_id=tenant_id, created_by_user_id=actor.id)
        try:
            result = self.database.table("occasions").insert(values).select("*").execute()
        except Exception as exc:
            logger.exception("Could not create occasion")
            raise HTTPException(status_code=409, detail="Occasion could not be created.") from exc
        if not result.data:
            raise HTTPException(status_code=409, detail="Occasion could not be created.")
        return OccasionRead.model_validate(result.data[0])

    def update_occasion(
        self,
        tenant_id: str,
        occasion_id: str,
        payload: OccasionUpdate,
        actor: UserProfileResponse,
    ) -> OccasionRead:
        self._require_tenant_access(tenant_id, actor, Permission.OCCASION_UPDATE)
        self._get_tenant_owned_occasion(tenant_id, occasion_id)
        values = payload.model_dump(mode="json", exclude_unset=True)
        if "occasion_name" in values:
            values["occasion_name"] = values["occasion_name"].strip()
        try:
            result = (self.database.table("occasions").update(values)
                      .eq("tenant_id", tenant_id).eq("id", occasion_id).select("*").execute())
        except Exception as exc:
            logger.exception("Could not update occasion")
            raise HTTPException(status_code=409, detail="Occasion could not be updated.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="Occasion not found.")
        return OccasionRead.model_validate(result.data[0])

    def delete_occasion(
        self, tenant_id: str, occasion_id: str, actor: UserProfileResponse,
    ) -> None:
        self._require_tenant_access(tenant_id, actor, Permission.OCCASION_DELETE)
        self._get_tenant_owned_occasion(tenant_id, occasion_id)
        try:
            result = (self.database.table("occasions").delete()
                      .eq("tenant_id", tenant_id).eq("id", occasion_id).select("id").execute())
        except Exception as exc:
            logger.exception("Could not delete occasion")
            if getattr(exc, "code", None) == "23503":
                raise HTTPException(
                    status_code=409,
                    detail="Occasion is linked to one or more records and cannot be deleted.",
                ) from exc
            raise HTTPException(status_code=409, detail="Occasion could not be deleted.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="Occasion not found.")

    def _get_tenant_owned_occasion(self, tenant_id: str, occasion_id: str) -> None:
        result = (self.database.table("occasions").select("id")
                  .eq("tenant_id", tenant_id).eq("id", occasion_id).limit(1).execute())
        if not result.data:
            raise HTTPException(status_code=404, detail="Occasion not found.")

    def update_any_occasion(
        self, occasion_id: str, payload: OccasionUpdate, actor: UserProfileResponse,
    ) -> OccasionRead:
        require_permission(actor, Permission.OCCASION_UPDATE)
        self.get_any_occasion(occasion_id, actor)
        values = payload.model_dump(mode="json", exclude_unset=True)
        if "occasion_name" in values:
            values["occasion_name"] = values["occasion_name"].strip()
        try:
            result = (self.database.table("occasions").update(values)
                      .eq("id", occasion_id).select("*").execute())
        except Exception as exc:
            logger.exception("Could not update occasion")
            raise HTTPException(status_code=409, detail="Occasion could not be updated.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="Occasion not found.")
        return OccasionRead.model_validate(result.data[0])

    def delete_any_occasion(self, occasion_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.OCCASION_DELETE)
        self.get_any_occasion(occasion_id, actor)
        try:
            result = (self.database.table("occasions").delete()
                      .eq("id", occasion_id).select("id").execute())
        except Exception as exc:
            logger.exception("Could not delete occasion")
            if getattr(exc, "code", None) == "23503":
                raise HTTPException(
                    status_code=409,
                    detail="Occasion is linked to one or more records and cannot be deleted.",
                ) from exc
            raise HTTPException(status_code=409, detail="Occasion could not be deleted.") from exc
        if not result.data:
            raise HTTPException(status_code=404, detail="Occasion not found.")


occasion_service = OccasionService()
