"""TOFAA CRM reads and handles gift requests here (server to server, shared key, no signed-in user).

POST is used for these reads because the list of allowed clients is too long for a web address.
"""

import base64
import binascii
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field

from src.core.errors import ApiError
from src.core.schema import to_camel
from src.modules.crm_gifting.clients import crm_clients_service
from src.modules.crm_gifting.planning import crm_planning_service
from src.modules.crm_gifting.service import crm_gifting_service
from src.modules.crm_people.router import key_matches
from src.modules.events.schemas import EventCreate
from src.modules.gift_requests.schemas import GiftProposal, GiftRequestCreate, GiftRequestStatus
from src.modules.occasions.schemas import OccasionCreate


def require_crm_key(x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None) -> None:
    if not key_matches(x_api_key):
        raise ApiError(401, "A valid API key is required.")


router = APIRouter(
    prefix="/integrations/crm/gift-requests", tags=["CRM integration"], include_in_schema=False,
    dependencies=[Depends(require_crm_key)],
)


class Scope(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    tenant_ids: list[UUID] = Field(max_length=300)  # the clients the CRM user may see


class Search(Scope):
    status: GiftRequestStatus | None = None
    search: str | None = Field(default=None, max_length=100)
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=25, ge=1, le=100)


class Action(Scope):
    action: Literal["start_review", "request_info", "publish_proposal", "reject", "start_fulfilment", "dispatch", "deliver"]
    actor_id: UUID  # the signed-in CRM user
    actor_name: str = Field(min_length=1, max_length=100)
    note: str | None = Field(default=None, max_length=2000)
    proposal: GiftProposal | None = None


@router.post("/search")
def search(body: Search) -> dict:
    data = crm_gifting_service.search(
        [str(t) for t in body.tenant_ids], status=body.status, search=body.search, page=body.page, limit=body.limit,
    )
    return {"data": data, "message": "OK"}


@router.post("/{request_id}")
def detail(request_id: UUID, body: Scope) -> dict:
    return {"data": crm_gifting_service.detail([str(t) for t in body.tenant_ids], str(request_id)), "message": "OK"}


@router.post("/{request_id}/actions")
def act(request_id: UUID, body: Action) -> dict:
    data = crm_gifting_service.act(
        [str(t) for t in body.tenant_ids], str(request_id), body.action, crm_user_id=str(body.actor_id),
        crm_user_name=body.actor_name, note=body.note,
        proposal=body.proposal.model_dump(mode="json", by_alias=True) if body.proposal else None,
    )
    return {"data": data, "message": "Gift request updated."}


# --- occasions, events and new requests -------------------------------------------------------------------------------

planning_router = APIRouter(
    prefix="/integrations/crm/planning", tags=["CRM integration"], include_in_schema=False,
    dependencies=[Depends(require_crm_key)],
)


class Client(Scope):
    tenant_id: UUID  # the client being worked on; must be one of tenant_ids

    def chosen(self) -> str:
        if self.tenant_id not in self.tenant_ids:
            raise ApiError(404, "Client not found.")
        return str(self.tenant_id)


class Options(Client):
    recipient_id: UUID | None = None


class Writer(Client):
    actor_id: UUID  # the signed-in CRM user
    actor_name: str = Field(min_length=1, max_length=100)

    def who(self) -> dict:
        return {"crm_user_id": str(self.actor_id), "crm_user_name": self.actor_name}


class NewOccasion(Writer):
    occasion: OccasionCreate


class NewEvent(Writer):
    recipient_id: UUID
    event: EventCreate


class NewRequest(Writer):
    request: GiftRequestCreate


@planning_router.post("/options")
def options(body: Options) -> dict:
    recipient = str(body.recipient_id) if body.recipient_id else None
    return {"data": crm_planning_service.options(body.chosen(), recipient), "message": "OK"}


@planning_router.post("/occasions", status_code=201)
def new_occasion(body: NewOccasion) -> dict:
    return {"data": crm_planning_service.create_occasion(body.chosen(), body.occasion, **body.who()), "message": "Occasion created."}


@planning_router.post("/events", status_code=201)
def new_event(body: NewEvent) -> dict:
    data = crm_planning_service.create_event(body.chosen(), str(body.recipient_id), body.event, **body.who())
    return {"data": data, "message": "Event created."}


