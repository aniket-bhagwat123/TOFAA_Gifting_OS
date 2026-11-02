"""Tenant and recipient event CRUD routes."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Body, Query, status

from src.core.schema import ApiResponse
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.events.schemas import EventCreate, EventList, EventRead, EventUpdate
from src.modules.events.service import event_service

router = APIRouter(tags=["Events"])


@router.get("/tenants/{tenant_id}/events", response_model=EventList)
def list_tenant_events(
    tenant_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    recipient_id: Annotated[UUID | None, Query()] = None,
) -> EventList:
    return event_service.list_tenant_events(
        str(tenant_id),
        actor,
        page=page,
        limit=limit,
        recipient_id=str(recipient_id) if recipient_id else None,
    )


@router.post(
    "/tenants/{tenant_id}/events",
    response_model=ApiResponse[EventRead],
    status_code=status.HTTP_201_CREATED,
)
def create_tenant_event(
    tenant_id: UUID,
    payload: Annotated[EventCreate, Body()],
    actor: CurrentUserDep,
    recipient_id: Annotated[UUID, Query()],
) -> ApiResponse[EventRead]:
    return ApiResponse(
        data=event_service.create_event(
            str(tenant_id), payload, actor,
            recipient_id=str(recipient_id),
        ),
        message="Event created successfully.",
    )


@router.get(
    "/tenants/{tenant_id}/events/{event_id}",
    response_model=ApiResponse[EventRead],
)
def get_event(
    tenant_id: UUID,
    event_id: UUID,
    actor: CurrentUserDep,
) -> ApiResponse[EventRead]:
    return ApiResponse(
        data=event_service.get_event(str(tenant_id), str(event_id), actor),
        message="Event retrieved successfully.",
    )


@router.patch(
    "/tenants/{tenant_id}/events/{event_id}",
    response_model=ApiResponse[EventRead],
)
def update_event(
    tenant_id: UUID,
    event_id: UUID,
    payload: Annotated[EventUpdate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[EventRead]:
    return ApiResponse(
        data=event_service.update_event(str(tenant_id), str(event_id), payload, actor),
        message="Event updated successfully.",
    )


@router.delete(
    "/tenants/{tenant_id}/events/{event_id}",
    response_model=ApiResponse[dict],
    status_code=status.HTTP_200_OK,
)
def delete_event(tenant_id: UUID, event_id: UUID, actor: CurrentUserDep) -> ApiResponse[dict]:
    event_service.delete_event(str(tenant_id), str(event_id), actor)
    return ApiResponse(data={}, message="Event deleted successfully.")


@router.get(
    "/tenants/{tenant_id}/recipients/{recipient_id}/events",
    response_model=EventList,
)
def list_recipient_events(
    tenant_id: UUID,
    recipient_id: UUID,
    actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
) -> EventList:
    return event_service.list_recipient_events(
        str(tenant_id),
        str(recipient_id),
        actor,
        page=page,
        limit=limit,
    )


@router.post(
    "/tenants/{tenant_id}/recipients/{recipient_id}/events",
    response_model=ApiResponse[EventRead],
    status_code=status.HTTP_201_CREATED,
)
def create_recipient_event(
    tenant_id: UUID,
    recipient_id: UUID,
    payload: Annotated[EventCreate, Body()],
    actor: CurrentUserDep,
) -> ApiResponse[EventRead]:
    return ApiResponse(
        data=event_service.create_event(
            str(tenant_id),
            payload,
            actor,
            recipient_id=str(recipient_id),
        ),
        message="Recipient event created successfully.",
    )
