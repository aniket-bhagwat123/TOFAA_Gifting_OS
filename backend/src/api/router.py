from fastapi import APIRouter

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
from src.modules.tenants.router import router as tenants_router
from src.modules.users.router import router as users_router

api_router = APIRouter()

# Mount authentication module routes
api_router.include_router(auth_router)
api_router.include_router(credits_router)
api_router.include_router(contract_workspace_router)
api_router.include_router(events_router)
api_router.include_router(gift_requests_router)
api_router.include_router(gift_spend_router)
api_router.include_router(occasions_router)
api_router.include_router(recipients_router)
api_router.include_router(tenants_router)
api_router.include_router(users_router)


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
            "APPROVED", "REJECTED", "CANCELLED", "COMPLETED"
        ],
        "giftStatuses": [
            "PLANNED", "IN_PREPARATION", "DISPATCHED", "IN_TRANSIT", "DELIVERED", "ISSUE_REPORTED", "CANCELLED"
        ],
    }
