"""Tenant and staff gift request workflow endpoints."""

from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, Request, status
from starlette.concurrency import run_in_threadpool

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.gift_requests.schemas import (
    GiftProposalUpdate,
    GiftRequestAction,
    GiftRequestApproval,
    GiftRequestCreate,
    GiftRequestEventPage,
    GiftRequestPage,
    GiftRequestRead,
    GiftRequestStatus,
    GiftRequestSummary,
    GiftRequestUpdate,
    OccasionActivity,
    ProposalImageRead,
    ReferenceFileLink,
    SendEventGiftRequest,
    SendGiftsRequest,
    SendGiftsResult,
    DuplicateRequest,
    UpcomingGiftItem,
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
    search: Annotated[str | None, Query(max_length=100)] = None,
    recipient_id: Annotated[UUID | None, Query(alias="recipientId")] = None,
    date_from: Annotated[date | None, Query(alias="dateFrom")] = None,
    date_to: Annotated[date | None, Query(alias="dateTo")] = None,
) -> ApiResponse[GiftRequestPage]:
    return ApiResponse(
        data=gift_request_service.list_for_tenant(
            str(tenant_id), actor, page=page, limit=limit, status_filter=request_status, search=search,
            recipient_id=str(recipient_id) if recipient_id else None, date_from=date_from, date_to=date_to,
        ),
        message="Gift requests retrieved successfully.",
    )


