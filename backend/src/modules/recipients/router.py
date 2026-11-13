"""Tenant-scoped recipient API routes."""

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from starlette.concurrency import run_in_threadpool

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.recipients import trail
from src.modules.recipients.schemas import (
    Relationship,
    RecipientCreate,
    RecipientList,
    RecipientRead,
    RecipientStatus,
    RecipientSummary,
    RecipientUpdate,
)
from src.modules.recipients.service import recipient_service


router = APIRouter(tags=["Recipients"])

MAX_RECIPIENT_IDS = 100


def parse_recipient_ids(value: str | None) -> list[str] | None:
    """`recipientIds=a,b,c` -> a list of IDs. Missing means no filter; empty means "none"."""
    if value is None:
        return None
    parts = [part.strip() for part in value.split(",") if part.strip()]
    if len(parts) > MAX_RECIPIENT_IDS:
        raise HTTPException(status_code=422, detail=f"recipientIds can hold at most {MAX_RECIPIENT_IDS} IDs.")
    try:
        return [str(UUID(part)) for part in parts]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="recipientIds must be a comma-separated list of recipient IDs.") from exc


@router.get("/tenants/{tenant_id}/recipients", response_model=RecipientList)
def list_recipients(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    recipient_ids: Annotated[
        str | None,
        Query(
            alias="recipientIds",
            max_length=4000,
            description="Only these recipients, as comma-separated IDs (at most 100), e.g. a group's members.",
        ),
    ] = None,
    search: Annotated[str | None, Query(max_length=100, description="Matches name, mobile number or city.")] = None,
    relationship: Annotated[Relationship | None, Query()] = None,
    city: Annotated[str | None, Query(max_length=100)] = None,
    group_id: Annotated[UUID | None, Query(alias="groupId", description="Only members of this recipient group.")] = None,
    status_filter: Annotated[RecipientStatus | None, Query(alias="status")] = None,
    upcoming_days: Annotated[
        int | None,
        Query(alias="upcomingDays", ge=1, le=366, description="Only people whose next birthday/anniversary is within this many days."),
    ] = None,
    sort: Annotated[Literal["name", "city", "mobile", "created", "nextOccasion"], Query()] = "created",
    order: Annotated[Literal["asc", "desc"] | None, Query()] = None,
) -> RecipientList:
    """List recipients visible to a user in the requested tenant. Every filter is optional."""
    return recipient_service.list_recipients(
        str(tenant_id),
        actor,
        page=page,
        limit=limit,
        recipient_ids=parse_recipient_ids(recipient_ids),
        search=search,
        relationship=relationship,
        city=city,
        group_id=str(group_id) if group_id else None,
        status=status_filter,
        upcoming_days=upcoming_days,
        sort=sort,
        # Newest first unless told otherwise; names, cities and dates read best A→Z / soonest first.
        descending=(order == "desc") if order else sort == "created",
    )


@router.get("/tenants/{tenant_id}/recipients/duplicates", response_model=ApiResponse[list[dict]])
def possible_duplicates(
    tenant_id: UUID,
    actor: CurrentUserDep,
    name: Annotated[str | None, Query(max_length=200)] = None,
    mobile_number: Annotated[str | None, Query(alias="mobileNumber", max_length=20)] = None,
    email: Annotated[str | None, Query(max_length=254)] = None,
) -> ApiResponse[list[dict]]:
    """Recipients that look like the person being added (same mobile, same email or a very similar name)."""
    return ApiResponse(
        data=recipient_service.find_duplicates(str(tenant_id), actor, name=name, mobile_number=mobile_number, email=email),
        message="Possible duplicates retrieved.",
    )


@router.get("/tenants/{tenant_id}/recipients/summary", response_model=RecipientSummary)
def recipients_summary(tenant_id: UUID, actor: CurrentUserDep) -> RecipientSummary:
    """Totals plus the cities and relationships to offer in the page's filters."""
    return recipient_service.summary(str(tenant_id), actor)


