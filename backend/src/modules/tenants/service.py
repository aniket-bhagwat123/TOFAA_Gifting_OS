"""Tenant management use cases."""

from __future__ import annotations

import logging

from fastapi import HTTPException
from supabase import Client

from src.core import audit
from src.core.config import settings
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.core.ttl_cache import MISSING, lookups
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.models import TenantStatus, TenantType
from src.modules.tenants.schemas import TenantCreate, TenantList, TenantRead, TenantUpdate

logger = logging.getLogger(__name__)


class TenantService:
    """Create and manage tenants while checking caller scope explicitly."""

    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def create(self, payload: TenantCreate, actor: UserProfileResponse) -> TenantRead:
        require_permission(actor, Permission.TENANT_CREATE)
        values = payload.model_dump(
            mode="json", exclude_unset=True, exclude={"first_user_email", "first_user_name"}
        )
        if values.get("email_domain"):
            values["email_domain"] = self._normalize_domain(values["email_domain"])
        # Ready to use straight away: a tenant that stays PENDING_SETUP cannot log anyone in.
        values["status"] = TenantStatus.ACTIVE.value
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
        tenant_ids = self.visible_tenant_ids(actor)
        # The internal TOFAA tenant is where staff belong; it is never a client to work on.
        query = (
            self.database.table("tenants")
            .select("*", count="exact")
            .neq("tenant_type", TenantType.INTERNAL.value)
        )
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
        self.require_access(tenant_id, actor)
        values = payload.model_dump(mode="json", exclude_unset=True)
        if "email_domain" in values and values["email_domain"]:
            values["email_domain"] = self._normalize_domain(values["email_domain"])
        audit.note(actor, tenant_id)
        result = (
            self.database.table("tenants")
            .update(values)
            .eq("id", tenant_id)
            .neq("status", TenantStatus.DEACTIVATED.value)
            .neq("tenant_type", TenantType.INTERNAL.value)
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
        audit.note(actor, tenant_id)
        result = (
            self.database.table("tenants")
            .update({"status": new_status.value})
            .eq("id", tenant_id)
            .neq("tenant_type", TenantType.INTERNAL.value)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Tenant not found.")
        return TenantRead.model_validate(result.data[0])

    def visible_tenant_ids(self, actor: UserProfileResponse) -> list[str] | None:
        """Client tenants the actor may work on; ``None`` means all of them."""
        if actor.role == Role.SUPER_ADMIN or (actor.role == Role.KAM and settings.KAM_ACCESS_ALL_CLIENTS):
            return None
        if actor.role == Role.CLIENT:
            return [actor.tenant_id] if actor.tenant_id else []
        if actor.role == Role.KAM:
            key = ("kam-tenants", actor.id)
            cached = lookups.get(key, settings.AUTH_CACHE_SECONDS)
            if cached is not MISSING:
                return cached
            assignments = (
                self.database.table("team_client_assignments")
                .select("tenant_id")
                .eq("user_id", actor.id)
                .eq("active", True)
                .execute()
            )
            found = list({row["tenant_id"] for row in assignments.data or []})
            lookups.set(key, found)
            return found
        return []

    def require_access(self, tenant_id: str, actor: UserProfileResponse) -> None:
        allowed = self.visible_tenant_ids(actor)
        if allowed is None or tenant_id in allowed:
            return
        raise HTTPException(status_code=404, detail="Tenant not found.")

    def require_context(self, tenant_id: str, actor: UserProfileResponse, *, write: bool = False) -> None:
        """Validate a tenant ID for one transaction: caller scope, tenant existence, and tenant state.

        Scope is checked first so callers cannot probe which tenant IDs exist; every refusal is a 404.
        A deactivated tenant stays readable by staff for offboarding, but its data is frozen.
        The internal TOFAA tenant holds staff accounts only, so it is never a data context.
        """
        self.require_access(tenant_id, actor)
        tenant = self.tenant_state(tenant_id)
        if tenant is None or tenant.get("tenant_type") == TenantType.INTERNAL.value:
            raise HTTPException(status_code=404, detail="Tenant not found.")
        if write and tenant["status"] == TenantStatus.DEACTIVATED.value:
            raise HTTPException(status_code=409, detail="This tenant is deactivated and cannot be changed.")
        audit.note(actor, tenant_id)

    def tenant_state(self, tenant_id: str) -> dict | None:
        """A tenant's status and type (``None`` when it does not exist), remembered for a few seconds."""
        key = ("tenant-state", tenant_id)
        cached = lookups.get(key, settings.AUTH_CACHE_SECONDS)
        if cached is not MISSING:
            return cached
        result = self.database.table("tenants").select("status,tenant_type").eq("id", tenant_id).limit(1).execute()
        tenant = result.data[0] if result.data else None
        if tenant is not None:  # a missing tenant is not remembered, so a new one shows up at once
            lookups.set(key, tenant)
        return tenant

    def internal_tenant_id(self) -> str:
        result = (
            self.database.table("tenants")
            .select("id")
            .eq("tenant_type", TenantType.INTERNAL.value)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(
                status_code=503,
                detail="The TOFAA team tenant is not set up. Apply the latest database migration.",
            )
        return result.data[0]["id"]

    @staticmethod
    def _normalize_domain(value: str) -> str:
        domain = value.strip().lower().removeprefix("@").rstrip(".")
        if not domain or "." not in domain or " " in domain:
            raise HTTPException(status_code=422, detail="Email domain is invalid.")
        return domain


tenant_service = TenantService()
