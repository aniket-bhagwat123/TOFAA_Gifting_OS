"""Import history: record each recipient import and revert one later (delete what it created)."""

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from postgrest.exceptions import APIError
from supabase import Client

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Permission, require_permission
from src.modules.auth.schemas import UserProfileResponse
from src.modules.imports.schemas import ImportBatchFinish, ImportBatchList, ImportBatchRead, ImportBatchStart, RevertResult
from src.modules.recipients import trail
from src.modules.tenants.service import tenant_service

TABLE = "import_batches"
CHUNK = 150


def _missing_table(exc: APIError) -> HTTPException | None:
    """The migration that creates import_batches has not been applied yet."""
    if exc.code in ("PGRST205", "42P01", "PGRST204"):
        return HTTPException(status_code=503, detail="A database update is missing (import history). Apply the latest migrations, then retry.")
    return None


def _name(actor: UserProfileResponse) -> str:
    return (actor.full_name or "").strip() or str(actor.email).split("@")[0] or "Unknown"


class ImportService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def _access(self, tenant_id: str, actor: UserProfileResponse, permission: Permission, *, write: bool = False) -> None:
        require_permission(actor, permission)
        tenant_service.require_context(tenant_id, actor, write=write) if write else tenant_service.require_access(tenant_id, actor)

    def start(self, tenant_id: str, payload: ImportBatchStart, actor: UserProfileResponse) -> ImportBatchRead:
        self._access(tenant_id, actor, Permission.RECIPIENT_CREATE)
        values = {"tenant_id": tenant_id, "kind": "RECIPIENTS", "file_name": payload.file_name, "total_rows": payload.total_rows,
                  "created_by_user_id": actor.id, "created_by_name": _name(actor)}
        try:
            data = self.database.table(TABLE).insert(values).execute().data
        except APIError as exc:
            raise (_missing_table(exc) or exc) from exc
        if not data:
            raise HTTPException(status_code=500, detail="The import could not be recorded.")
        return ImportBatchRead.model_validate(data[0])

    def finish(self, tenant_id: str, batch_id: str, payload: ImportBatchFinish, actor: UserProfileResponse) -> ImportBatchRead:
        self._access(tenant_id, actor, Permission.RECIPIENT_CREATE)
        self._row(tenant_id, batch_id)
        changes = {"created_count": payload.created_count, "failed_count": payload.failed_count,
                   "groups_created": [str(g) for g in payload.groups_created], "groups_updated": payload.groups_updated}
        data = self.database.table(TABLE).update(changes).eq("tenant_id", tenant_id).eq("id", batch_id).execute().data
        return ImportBatchRead.model_validate(data[0])

    def list(self, tenant_id: str, actor: UserProfileResponse, *, page: int, limit: int) -> ImportBatchList:
        self._access(tenant_id, actor, Permission.RECIPIENT_READ)
        offset = (page - 1) * limit
        try:
            result = (
                self.database.table(TABLE).select("*", count="exact").eq("tenant_id", tenant_id)
                .order("created_at", desc=True).range(offset, offset + limit - 1).execute()
            )
        except APIError as exc:
            raise (_missing_table(exc) or exc) from exc
        total = result.count or 0
        return ImportBatchList(
            items=[ImportBatchRead.model_validate(row) for row in result.data or []],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def revert(self, tenant_id: str, batch_id: str, actor: UserProfileResponse) -> RevertResult:
        """Delete the people this import created, take them out of groups, and remove the groups the import made if nobody is left in them.
        The number of queries depends on the number of 150-person chunks, never on one query per person."""
        self._access(tenant_id, actor, Permission.RECIPIENT_DELETE, write=True)
        batch = self._row(tenant_id, batch_id)
        if batch["status"] == "REVERTED":
            raise HTTPException(status_code=409, detail="This import has already been reverted.")
        db = self.database
        rows = db.table("recipients").select("id").eq("tenant_id", tenant_id).eq("import_batch_id", batch_id).is_("deleted_at", "null").limit(100_000).execute().data or []
        ids = [str(r["id"]) for r in rows]
        now = datetime.now(timezone.utc).isoformat()
        for start in range(0, len(ids), CHUNK):
            part = ids[start:start + CHUNK]
            db.table("recipients").update({"deleted_at": now, "updated_by_user_id": actor.id}).eq("tenant_id", tenant_id).in_("id", part).is_("deleted_at", "null").execute()
            db.table("spend_recipient_group_members").delete().eq("tenant_id", tenant_id).in_("recipient_id", part).execute()
        trail.record_many(db, tenant_id, ids, actor, "DELETE", "EXCEL_IMPORT")

        removed_groups = 0
        created = [str(g) for g in batch.get("groups_created") or []]
        if created:
            still_used = {str(m["group_id"]) for m in db.table("spend_recipient_group_members").select("group_id").eq("tenant_id", tenant_id).in_("group_id", created).execute().data or []}
            empty = [g for g in created if g not in still_used]
            if empty:
                try:
                    removed_groups = len(db.table("spend_recipient_groups").delete().eq("tenant_id", tenant_id).in_("id", empty).select("id").execute().data or [])
                except Exception:  # noqa: BLE001 - a group an occasion already uses is kept
                    removed_groups = 0
        db.table(TABLE).update({"status": "REVERTED", "reverted_at": now, "reverted_by_name": _name(actor)}).eq("tenant_id", tenant_id).eq("id", batch_id).execute()
        return RevertResult(recipients_removed=len(ids), groups_removed=removed_groups)

    def _row(self, tenant_id: str, batch_id: str) -> dict[str, Any]:
        data = self.database.table(TABLE).select("*").eq("tenant_id", tenant_id).eq("id", batch_id).limit(1).execute().data
        if not data:
            raise HTTPException(status_code=404, detail="Import not found.")
        return data[0]


import_service = ImportService()
