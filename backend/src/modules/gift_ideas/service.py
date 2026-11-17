"""Gift ideas: everyone reads the active ones, super admins create, edit and delete them."""

from typing import Any

from fastapi import HTTPException
from supabase import Client

from src.core.pagination import PaginationMeta, next_page_cursor
from src.core.supabase import get_supabase_admin_client
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse
from src.modules.gift_ideas.schemas import GiftIdeaCreate, GiftIdeaList, GiftIdeaRead, GiftIdeaUpdate, date_text

TABLE = "gift_ideas"
COLUMNS = "id,occasion,gift_idea,category,gift_to,start_date,end_date,date_label,is_active,created_at,updated_at"


class GiftIdeaService:
    def __init__(self, database: Client | None = None) -> None:
        self.database = database or get_supabase_admin_client()

    def list(self, actor: UserProfileResponse, *, page: int, limit: int, search: str | None) -> GiftIdeaList:
        """Super admins see every idea; everyone else only the active ones. Dated ideas come first, in calendar order."""
        query = self.database.table(TABLE).select(COLUMNS, count="exact")
        if actor.role != Role.SUPER_ADMIN:
            query = query.eq("is_active", True)
        term = (search or "").strip().replace(",", " ").replace("(", " ").replace(")", " ").replace("%", " ")
        if term:
            query = query.or_(f"occasion.ilike.%{term}%,gift_idea.ilike.%{term}%,category.ilike.%{term}%")
        offset = (page - 1) * limit
        result = query.order("start_date", desc=False, nullsfirst=False).order("occasion").range(offset, offset + limit - 1).execute()
        total = result.count or 0
        return GiftIdeaList(
            items=[GiftIdeaRead.model_validate(row) for row in result.data or []],
            pagination=PaginationMeta(page=page, limit=limit, total_records=total),
            next_cursor=next_page_cursor(page, limit, total),
        )

    def create(self, payload: GiftIdeaCreate, actor: UserProfileResponse) -> GiftIdeaRead:
        values = payload.model_dump(mode="json") | {"created_by_user_id": actor.id, "date_label": date_text(payload.start_date, payload.end_date)}
        data = self.database.table(TABLE).insert(values).execute().data
        if not data:
            raise HTTPException(status_code=500, detail="The gift idea could not be saved.")
        return GiftIdeaRead.model_validate(data[0])

    def update(self, idea_id: str, payload: GiftIdeaUpdate) -> GiftIdeaRead:
        current = self._row(idea_id)
        changes = payload.model_dump(mode="json", exclude_unset=True)
        if "start_date" in changes or "end_date" in changes:
            start = payload.start_date if "start_date" in changes else self._date(current.get("start_date"))
            end = payload.end_date if "end_date" in changes else self._date(current.get("end_date"))
            if end and (start is None or end < start):
                raise HTTPException(status_code=422, detail="The end date must not be before the start date.")
            changes["date_label"] = date_text(start, end)
        data = self.database.table(TABLE).update(changes).eq("id", idea_id).execute().data
        if not data:
            raise HTTPException(status_code=404, detail="Gift idea not found.")
        return GiftIdeaRead.model_validate(data[0])

    def delete(self, idea_id: str) -> None:
        self._row(idea_id)
        self.database.table(TABLE).delete().eq("id", idea_id).execute()

    @staticmethod
    def _date(value: Any):
        from datetime import date

        return date.fromisoformat(str(value)[:10]) if value else None

    def _row(self, idea_id: str) -> dict[str, Any]:
        data = self.database.table(TABLE).select(COLUMNS).eq("id", idea_id).limit(1).execute().data
        if not data:
            raise HTTPException(status_code=404, detail="Gift idea not found.")
        return data[0]


gift_idea_service = GiftIdeaService()
