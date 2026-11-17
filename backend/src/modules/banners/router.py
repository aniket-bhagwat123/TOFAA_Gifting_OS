"""Dashboard banners. Reading is open to any signed-in user; changing them is for super admins only."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, Request, status
from starlette.concurrency import run_in_threadpool

from src.core.schema import ApiResponse
from src.modules.auth.authorization import SuperAdminDep
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.banners.schemas import Audience, BannerCreate, BannerList, BannerRead, BannerUpdate
from src.modules.banners.service import banner_service

router = APIRouter(tags=["Banners"])


@router.get("/banners", response_model=list[BannerRead])
def live_banners(actor: CurrentUserDep) -> list[BannerRead]:
    """The banners to show this user on the dashboard right now."""
    return banner_service.live(actor)


@router.get("/admin/banners", response_model=BannerList)
def manage_banners(
    actor: SuperAdminDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> BannerList:
    return banner_service.manage_list(page=page, limit=limit)


@router.post("/admin/banners", response_model=ApiResponse[BannerRead], status_code=status.HTTP_201_CREATED)
async def create_banner(
    request: Request,
    actor: SuperAdminDep,
    audience: Annotated[Audience, Query()] = "ALL",
    sort_order: Annotated[int, Query(ge=0, le=9999)] = 0,
    is_active: bool = True,
    starts_on: date | None = None,
    ends_on: date | None = None,
) -> ApiResponse[BannerRead]:
    """Raw image body (PNG, JPEG or WebP, exactly 1000 x 90 px, up to 5 MB); the settings go in the query string."""
    payload = BannerCreate(audience=audience, sort_order=sort_order, is_active=is_active, starts_on=starts_on, ends_on=ends_on)
    data = await run_in_threadpool(
        banner_service.create, payload, actor, content=await request.body(), content_type=request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Banner created.")


@router.get("/admin/banners/{banner_id}", response_model=BannerRead)
def get_banner(banner_id: UUID, actor: SuperAdminDep) -> BannerRead:
    return banner_service.get(str(banner_id))


@router.patch("/admin/banners/{banner_id}", response_model=ApiResponse[BannerRead])
def update_banner(banner_id: UUID, payload: Annotated[BannerUpdate, Body()], actor: SuperAdminDep) -> ApiResponse[BannerRead]:
    return ApiResponse(data=banner_service.update(str(banner_id), payload), message="Banner updated.")


@router.delete("/admin/banners/{banner_id}", response_model=ApiResponse[dict])
def delete_banner(banner_id: UUID, actor: SuperAdminDep) -> ApiResponse[dict]:
    banner_service.delete(str(banner_id))
    return ApiResponse(data={}, message="Banner deleted.")


@router.put("/admin/banners/{banner_id}/image", response_model=ApiResponse[BannerRead])
async def upload_banner_image(banner_id: UUID, request: Request, actor: SuperAdminDep) -> ApiResponse[BannerRead]:
    """Replace the picture. Raw image body (PNG, JPEG or WebP, exactly 1000 x 90 px, up to 5 MB)."""
    data = await run_in_threadpool(
        banner_service.set_image, str(banner_id), content=await request.body(), content_type=request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Image saved.")