@router.get("/tenants/{tenant_id}/gift-requests/summary", response_model=ApiResponse[GiftRequestSummary])
def gift_request_summary(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[GiftRequestSummary]:
    return ApiResponse(
        data=gift_request_service.summary(str(tenant_id), actor),
        message="Gift request counts retrieved successfully.",
    )


@router.get("/tenants/{tenant_id}/gift-requests/upcoming", response_model=ApiResponse[list[UpcomingGiftItem]])
def upcoming_gift_occasions(
    tenant_id: UUID,
    actor: CurrentUserDep,
    days: Annotated[int, Query(ge=1, le=365)] = 60,
) -> ApiResponse[list[UpcomingGiftItem]]:
    return ApiResponse(
        data=gift_request_service.upcoming(str(tenant_id), actor, days=days),
        message="Upcoming birthdays and events retrieved successfully.",
    )


@router.get("/tenants/{tenant_id}/gift-requests/duplicates", response_model=ApiResponse[list[DuplicateRequest]])
def duplicate_gift_requests(
    tenant_id: UUID,
    actor: CurrentUserDep,
    recipient_id: Annotated[UUID, Query(alias="recipientId")],
    event_id: Annotated[UUID | None, Query(alias="eventId")] = None,
    occasion_id: Annotated[UUID | None, Query(alias="occasionId")] = None,
) -> ApiResponse[list[DuplicateRequest]]:
    """Open requests already raised for this person and occasion/event, so the screen can warn before a second one."""
    return ApiResponse(
        data=gift_request_service.duplicates(
            str(tenant_id), actor, recipient_id=str(recipient_id),
            event_id=str(event_id) if event_id else None, occasion_id=str(occasion_id) if occasion_id else None,
        ),
        message="Existing requests retrieved successfully.",
    )


@router.get("/tenants/{tenant_id}/gift-requests/activity", response_model=ApiResponse[OccasionActivity])
def occasion_gift_activity(tenant_id: UUID, actor: CurrentUserDep) -> ApiResponse[OccasionActivity]:
    """Gifts sent from the Occasions page: waiting on TOFAA, approved, and delivered in the last 30 days."""
    return ApiResponse(
        data=gift_request_service.occasion_activity(str(tenant_id), actor),
        message="Occasion gift activity retrieved successfully.",
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
    "/tenants/{tenant_id}/gift-requests/{request_id}/reference",
    response_model=ApiResponse[GiftRequestRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_gift_request_reference(
    tenant_id: UUID,
    request_id: UUID,
    request: Request,
    actor: CurrentUserDep,
    file_name: Annotated[str, Query(alias="fileName", min_length=1, max_length=200)] = "reference",
) -> ApiResponse[GiftRequestRead]:
    """Raw file body (Content-Type: image/png, image/jpeg or application/pdf, up to 5 MB)."""
    content = await request.body()
    data = await run_in_threadpool(
        gift_request_service.upload_reference,
        str(tenant_id), str(request_id), actor,
        content=content,
        content_type=request.headers.get("content-type", ""),
        file_name=file_name,
    )
    return ApiResponse(data=data, message="Reference attached.")


@router.delete(
    "/tenants/{tenant_id}/gift-requests/{request_id}/reference",
    response_model=ApiResponse[GiftRequestRead],
)
def remove_gift_request_reference(
    tenant_id: UUID, request_id: UUID, actor: CurrentUserDep
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.remove_reference(str(tenant_id), str(request_id), actor),
        message="Reference removed.",
    )


@router.get(
    "/tenants/{tenant_id}/gift-requests/{request_id}/reference",
    response_model=ApiResponse[ReferenceFileLink],
)
def gift_request_reference_link(
    tenant_id: UUID, request_id: UUID, actor: CurrentUserDep
) -> ApiResponse[ReferenceFileLink]:
    return ApiResponse(
        data=gift_request_service.reference_link(str(tenant_id), str(request_id), actor),
        message="Reference link created.",
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
        message="Gift request submitted to TOFAA.",
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
    payload: Annotated[GiftRequestApproval, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.transition(
            str(tenant_id), str(request_id), "approve", actor,
            note=payload.note, selected_option_index=payload.selected_option_index,
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


@router.post(
    "/tenants/{tenant_id}/occasions/{occasion_id}/send",
    response_model=ApiResponse[SendGiftsResult],
    status_code=status.HTTP_201_CREATED,
)
def send_occasion_gifts(
    tenant_id: UUID,
    occasion_id: UUID,
    payload: Annotated[SendGiftsRequest, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[SendGiftsResult]:
    """Pick groups and/or people and a budget per person; sends a gift request to TOFAA for each."""
    return ApiResponse(
        data=gift_request_service.send_gifts(str(tenant_id), "occasion", str(occasion_id), payload, actor),
        message="Gift requests sent.",
    )


@router.post(
    "/tenants/{tenant_id}/events/{event_id}/send",
    response_model=ApiResponse[SendGiftsResult],
    status_code=status.HTTP_201_CREATED,
)
def send_event_gift(
    tenant_id: UUID,
    event_id: UUID,
    payload: Annotated[SendEventGiftRequest, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[SendGiftsResult]:
    """Send a gift request for the recipient this event belongs to (birthday, anniversary, ...)."""
    return ApiResponse(
        data=gift_request_service.send_gifts(str(tenant_id), "event", str(event_id), payload, actor),
        message="Gift request sent.",
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


@router.post(
    "/admin/gift-requests/{request_id}/start-fulfilment",
    response_model=ApiResponse[GiftRequestRead],
)
def start_gift_fulfilment(request_id: UUID, actor: CurrentUserDep) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.staff_transition(str(request_id), "start_fulfilment", actor),
        message="Gift request is now in progress.",
    )


@router.post(
    "/admin/gift-requests/{request_id}/dispatch",
    response_model=ApiResponse[GiftRequestRead],
)
def dispatch_gift_request(request_id: UUID, actor: CurrentUserDep) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.staff_transition(str(request_id), "dispatch", actor),
        message="Gift request dispatched.",
    )


@router.post(
    "/admin/gift-requests/{request_id}/deliver",
    response_model=ApiResponse[GiftRequestRead],
)
def deliver_gift_request(request_id: UUID, actor: CurrentUserDep) -> ApiResponse[GiftRequestRead]:
    return ApiResponse(
        data=gift_request_service.staff_transition(str(request_id), "deliver", actor),
        message="Gift request delivered.",
    )


@router.post(
    "/admin/gift-requests/{request_id}/proposal-image",
    response_model=ApiResponse[ProposalImageRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_proposal_image(request_id: UUID, request: Request, actor: CurrentUserDep) -> ApiResponse[ProposalImageRead]:
    """Raw image body (Content-Type: image/png, image/jpeg or image/webp, up to 5 MB). Returns the photo's URL."""
    data = await run_in_threadpool(
        gift_request_service.upload_proposal_image, str(request_id), actor,
        content=await request.body(), content_type=request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Photo uploaded.")
