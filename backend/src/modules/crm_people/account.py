"""What TOFAA CRM keeps about a client: its TOFAA account owner and business contacts. Read live, for TOFAA staff."""

from uuid import UUID

from fastapi import APIRouter

from src.core.errors import ApiError
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.auth.rbac import Role
from src.modules.crm_people.client import crm_people
from src.modules.tenants.service import tenant_service

router = APIRouter(tags=["CRM account"])


@router.get("/tenants/{tenant_id}/crm-account")
def crm_account(tenant_id: UUID, actor: CurrentUserDep) -> dict:
    if actor.role == Role.CLIENT:  # the team's own notes about the account
        raise ApiError(403, "This is for the TOFAA team.")
    tenant_service.require_access(str(tenant_id), actor)
    data = crm_people.call("GET", "/account", str(tenant_id), actor, linked_retry=False)
    return {"data": data, "message": "OK"}
