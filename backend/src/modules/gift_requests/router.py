"""Tenant and staff gift request workflow endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.gift_requests.schemas import (
    GiftProposalUpdate,
    GiftRequestAction,
    GiftRequestCreate,
    GiftRequestEventPage,
    GiftRequestPage,
    GiftRequestRead,
    GiftRequestStatus,
    GiftRequestUpdate,
)
from src.modules.gift_requests.service import gift_request_service

router = APIRouter(tags=["Gift Requests"])


@router.post(
    "/tenants/{tenant_id}/gift-requests",
    response_model=ApiResponse[GiftRequestRead],
    status_code=status.HTTP_201_CREATED,
)
def create_gift_request(
    tenant_id: UUID, payload: Annotated[GiftRequestCreate, Body()], actor: CurrentUserDep
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.create(str(tenant_id), payload, actor),
        message="Gift request draft created.",
    )


@router.get("/tenants/{tenant_id}/gift-requests", response_model=ApiResponse[GiftRequestPage])
def list_gift_requests(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    request_status: Annotated[GiftRequestStatus | None, Query(alias="status")] = None,
) -> ApiResponse[GiftRequestPage]:
    return ApiResponse(
        data=gift_request_service.list_for_tenant(
            str(tenant_id), actor, page=page, limit=limit, status_filter=request_status
        ),
        message="Gift requests retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/gift-requests/{request_id}",
    response_model=ApiResponse[GiftRequestRead],
)
def get_gift_request(
    tenant_id: UUID, request_id: UUID, actor: CurrentUserDep
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.get(str(tenant_id), str(request_id), actor),
        message="Gift request retrieved successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/gift-requests/{request_id}/history",
    response_model=ApiResponse[GiftRequestEventPage],
)
def gift_request_history(
    tenant_id: UUID, request_id: UUID, actor: CurrentUserDep
) -> ApiResponse[GiftRequestEventPage]:
    return ApiResponse(
        data=gift_request_service.history(str(tenant_id), str(request_id), actor),
        message="Gift request history retrieved successfully.",
    )


@router.patch(
    "/tenants/{tenant_id}/gift-requests/{request_id}",
    response_model=ApiResponse[GiftRequestRead],
)
def update_gift_request(
    tenant_id: UUID,
    request_id: UUID,
    payload: Annotated[GiftRequestUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.update(str(tenant_id), str(request_id), payload, actor),
        message="Gift request draft updated.",
    )


@router.post(
    "/tenants/{tenant_id}/gift-requests/{request_id}/submit",
    response_model=ApiResponse[GiftRequestRead],
)
def submit_gift_request(
    tenant_id: UUID, request_id: UUID, actor: CurrentUserDep
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.transition(
            str(tenant_id), str(request_id), "submit", actor
        ),
        message="Gift request submitted for review.",
    )


@router.post(
    "/tenants/{tenant_id}/gift-requests/{request_id}/cancel",
    response_model=ApiResponse[GiftRequestRead],
)
def cancel_gift_request(
    tenant_id: UUID,
    request_id: UUID,
    payload: Annotated[GiftRequestAction, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.transition(
            str(tenant_id), str(request_id), "cancel", actor, note=payload.note
        ),
        message="Gift request cancelled.",
    )


@router.post(
    "/tenants/{tenant_id}/gift-requests/{request_id}/approve",
    response_model=ApiResponse[GiftRequestRead],
)
def approve_gift_proposal(
    tenant_id: UUID,
    request_id: UUID,
    payload: Annotated[GiftRequestAction, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.transition(
            str(tenant_id), str(request_id), "approve", actor, note=payload.note
        ),
        message="Gift proposal approved.",
    )


@router.post(
    "/tenants/{tenant_id}/gift-requests/{request_id}/request-changes",
    response_model=ApiResponse[GiftRequestRead],
)
def request_gift_proposal_changes(
    tenant_id: UUID,
    request_id: UUID,
    payload: Annotated[GiftRequestAction, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.transition(
            str(tenant_id), str(request_id), "request_changes", actor, note=payload.note
        ),
        message="Proposal changes requested.",
    )


@router.get("/admin/gift-requests", response_model=ApiResponse[GiftRequestPage])
def staff_gift_request_queue(
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    request_status: Annotated[GiftRequestStatus | None, Query(alias="status")] = None,
) -> ApiResponse[GiftRequestPage]:
    return ApiResponse(
        data=gift_request_service.staff_queue(
            actor, page=page, limit=limit, status_filter=request_status
        ),
        message="Gift request queue retrieved successfully.",
    )


@router.post(
    "/admin/gift-requests/{request_id}/start-review",
    response_model=ApiResponse[GiftRequestRead],
)
def start_gift_request_review(
    request_id: UUID, actor: CurrentUserDep
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.staff_transition(
            str(request_id), "start_review", actor
        ),
        message="Gift request moved into review.",
    )


@router.post(
    "/admin/gift-requests/{request_id}/request-info",
    response_model=ApiResponse[GiftRequestRead],
)
def request_gift_request_information(
    request_id: UUID,
    payload: Annotated[GiftRequestAction, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.staff_transition(
            str(request_id), "request_info", actor, note=payload.note
        ),
        message="Additional information requested from the client.",
    )


@router.put(
    "/admin/gift-requests/{request_id}/proposal",
    response_model=ApiResponse[GiftRequestRead],
)
def publish_gift_proposal(
    request_id: UUID,
    payload: Annotated[GiftProposalUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    proposal = payload.model_dump(mode="json", by_alias=True)
    return ApiResponse(
        data=gift_request_service.staff_transition(
            str(request_id), "publish_proposal", actor,
            note=payload.note, proposal=proposal,
        ),
        message="Gift proposal sent to the client.",
    )


@router.post(
    "/admin/gift-requests/{request_id}/reject",
    response_model=ApiResponse[GiftRequestRead],
)
def reject_gift_request(
    request_id: UUID,
    payload: Annotated[GiftRequestAction, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.staff_transition(
            str(request_id), "reject", actor, note=payload.note
        ),
        message="Gift request rejected.",
    )
