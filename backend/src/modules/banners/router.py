"""Dashboard banners. Reading is open to any signed-in user; changing them is for super admins only."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Query, Request, status
from starlette.concurrency import run_in_threadpool

from src.core.schema import ApiResponse
from src.modules.auth.authorization import SuperAdminDep
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.banners.schemas import BannerCreate, BannerList, BannerRead, BannerUpdate
from src.modules.banners.service import banner_service

router = APIRouter(tags=["Banners"])


@router.get("/banners", response_model=list[BannerRead])
def live_banners(actor: CurrentUserDep, placement: Annotated[Literal["INSIGHT", "NOTE"] | None, Query()] = None) -> list[BannerRead]:
    """The banners to show this user on the dashboard right now."""
    return banner_service.live(actor, placement)


@router.get("/admin/banners", response_model=BannerList)
def manage_banners(
    actor: SuperAdminDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    placement: Annotated[Literal["INSIGHT", "NOTE"] | None, Query()] = None,
) -> BannerList:
    return banner_service.manage_list(page=page, limit=limit, placement=placement)


@router.post("/admin/banners", response_model=ApiResponse[BannerRead], status_code=status.HTTP_201_CREATED)
def create_banner(payload: Annotated[BannerCreate, Body()], actor: SuperAdminDep) -> ApiResponse[BannerRead]:
    return ApiResponse(data=banner_service.create(payload, actor), message="Banner created.")


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
    """Raw image body (Content-Type: image/png, image/jpeg or image/webp, up to 5 MB)."""
    data = await run_in_threadpool(
        banner_service.set_image, str(banner_id), content=await request.body(), content_type=request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Image saved.")