@planning_router.post("/gift-requests", status_code=201)
def new_request(body: NewRequest) -> dict:
    return {"data": crm_planning_service.create_request(body.chosen(), body.request, **body.who()), "message": "Gift request sent."}


# --- client organisations and their users ---------------------------------------------------------------------------

clients_router = APIRouter(
    prefix="/integrations/crm/clients", tags=["CRM integration"], include_in_schema=False,
    dependencies=[Depends(require_crm_key)],
)


class NewClient(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    name: str = Field(min_length=2, max_length=200)
    actor_id: UUID
    actor_name: str = Field(min_length=1, max_length=100)


class Invite(Writer):
    email: str = Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    full_name: str | None = Field(default=None, max_length=150)
    client_role: Literal["OWNER", "EA", "HR"] = "OWNER"


class ClientChange(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    tenant_id: UUID
    name: str | None = Field(default=None, min_length=2, max_length=200)
    active: bool | None = None
    actor_id: UUID
    actor_name: str = Field(min_length=1, max_length=100)


@clients_router.post("/list")
def all_clients() -> dict:
    return {"data": crm_clients_service.list_all(), "message": "OK"}


@clients_router.post("/update")
def change_client(body: ClientChange) -> dict:
    data = crm_clients_service.change(
        str(body.tenant_id), name=body.name, active=body.active, crm_user_id=str(body.actor_id), crm_user_name=body.actor_name,
    )
    return {"data": data, "message": "Client updated."}


class ClientWriter(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    tenant_id: UUID
    actor_id: UUID  # the signed-in CRM user
    actor_name: str = Field(min_length=1, max_length=100)

    def who(self) -> dict:
        return {"crm_user_id": str(self.actor_id), "crm_user_name": self.actor_name}


class ClientDetails(ClientWriter):
    legal_name: str | None = Field(default=None, max_length=200)
    gstin: str | None = Field(default=None, min_length=15, max_length=15, pattern=r"^[A-Za-z0-9]{15}$")
    email_domain: str | None = Field(default=None, max_length=253)


class ClientLogo(ClientWriter):
    content: str | None = Field(default=None, max_length=3_000_000)  # base64; none removes the logo
    content_type: str = Field(default="", max_length=40)


class ClientLogin(ClientWriter):
    user_id: UUID
    full_name: str | None = Field(default=None, max_length=150)
    client_role: Literal["OWNER", "EA", "HR"] | None = None
    is_active: bool | None = None


@clients_router.post("/details")
def change_details(body: ClientDetails) -> dict:
    changes = {k: getattr(body, k) for k in ("legal_name", "gstin", "email_domain") if k in body.model_fields_set}
    if not changes:
        raise ApiError(422, "Nothing to change.")
    return {"data": crm_clients_service.change_details(str(body.tenant_id), changes, **body.who()), "message": "Client updated."}


@clients_router.post("/logo")
def change_logo(body: ClientLogo) -> dict:
    try:
        content = base64.b64decode(body.content, validate=True) if body.content else None
    except binascii.Error as exc:
        raise ApiError(422, "That picture could not be read.") from exc
    data = crm_clients_service.change_logo(str(body.tenant_id), content, body.content_type, **body.who())
    return {"data": data, "message": "Logo saved."}


@clients_router.post("/users/update")
def change_login(body: ClientLogin) -> dict:
    changes = body.model_dump(include={"full_name", "client_role", "is_active"}, exclude_none=True)
    if not changes:
        raise ApiError(422, "Nothing to change.")
    return {"data": crm_clients_service.change_user(str(body.tenant_id), str(body.user_id), changes, **body.who()), "message": "Login updated."}


@clients_router.post("/status")
def client_status(body: Client) -> dict:
    return {"data": crm_clients_service.status(body.chosen()), "message": "OK"}


@clients_router.post("/create", status_code=201)
def new_client(body: NewClient) -> dict:
    data = crm_clients_service.create(body.name, crm_user_id=str(body.actor_id), crm_user_name=body.actor_name)
    return {"data": data, "message": "Client ready."}


@clients_router.post("/invite", status_code=201)
def invite_client_user(body: Invite) -> dict:
    data = crm_clients_service.invite(body.chosen(), body.email, body.full_name, body.client_role, **body.who())
    return {"data": data, "message": "Invitation sent."}