@router.post(
    "/tenants/{tenant_id}/recipients",
    response_model=ApiResponse[RecipientRead],
    status_code=status.HTTP_201_CREATED,
)
def create_recipient(
    tenant_id: UUID,
    payload: Annotated[RecipientCreate, Body()],
    actor: CurrentUserDep,
    request: Request,
) -> ApiResponse[RecipientRead]:
    """Create a recipient under the authorized tenant. Only the name is required.

    Answers 409 with the possible matches in ``data.duplicates`` when the person may already exist; send
    ``allowDuplicate: true`` once the user has confirmed they are different. ``X-Change-Source`` records where
    the information came from (MANUAL, EXCEL_IMPORT, CALL, WHATSAPP, MEETING, EMAIL, OTHER).
    """
    return ApiResponse(
        data=recipient_service.create_recipient(str(tenant_id), payload, actor, source=trail.source_of(request.headers.get(trail.SOURCE_HEADER))),
        message="Recipient added successfully.",
    )


@router.get("/tenants/{tenant_id}/recipients/{recipient_id}", response_model=RecipientRead)
def get_recipient(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> RecipientRead:
    return recipient_service.get_recipient(str(tenant_id), str(recipient_id), actor)


@router.patch(
    "/tenants/{tenant_id}/recipients/{recipient_id}",
    response_model=ApiResponse[RecipientRead],
)
def update_recipient(
    tenant_id: UUID,
    recipient_id: UUID,
    payload: Annotated[RecipientUpdate, Body()],
    actor: CurrentUserDep,
    request: Request,
) -> ApiResponse[RecipientRead]:
    """Edit a recipient. Send the ``version`` you loaded: if someone saved first the API answers 409 with their copy."""
    return ApiResponse(
        data=recipient_service.update_recipient(
            str(tenant_id), str(recipient_id), payload, actor, source=trail.source_of(request.headers.get(trail.SOURCE_HEADER))
        ),
        message="Recipient updated successfully.",
    )


@router.put(
    "/tenants/{tenant_id}/recipients/{recipient_id}/avatar",
    response_model=ApiResponse[RecipientRead],
)
async def upload_recipient_avatar(
    tenant_id: UUID, recipient_id: UUID, request: Request, actor: CurrentUserDep
) -> ApiResponse[RecipientRead]:
    """Raw image body (Content-Type: image/png, image/jpeg or image/webp, up to 2 MB)."""
    data = await run_in_threadpool(
        recipient_service.set_avatar, str(tenant_id), str(recipient_id), actor,
        content=await request.body(), content_type=request.headers.get("content-type", ""),
    )
    return ApiResponse(data=data, message="Photo saved.")


@router.delete(
    "/tenants/{tenant_id}/recipients/{recipient_id}/avatar",
    response_model=ApiResponse[RecipientRead],
)
def remove_recipient_avatar(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> ApiResponse[RecipientRead]:
    return ApiResponse(data=recipient_service.clear_avatar(str(tenant_id), str(recipient_id), actor), message="Photo removed.")


@router.delete(
    "/tenants/{tenant_id}/recipients/{recipient_id}",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
    responses={
        401: {"description": "Missing or invalid bearer token."},
        403: {"description": "The user does not have permission to delete recipients."},
        404: {"description": "Recipient not found in this tenant."},
        500: {"description": "Unexpected server error. Include the X-Request-Id when reporting it."},
    },
)
def delete_recipient(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> ApiResponse[dict]:
    recipient_service.soft_delete(str(tenant_id), str(recipient_id), actor)
    return ApiResponse(data={}, message="Recipient deleted successfully.")


@router.post(
    "/tenants/{tenant_id}/recipients/{recipient_id}/restore",
    response_model=ApiResponse[RecipientRead],
)
def restore_recipient(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> ApiResponse[RecipientRead]:
    return ApiResponse(
        data=recipient_service.restore(str(tenant_id), str(recipient_id), actor),
        message="Recipient restored successfully.",
    )
