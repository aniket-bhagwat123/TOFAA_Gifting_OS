"""Tenant-scoped recipient use cases."""

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from supabase import Client

from src.core import images
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, Role, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.service import tenant_service
from src.modules.recipients.schemas import RecipientCreate, RecipientList, RecipientRead, RecipientUpdate


RECIPIENT_RESPONSE_COLUMNS = (
    "id,tenant_id,name,mobile_number,address,date_of_birth,anniversary_date,budget,remark,avatar_url"
)
class RecipientService:
    """Manage recipient records with tenant checks on every lookup."""

    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def list_recipients(
        self,
        tenant_id: str,
        actor: UserProfileResponse,
        *,
        page: int,
        limit: int,
        recipient_ids: list[str] | None = None,
    ) -> RecipientList:
        require_permission(actor, Permission.RECIPIENT_READ)
        self._require_tenant_access(tenant_id, actor)
        if recipient_ids is not None and not recipient_ids:
            return RecipientList(
                items=[], pagination=PaginationMeta(page=page, limit=limit, total_records=0), next_cursor=None
            )
        offset = (page - 1) * limit
        query = (
            self.database.table("recipients")
            .select(f"{RECIPIENT_RESPONSE_COLUMNS},created_at", count="exact")
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
        )
        if recipient_ids is not None:
            # Still inside the tenant filter above, so another tenant's IDs simply match nothing.
            query = query.in_("id", recipient_ids)
        result = (
            query.order("created_at", desc=True)
            .order("id", desc=True)
            .range(offset, offset + limit - 1)
            .execute()
        )
        records = result.data or []
        total_records = result.count or 0
        return RecipientList(
            items=[RecipientRead.model_validate(item) for item in records],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total_records),
            next_cursor=next_page_cursor(page, limit, total_records),
        )

    def create_recipient(
        self,
        tenant_id: str,
        payload: RecipientCreate,
        actor: UserProfileResponse,
    ) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_CREATE)
        self._require_tenant_access(tenant_id, actor)
        values = payload.model_dump(mode="json")
        values.update(
            {
                "tenant_id": tenant_id,
                "source": "CLIENT" if actor.role == Role.CLIENT else "TOFAA",
                "created_by_user_id": actor.id,
                "updated_by_user_id": actor.id,
            }
        )
        result = (
            self.database.table("recipients")
            .insert(values)
            .select(RECIPIENT_RESPONSE_COLUMNS)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=409, detail="Recipient could not be created.")
        return RecipientRead.model_validate(result.data[0])

    def get_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        actor: UserProfileResponse,
    ) -> RecipientRead:
        record = self._get_scoped_recipient(tenant_id, recipient_id, actor)
        return RecipientRead.model_validate(record)

    def update_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        payload: RecipientUpdate,
        actor: UserProfileResponse,
    ) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        self._get_scoped_recipient(tenant_id, recipient_id, actor)
        values = payload.model_dump(mode="json", exclude_unset=True)
        values["updated_by_user_id"] = actor.id
        result = (
            self.database.table("recipients")
            .update(values)
            .eq("id", recipient_id)
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
            .select(RECIPIENT_RESPONSE_COLUMNS)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        return RecipientRead.model_validate(result.data[0])

    def soft_delete(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.RECIPIENT_DELETE)
        self._get_scoped_recipient(tenant_id, recipient_id, actor)
        result = (
            self.database.table("recipients")
            .update({
                "deleted_at": datetime.now(timezone.utc).isoformat(),
                "updated_by_user_id": actor.id,
            })
            .eq("id", recipient_id)
            .eq("tenant_id", tenant_id)
            .is_("deleted_at", "null")
            .select("id")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found.")

    def restore(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_RESTORE)
        self._require_tenant_access(tenant_id, actor)
        result = (
            self.database.table("recipients")
            .update({"deleted_at": None, "updated_by_user_id": actor.id})
            .eq("id", recipient_id)
            .eq("tenant_id", tenant_id)
            .not_.is_("deleted_at", "null")
            .select(RECIPIENT_RESPONSE_COLUMNS)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        return RecipientRead.model_validate(result.data[0])

    def _get_scoped_recipient(
        self,
        tenant_id: str,
        recipient_id: str,
        actor: UserProfileResponse,
    ) -> dict[str, Any]:
        self._require_tenant_access(tenant_id, actor)
        result = (
            self.database.table("recipients")
            .select(RECIPIENT_RESPONSE_COLUMNS)
            .eq("tenant_id", tenant_id)
            .eq("id", recipient_id)
            .is_("deleted_at", "null")
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Recipient not found.")
        return result.data[0]

    def set_avatar(
        self, tenant_id: str, recipient_id: str, actor: UserProfileResponse, *, content: bytes, content_type: str
    ) -> RecipientRead:
        """Save a photo for this person (replacing the old one)."""
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        old = self._get_scoped_recipient(tenant_id, recipient_id, actor).get("avatar_url")
        url = images.store_image(self.database, f"recipients/{tenant_id}/{recipient_id}", content, content_type)
        return self._write_avatar(tenant_id, recipient_id, actor, url, old)

    def clear_avatar(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse) -> RecipientRead:
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        old = self._get_scoped_recipient(tenant_id, recipient_id, actor).get("avatar_url")
        return self._write_avatar(tenant_id, recipient_id, actor, None, old)

    def _write_avatar(self, tenant_id: str, recipient_id: str, actor: UserProfileResponse, url: str | None, old: str | None) -> RecipientRead:
        result = (
            self.database.table("recipients")
            .update({"avatar_url": url, "updated_by_user_id": actor.id})
            .eq("id", recipient_id).eq("tenant_id", tenant_id).is_("deleted_at", "null")
            .select(RECIPIENT_RESPONSE_COLUMNS)
            .execute()
        )
        if not result.data:
            images.remove_image(self.database, url)
            raise HTTPException(status_code=404, detail="Recipient not found.")
        images.remove_image(self.database, old)
        return RecipientRead.model_validate(result.data[0])

    def _require_tenant_access(self, tenant_id: str, actor: UserProfileResponse) -> None:
        require_permission(actor, Permission.RECIPIENT_READ)
        try:
            tenant_service.require_access(tenant_id, actor)
        except HTTPException as exc:
            raise HTTPException(status_code=404, detail="Recipient not found.") from exc


recipient_service = RecipientService()
