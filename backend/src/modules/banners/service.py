"""Dashboard banners: everyone reads the live ones, super admins manage them."""

from datetime import date
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from supabase import Client

from src.core import images
from src.core.config import settings
from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.core.ttl_cache import MISSING, lookups
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse
from src.modules.banners.schemas import BannerCreate, BannerList, BannerRead, BannerUpdate

COLUMNS = "id,audience,image_url,sort_order,is_active,starts_on,ends_on,created_at,updated_at"
MAX_LIVE = 50
BANNER_RATIO = (1000, 90)  # any size with this shape is accepted
BANNER_MIN_WIDTH = 500


def is_live(row: dict[str, Any], today: date) -> bool:
    """Active, and today falls inside its optional start/end dates."""
    if not row.get("is_active"):
        return False
    starts, ends = row.get("starts_on"), row.get("ends_on")
    return not ((starts and date.fromisoformat(str(starts)) > today) or (ends and date.fromisoformat(str(ends)) < today))


def audience_allows(audience: str, actor: UserProfileResponse) -> bool:
    return audience == "ALL" or (audience == "CLIENT") == (actor.role == Role.CLIENT)


class BannerService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def live(self, actor: UserProfileResponse) -> list[BannerRead]:
        """The banners this user should see today, in the order a super admin set. Remembered briefly; any write clears it."""
        key = ("banners-live",)
        rows = lookups.get(key, settings.AUTH_CACHE_SECONDS)
        if rows is MISSING:
            rows = (
                self.database.table("dashboard_banners").select(COLUMNS).eq("is_active", True)
                .order("sort_order").order("created_at").limit(MAX_LIVE).execute().data or []
            )
            lookups.set(key, rows)
        today = date.today()
        return [
            BannerRead.model_validate(row) for row in rows
            if is_live(row, today) and audience_allows(row["audience"], actor)
        ]

    def manage_list(self, *, page: int, limit: int) -> BannerList:
        query = self.database.table("dashboard_banners").select(COLUMNS, count="exact")
        offset = (page - 1) * limit
        result = query.order("sort_order").order("created_at").range(offset, offset + limit - 1).execute()
        total = result.count or 0
        return BannerList(
            items=[BannerRead.model_validate(row) for row in result.data or []],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def get(self, banner_id: str) -> BannerRead:
        return BannerRead.model_validate(self._row(banner_id))

    def create(self, payload: BannerCreate, actor: UserProfileResponse, *, content: bytes, content_type: str) -> BannerRead:
        url = self._store(uuid4().hex, content, content_type)
        values = payload.model_dump(mode="json") | {"image_url": url, "created_by_user_id": actor.id}
        try:
            data = self.database.table("dashboard_banners").insert(values).execute().data
        except Exception:
            images.remove_image(self.database, url)
            raise
        if not data:
            images.remove_image(self.database, url)
            raise HTTPException(status_code=500, detail="The banner could not be saved.")
        return BannerRead.model_validate(data[0])

    def update(self, banner_id: str, payload: BannerUpdate) -> BannerRead:
        self._row(banner_id)
        changes = payload.model_dump(mode="json", exclude_unset=True)
        data = self.database.table("dashboard_banners").update(changes).eq("id", banner_id).execute().data
        if not data:
            raise HTTPException(status_code=404, detail="Banner not found.")
        return BannerRead.model_validate(data[0])

    def delete(self, banner_id: str) -> None:
        row = self._row(banner_id)
        self.database.table("dashboard_banners").delete().eq("id", banner_id).execute()
        images.remove_image(self.database, row.get("image_url"))

    def set_image(self, banner_id: str, *, content: bytes, content_type: str) -> BannerRead:
        old = self._row(banner_id).get("image_url")
        url = self._store(banner_id, content, content_type)
        data = self.database.table("dashboard_banners").update({"image_url": url}).eq("id", banner_id).execute().data
        images.remove_image(self.database, old)
        return BannerRead.model_validate(data[0])

    def _store(self, folder: str, content: bytes, content_type: str) -> str:
        return images.store_image(
            self.database, f"banners/{folder}", content, content_type, max_bytes=images.PHOTO_MAX_BYTES, aspect_ratio=BANNER_RATIO, min_width=BANNER_MIN_WIDTH,
        )

    def _row(self, banner_id: str) -> dict[str, Any]:
        data = self.database.table("dashboard_banners").select(COLUMNS).eq("id", banner_id).limit(1).execute().data
        if not data:
            raise HTTPException(status_code=404, detail="Banner not found.")
        return data[0]


banner_service = BannerService()
