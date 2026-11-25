"""Dashboard banners for any signed-in user. They are managed in TOFAA CRM (see service.py)."""

from fastapi import APIRouter

from src.modules.auth.dependencies import CurrentUserDep
from src.modules.crm_banners.service import CrmBanner, crm_banners

router = APIRouter(tags=["Banners"])


@router.get("/banners", response_model=list[CrmBanner])
def live_banners(actor: CurrentUserDep) -> list[CrmBanner]:
    """The banners to show on the dashboard right now (from the CRM; empty when it cannot be reached)."""
    _ = actor
    return crm_banners.live()
