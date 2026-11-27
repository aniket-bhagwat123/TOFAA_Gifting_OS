"""Dashboard banners for any signed-in user. They are managed in TOFAA CRM (see service.py)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query

from src.modules.auth.dependencies import CurrentUserDep
from src.modules.auth.rbac import Role
from src.modules.crm_banners.service import CrmBanner, crm_banners
from src.modules.tenants.service import tenant_service

router = APIRouter(tags=["Banners"])


@router.get("/banners", response_model=list[CrmBanner])
def live_banners(actor: CurrentUserDep, tenant_id: Annotated[UUID | None, Query(alias="tenantId")] = None) -> list[CrmBanner]:
    """The banners to show on the dashboard right now, for the client being viewed (from the CRM; empty when it cannot be
    reached). A client user always gets their own organisation's; staff only for clients they may open."""
    tenant = str(tenant_id) if tenant_id else actor.tenant_id if actor.role == Role.CLIENT else None
    if tenant:
        tenant_service.require_access(tenant, actor)
    return crm_banners.live(tenant)
