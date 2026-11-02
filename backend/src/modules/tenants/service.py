"""Tenant management use cases."""

import logging

from fastapi import HTTPException
from supabase import Client

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.models import TenantStatus
from src.modules.tenants.schemas import TenantCreate, TenantList, TenantRead, TenantUpdate

logger = logging.getLogger(__name__)


class TenantService:
    """Create and manage tenants while checking caller scope explicitly."""

    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def create(self, payload: TenantCreate, actor: UserProfileResponse) -> TenantRead:
        require_permission(actor, Permission.TENANT_CREATE)
        values = payload.model_dump(mode="json", exclude_unset=True)
        if values.get("email_domain"):
            values["email_domain"] = self._normalize_domain(values["email_domain"])
        try:
            result = self.database.table("tenants").insert(values).execute()
        except Exception as exc:
            logger.exception("Tenant creation failed")
            raise HTTPException(status_code=409, detail="Tenant could not be created.") from exc
        if not result.data:
            raise HTTPException(status_code=500, detail="Tenant could not be created.")
        return TenantRead.model_validate(result.data[0])

    def list(
        self,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        search: str | None,
    ) -> TenantList:
        require_permission(actor, Permission.TENANT_READ)
        tenant_ids: list[str] | None = None
        if actor.role == Role.CLIENT:
            tenant_ids = [actor.tenant_id] if actor.tenant_id else []
        elif actor.role == Role.KAM:
            assignments = (
                self.database.table("team_client_assignments")
                .select("tenant_id")
                .eq("user_id", actor.id)
                .eq("active", True)
                .execute()
            )
            tenant_ids = [row["tenant_id"] for row in assignments.data or []]
        query = self.database.table("tenants").select("*", count="exact")
        if tenant_ids is not None:
            if not tenant_ids:
                return TenantList(
                    items=[],
                    pagination=PaginationMeta(page=page, limit=limit, total_records=0),
                    next_cursor=None,
                )
            query = query.in_("id", tenant_ids)
        if search:
            query = query.ilike("name", f"%{search}%")
        offset = (page - 1) * limit
        result = (
            query.order("created_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        rows = result.data or []
        total_records = result.count or 0
        return TenantList(
            items=[TenantRead.model_validate(row) for row in rows],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total_records),
            next_cursor=next_page_cursor(page, limit, total_records),
        )

    def get(self, tenant_id: str, actor: UserProfileResponse) -> TenantRead:
        require_permission(actor, Permission.TENANT_READ)
        self.require_access(tenant_id, actor)
        result = self.database.table("tenants").select("*").eq("id", tenant_id).limit(1).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Tenant not found.")
        return TenantRead.model_validate(result.data[0])

    def update(
        self,
        tenant_id: str,
        payload: TenantUpdate,
        actor: UserProfileResponse,
    ) -> TenantRead:
        require_permission(actor, Permission.TENANT_UPDATE)
        values = payload.model_dump(mode="json", exclude_unset=True)
        if "email_domain" in values and values["email_domain"]:
            values["email_domain"] = self._normalize_domain(values["email_domain"])
        result = (
            self.database.table("tenants")
            .update(values)
            .eq("id", tenant_id)
            .neq("status", TenantStatus.DEACTIVATED.value)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Tenant not found.")
        return TenantRead.model_validate(result.data[0])

    def set_status(
        self,
        tenant_id: str,
        new_status: TenantStatus,
        actor: UserProfileResponse,
    ) -> TenantRead:
        require_permission(actor, Permission.TENANT_MANAGE_STATUS)
        result = (
            self.database.table("tenants")
            .update({"status": new_status.value})
            .eq("id", tenant_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Tenant not found.")
        return TenantRead.model_validate(result.data[0])

    def require_access(self, tenant_id: str, actor: UserProfileResponse) -> None:
        if actor.role == Role.SUPER_ADMIN or (actor.role == Role.CLIENT and actor.tenant_id == tenant_id):
            return
        if actor.role == Role.KAM:
            assignment = (
                self.database.table("team_client_assignments")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", actor.id)
                .eq("active", True)
                .limit(1)
                .execute()
            )
            if assignment.data:
                return
        raise HTTPException(status_code=404, detail="Tenant not found.")

    @staticmethod
    def _normalize_domain(value: str) -> str:
        domain = value.strip().lower().removeprefix("@").rstrip(".")
        if not domain or "." not in domain or " " in domain:
            raise HTTPException(status_code=422, detail="Email domain is invalid.")
        return domain


tenant_service = TenantService()
