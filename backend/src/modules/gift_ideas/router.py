"""Gift ideas. Reading is open to any signed-in user; changing them is for super admins only."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.authorization import SuperAdminDep
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.gift_ideas.schemas import GiftIdeaCreate, GiftIdeaList, GiftIdeaRead, GiftIdeaUpdate
from src.modules.gift_ideas.service import gift_idea_service

router = APIRouter(tags=["Gift ideas"])


@router.get("/gift-ideas", response_model=GiftIdeaList)
def list_gift_ideas(
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    search: Annotated[str | None, Query(max_length=100)] = None,
) -> GiftIdeaList:
    """The gifting calendar: every active idea, dated ones first in calendar order (super admins also see the hidden ones)."""
    return gift_idea_service.list(actor, page=page, limit=limit, search=search)


@router.post("/admin/gift-ideas", response_model=ApiResponse[GiftIdeaRead], status_code=status.HTTP_201_CREATED)
def create_gift_idea(payload: Annotated[GiftIdeaCreate, Body()], actor: SuperAdminDep) -> ApiResponse[GiftIdeaRead]:
    return ApiResponse(data=gift_idea_service.create(payload, actor), message="Gift idea created.")


@router.patch("/admin/gift-ideas/{idea_id}", response_model=ApiResponse[GiftIdeaRead])
def update_gift_idea(idea_id: UUID, payload: Annotated[GiftIdeaUpdate, Body()], actor: SuperAdminDep) -> ApiResponse[GiftIdeaRead]:
    return ApiResponse(data=gift_idea_service.update(str(idea_id), payload), message="Gift idea updated.")


@router.delete("/admin/gift-ideas/{idea_id}", response_model=ApiResponse[dict])
def delete_gift_idea(idea_id: UUID, actor: SuperAdminDep) -> ApiResponse[dict]:
    gift_idea_service.delete(str(idea_id))
    return ApiResponse(data={}, message="Gift idea deleted.")

