"""Tenant-scoped recipient API routes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.recipients.schemas import RecipientCreate, RecipientList, RecipientRead, RecipientUpdate
from src.modules.recipients.service import recipient_service


router = APIRouter(tags=["Recipients"])


@router.get("/tenants/{tenant_id}/recipients", response_model=RecipientList)
def list_recipients(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> RecipientList:
    """List recipients visible to a user in the requested tenant."""
    return recipient_service.list_recipients(str(tenant_id), actor, page=page, limit=limit)


@router.post(
    "/tenants/{tenant_id}/recipients",
    response_model=ApiResponse[RecipientRead],
    status_code=status.HTTP_201_CREATED,
)
def create_recipient(
    tenant_id: UUID,
    payload: Annotated[RecipientCreate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[RecipientRead]:
    """Create a recipient under the authorized tenant."""
    return ApiResponse(
        data=recipient_service.create_recipient(str(tenant_id), payload, actor),
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
) -> ApiResponse[RecipientRead]:
    return ApiResponse(
        data=recipient_service.update_recipient(str(tenant_id), str(recipient_id), payload, actor),
        message="Recipient updated successfully.",
    )


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
