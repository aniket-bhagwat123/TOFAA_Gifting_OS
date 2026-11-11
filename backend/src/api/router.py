from fastapi import APIRouter, Depends

from src.modules.auth.dependencies import CurrentUserDep
from src.modules.auth.schemas import UserProfileResponse
from src.modules.auth.rbac import Role
from src.modules.auth.router import router as auth_router
from src.modules.credits.router import router as credits_router
from src.modules.contract_workspace.router import router as contract_workspace_router
from src.modules.events.router import router as events_router
from src.modules.gift_requests.router import router as gift_requests_router
from src.modules.gift_spend.router import router as gift_spend_router
from src.modules.occasions.router import router as occasions_router
from src.modules.recipients.router import router as recipients_router
from src.modules.tenants.guard import enforce_tenant_scope
from src.modules.tenants.router import activity_router, router as tenants_router
from src.modules.users.router import invitation_router, router as users_router, team_router

api_router = APIRouter()

# Authentication routes run before a tenant context exists. Tenant management must reach a
# deactivated tenant in order to reactivate it, and its service applies its own role and scope checks.
api_router.include_router(auth_router)
api_router.include_router(invitation_router)
api_router.include_router(tenants_router)

# Everything else validates the tenant ID on every request.
tenant_scoped = [Depends(enforce_tenant_scope)]
api_router.include_router(credits_router, dependencies=tenant_scoped)
api_router.include_router(contract_workspace_router, dependencies=tenant_scoped)
api_router.include_router(events_router, dependencies=tenant_scoped)
api_router.include_router(gift_requests_router, dependencies=tenant_scoped)
api_router.include_router(gift_spend_router, dependencies=tenant_scoped)
api_router.include_router(occasions_router, dependencies=tenant_scoped)
api_router.include_router(recipients_router, dependencies=tenant_scoped)
api_router.include_router(users_router, dependencies=tenant_scoped)
api_router.include_router(activity_router, dependencies=tenant_scoped)

# TOFAA staff accounts live in the internal tenant, which is looked up on the server, not named in the URL.
api_router.include_router(team_router)


@api_router.get("/me", response_model=UserProfileResponse, tags=["Shared API"])
def current_profile(current_user: CurrentUserDep) -> UserProfileResponse:
    """Return the authenticated profile and resolved tenant context."""
    return current_user


@api_router.get("/reference-data", tags=["Shared API"])
def reference_data(current_user: CurrentUserDep) -> dict[str, list[str]]:
    """Return the Phase 1 enums used by client forms."""
    _ = current_user
    return {
        "roles": [role.value for role in Role],
        "slaTiers": ["VVIP", "EXECUTIVE", "STANDARD"],
        "requestStatuses": [
            "DRAFT", "SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "PROPOSAL_READY",
            "CONFIRMED", "IN_PROGRESS", "DISPATCHED", "DELIVERED", "CANCELLED"
        ],
        "giftStatuses": [
            "PLANNED", "IN_PREPARATION", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "ISSUE_REPORTED", "CANCELLED"
        ],
    }
