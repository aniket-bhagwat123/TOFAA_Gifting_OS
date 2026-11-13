"""The rest of a recipient's profile: preferences, delivery addresses, relationships, shared occasions, follow-up status.

Everything hangs off one shared recipient record, so the client's EA and TOFAA's KAM edit the same data.
Each change goes into the recipient's history.
"""

from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Body, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from src.core.errors import ApiError
from src.core.schema import ApiResponse, to_camel
from src.modules.auth.dependencies import CurrentUserDep
from src.modules.auth.rbac import Permission, require_permission
from src.modules.recipients import trail
from src.modules.recipients.service import recipient_service
from src.modules.tenants.service import tenant_service

router = APIRouter(tags=["Recipient profile"])

RelationshipType = Literal["SPOUSE", "SON", "DAUGHTER", "PARENT", "SIBLING", "BUSINESS_ASSOCIATE", "COLLEAGUE", "OTHER"]
AddressLabel = Literal["OFFICE", "RESIDENTIAL", "OTHER"]
InfoStatus = Literal["PENDING", "REQUESTED_FROM_CLIENT", "KAM_FOLLOW_UP", "SUBMITTED_FOR_CONFIRMATION", "VERIFIED", "NOT_APPLICABLE"]
# Information fields that can be tracked (the keys the completeness score also uses).
INFO_FIELDS = frozenset({"contact", "city", "company", "designation", "relationship", "birthday", "preferences", "address"})
MAX_LIST = 30


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, str_strip_whitespace=True, extra="forbid")


# ------------------------------------------------------------------------------------------------ schemas
class PreferencesBody(_Camel):
    interests: list[Annotated[str, Field(min_length=1, max_length=60)]] = Field(default_factory=list, max_length=MAX_LIST)
    preferred_brands: list[Annotated[str, Field(min_length=1, max_length=60)]] = Field(default_factory=list, max_length=MAX_LIST)
    gift_preferences: str | None = Field(default=None, max_length=2000)
    dietary_preferences: str | None = Field(default=None, max_length=1000)
    gifts_to_avoid: str | None = Field(default=None, max_length=1000)
    special_instructions: str | None = Field(default=None, max_length=2000)


class PreferencesRead(PreferencesBody):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")
    updated_at: str | None = None


class AddressBody(_Camel):
    label: AddressLabel = "OFFICE"
    address_line1: str = Field(min_length=3, max_length=300)
    address_line2: str | None = Field(default=None, max_length=300)
    city: str = Field(min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str = Field(pattern=r"^[0-9]{6}$")
    country: str = Field(default="IN", pattern=r"^[A-Z]{2}$")
    is_default: bool = False


class AddressPatch(_Camel):
    label: AddressLabel | None = None
    address_line1: str | None = Field(default=None, min_length=3, max_length=300)
    address_line2: str | None = Field(default=None, max_length=300)
    city: str | None = Field(default=None, min_length=1, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, pattern=r"^[0-9]{6}$")
    is_default: bool | None = None

    @field_validator("*", mode="after")
    @classmethod
    def _not_null_when_given(cls, value: Any) -> Any:
        return value


class AddressRead(AddressBody):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")
    id: str


class RelationshipItem(_Camel):
    related_recipient_id: UUID
    relationship_type: RelationshipType


class RelationshipsBody(_Camel):
    items: list[RelationshipItem] = Field(default_factory=list, max_length=MAX_LIST)


class ParticipantsBody(_Camel):
    recipient_ids: list[UUID] = Field(default_factory=list, max_length=MAX_LIST)


class InfoStatusBody(_Camel):
    field_key: str = Field(min_length=1, max_length=60)
    status: InfoStatus
    note: str | None = Field(default=None, max_length=1000)

    @field_validator("field_key")
    @classmethod
    def known_field(cls, value: str) -> str:
        if value not in INFO_FIELDS:
            raise ValueError(f"field_key must be one of: {', '.join(sorted(INFO_FIELDS))}")
        return value


# ------------------------------------------------------------------------------------------------ service
class ProfileService:
    """Reads and writes the tables beside a recipient. Every call first proves the recipient belongs to the tenant."""

    @property
    def db(self):  # the same database client the recipient service uses
        return recipient_service.database

    def _recipient(self, tenant_id: str, recipient_id: str, actor: Any, *, write: bool) -> dict[str, Any]:
        if write:
            require_permission(actor, Permission.RECIPIENT_UPDATE)
        return recipient_service._get_scoped_recipient(tenant_id, recipient_id, actor)

    def _log(self, tenant_id: str, recipient_id: str, actor: Any, field: str, old: Any, new: Any, source: str) -> None:
        trail.record(self.db, tenant_id, recipient_id, actor, "UPDATE", [(field, old, new)], source)

    # -- preferences
    def get_preferences(self, tenant_id: str, recipient_id: str, actor: Any) -> PreferencesRead:
        self._recipient(tenant_id, recipient_id, actor, write=False)
        rows = self.db.table("recipient_preferences").select("*").eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).limit(1).execute().data or []
        return PreferencesRead.model_validate(_camel_keys(rows[0])) if rows else PreferencesRead()

    def save_preferences(self, tenant_id: str, recipient_id: str, body: PreferencesBody, actor: Any, source: str) -> PreferencesRead:
        self._recipient(tenant_id, recipient_id, actor, write=True)
        before = self.get_preferences(tenant_id, recipient_id, actor).model_dump(by_alias=False, exclude={"updated_at"})
        values = body.model_dump()
        self.db.table("recipient_preferences").upsert(
            {**values, "recipient_id": recipient_id, "tenant_id": tenant_id, "updated_by_user_id": actor.id}, on_conflict="recipient_id"
        ).execute()
        if before != values:
            self._log(tenant_id, recipient_id, actor, "preferences", before, values, source)
        return self.get_preferences(tenant_id, recipient_id, actor)

    # -- addresses
    def list_addresses(self, tenant_id: str, recipient_id: str, actor: Any) -> list[AddressRead]:
        self._recipient(tenant_id, recipient_id, actor, write=False)
        rows = (self.db.table("recipient_addresses").select("*").eq("tenant_id", tenant_id).eq("recipient_id", recipient_id)
                .order("is_default", desc=True).order("created_at").execute().data or [])
        return [AddressRead.model_validate(_camel_keys(row)) for row in rows]

    def add_address(self, tenant_id: str, recipient_id: str, body: AddressBody, actor: Any, source: str) -> AddressRead:
        self._recipient(tenant_id, recipient_id, actor, write=True)
        existing = self.list_addresses(tenant_id, recipient_id, actor)
        make_default = body.is_default or not existing  # the first address is the default
        if make_default:
            self._clear_default(tenant_id, recipient_id)
        result = self.db.table("recipient_addresses").insert({**body.model_dump(), "is_default": make_default, "tenant_id": tenant_id, "recipient_id": recipient_id}).select("*").execute()
        if not result.data:
            raise HTTPException(status_code=409, detail="Address could not be saved.")
        self._log(tenant_id, recipient_id, actor, "address", None, {"label": body.label, "city": body.city}, source)
        return AddressRead.model_validate(_camel_keys(result.data[0]))

    def update_address(self, tenant_id: str, recipient_id: str, address_id: str, body: AddressPatch, actor: Any, source: str) -> AddressRead:
        self._recipient(tenant_id, recipient_id, actor, write=True)
        values = body.model_dump(exclude_unset=True)
        if not values:
            raise HTTPException(status_code=422, detail="Nothing to change.")
        if values.get("is_default"):
            self._clear_default(tenant_id, recipient_id)
        result = (self.db.table("recipient_addresses").update(values).eq("id", address_id).eq("tenant_id", tenant_id)
                  .eq("recipient_id", recipient_id).select("*").execute())
        if not result.data:
            raise HTTPException(status_code=404, detail="Address not found.")
        self._log(tenant_id, recipient_id, actor, "address", None, values, source)
        return AddressRead.model_validate(_camel_keys(result.data[0]))

    def delete_address(self, tenant_id: str, recipient_id: str, address_id: str, actor: Any, source: str) -> None:
        self._recipient(tenant_id, recipient_id, actor, write=True)
        found = (self.db.table("recipient_addresses").delete().eq("id", address_id).eq("tenant_id", tenant_id)
                 .eq("recipient_id", recipient_id).select("id,is_default").execute().data or [])
        if not found:
            raise HTTPException(status_code=404, detail="Address not found.")
        if found[0].get("is_default"):  # keep one default: promote the oldest remaining address
            left = self.db.table("recipient_addresses").select("id").eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).order("created_at").limit(1).execute().data or []
            if left:
                self.db.table("recipient_addresses").update({"is_default": True}).eq("id", left[0]["id"]).execute()
        self._log(tenant_id, recipient_id, actor, "address", {"removed": address_id}, None, source)

    def _clear_default(self, tenant_id: str, recipient_id: str) -> None:
        self.db.table("recipient_addresses").update({"is_default": False}).eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).eq("is_default", True).execute()

    # -- relationships
    def list_relationships(self, tenant_id: str, recipient_id: str, actor: Any) -> list[dict[str, Any]]:
        self._recipient(tenant_id, recipient_id, actor, write=False)
        rows = self.db.table("recipient_relationships").select("related_recipient_id,relationship_type").eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).execute().data or []
        names = {}
        if rows:
            people = self.db.table("recipients").select("id,name").eq("tenant_id", tenant_id).in_("id", [r["related_recipient_id"] for r in rows]).execute().data or []
            names = {str(p["id"]): p.get("name") for p in people}
        return [{"relatedRecipientId": str(r["related_recipient_id"]), "relatedName": names.get(str(r["related_recipient_id"])), "relationshipType": r["relationship_type"]} for r in rows]

    def save_relationships(self, tenant_id: str, recipient_id: str, body: RelationshipsBody, actor: Any, source: str) -> list[dict[str, Any]]:
        self._recipient(tenant_id, recipient_id, actor, write=True)
        ids = {str(item.related_recipient_id) for item in body.items}
        if recipient_id in ids:
            raise ApiError(422, "A recipient cannot be linked to themselves.")
        if len(ids) != len(body.items):
            raise ApiError(422, "Each related recipient can be listed only once.")
        if ids:
            found = self.db.table("recipients").select("id").eq("tenant_id", tenant_id).is_("deleted_at", "null").in_("id", sorted(ids)).execute().data or []
            if len(found) != len(ids):
                raise ApiError(422, "One of the linked recipients was not found.")
        before = self.list_relationships(tenant_id, recipient_id, actor)
        self.db.table("recipient_relationships").delete().eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).execute()
        if body.items:
            self.db.table("recipient_relationships").insert([
                {"tenant_id": tenant_id, "recipient_id": recipient_id, "related_recipient_id": str(item.related_recipient_id),
                 "relationship_type": item.relationship_type, "created_by_user_id": actor.id} for item in body.items
            ]).execute()
        after = self.list_relationships(tenant_id, recipient_id, actor)
        if [(b["relatedRecipientId"], b["relationshipType"]) for b in before] != [(a["relatedRecipientId"], a["relationshipType"]) for a in after]:
            self._log(tenant_id, recipient_id, actor, "relationships", before, after, source)
        return after

    # -- shared occasions
    def save_participants(self, tenant_id: str, event_id: str, body: ParticipantsBody, actor: Any, source: str) -> list[str]:
        require_permission(actor, Permission.RECIPIENT_UPDATE)
        tenant_service.require_access(tenant_id, actor)
        event = self.db.table("events").select("id,recipient_id").eq("tenant_id", tenant_id).eq("id", event_id).limit(1).execute().data or []
        if not event:
            raise HTTPException(status_code=404, detail="Occasion not found.")
        ids = sorted({str(i) for i in body.recipient_ids})
        if ids:
            found = self.db.table("recipients").select("id").eq("tenant_id", tenant_id).is_("deleted_at", "null").in_("id", ids).execute().data or []
            if len(found) != len(ids):
                raise ApiError(422, "One of the people sharing this occasion was not found.")
        self.db.table("event_participants").delete().eq("tenant_id", tenant_id).eq("event_id", event_id).execute()
        if ids:
            self.db.table("event_participants").insert([{"event_id": event_id, "tenant_id": tenant_id, "recipient_id": r} for r in ids]).execute()
        if event[0].get("recipient_id"):
            self._log(tenant_id, str(event[0]["recipient_id"]), actor, "shared_occasion", None, {"eventId": event_id, "people": len(ids)}, source)
        return ids

    # -- follow-up status of missing information
    def list_info_status(self, tenant_id: str, recipient_id: str, actor: Any) -> list[dict[str, Any]]:
        self._recipient(tenant_id, recipient_id, actor, write=False)
        rows = self.db.table("recipient_info_status").select("field_key,status,note,updated_at").eq("tenant_id", tenant_id).eq("recipient_id", recipient_id).execute().data or []
        return [{"fieldKey": r["field_key"], "status": r["status"], "note": r.get("note"), "updatedAt": r.get("updated_at")} for r in rows]

    def set_info_status(self, tenant_id: str, recipient_id: str, body: InfoStatusBody, actor: Any, source: str) -> list[dict[str, Any]]:
        self._recipient(tenant_id, recipient_id, actor, write=True)
        # Only the client's own people can confirm information; TOFAA staff can ask and follow up but not verify.
        if body.status == "VERIFIED" and str(getattr(actor.role, "value", actor.role)) != "CLIENT":
            raise ApiError(403, "Only the client's authorised contact can mark information as verified.")
        previous = next((s for s in self.list_info_status(tenant_id, recipient_id, actor) if s["fieldKey"] == body.field_key), None)
        self.db.table("recipient_info_status").upsert(
            {"recipient_id": recipient_id, "tenant_id": tenant_id, "field_key": body.field_key, "status": body.status, "note": body.note, "updated_by_user_id": actor.id},
            on_conflict="recipient_id,field_key",
        ).execute()
        self._log(tenant_id, recipient_id, actor, f"status:{body.field_key}", previous["status"] if previous else None, body.status, source)
        return self.list_info_status(tenant_id, recipient_id, actor)

    # -- history
    def activity(self, tenant_id: str, recipient_id: str, actor: Any, page: int, limit: int) -> trail.TrailList:
        self._recipient(tenant_id, recipient_id, actor, write=False)
        return trail.list_trail(self.db, tenant_id, recipient_id, page=page, limit=limit)


def _camel_keys(row: dict[str, Any]) -> dict[str, Any]:
    """Database column names (snake_case) -> the camelCase names the schemas read."""
    return {to_camel(key): value for key, value in row.items()}


profile_service = ProfileService()


def _source(request: Request) -> str:
    return trail.source_of(request.headers.get(trail.SOURCE_HEADER))


# ------------------------------------------------------------------------------------------------ routes
BASE = "/tenants/{tenant_id}/recipients/{recipient_id}"


@router.get(f"{BASE}/preferences", response_model=PreferencesRead)
def get_preferences(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> PreferencesRead:
    return profile_service.get_preferences(str(tenant_id), str(recipient_id), actor)


@router.put(f"{BASE}/preferences", response_model=ApiResponse[PreferencesRead])
def put_preferences(tenant_id: UUID, recipient_id: UUID, body: Annotated[PreferencesBody, Body()], actor: CurrentUserDep, request: Request) -> ApiResponse[PreferencesRead]:
    return ApiResponse(data=profile_service.save_preferences(str(tenant_id), str(recipient_id), body, actor, _source(request)), message="Preferences saved.")


@router.get(f"{BASE}/addresses", response_model=list[AddressRead])
def get_addresses(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> list[AddressRead]:
    return profile_service.list_addresses(str(tenant_id), str(recipient_id), actor)


@router.post(f"{BASE}/addresses", response_model=ApiResponse[AddressRead], status_code=status.HTTP_201_CREATED)
def post_address(tenant_id: UUID, recipient_id: UUID, body: Annotated[AddressBody, Body()], actor: CurrentUserDep, request: Request) -> ApiResponse[AddressRead]:
    return ApiResponse(data=profile_service.add_address(str(tenant_id), str(recipient_id), body, actor, _source(request)), message="Address added.")


@router.patch(f"{BASE}/addresses/{{address_id}}", response_model=ApiResponse[AddressRead])
def patch_address(tenant_id: UUID, recipient_id: UUID, address_id: UUID, body: Annotated[AddressPatch, Body()], actor: CurrentUserDep, request: Request) -> ApiResponse[AddressRead]:
    return ApiResponse(data=profile_service.update_address(str(tenant_id), str(recipient_id), str(address_id), body, actor, _source(request)), message="Address updated.")


@router.delete(f"{BASE}/addresses/{{address_id}}", response_model=ApiResponse[dict])
def remove_address(tenant_id: UUID, recipient_id: UUID, address_id: UUID, actor: CurrentUserDep, request: Request) -> ApiResponse[dict]:
    profile_service.delete_address(str(tenant_id), str(recipient_id), str(address_id), actor, _source(request))
    return ApiResponse(data={}, message="Address removed.")


@router.get(f"{BASE}/relationships", response_model=list[dict])
def get_relationships(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> list[dict]:
    return profile_service.list_relationships(str(tenant_id), str(recipient_id), actor)


@router.put(f"{BASE}/relationships", response_model=ApiResponse[list[dict]])
def put_relationships(tenant_id: UUID, recipient_id: UUID, body: Annotated[RelationshipsBody, Body()], actor: CurrentUserDep, request: Request) -> ApiResponse[list[dict]]:
    return ApiResponse(data=profile_service.save_relationships(str(tenant_id), str(recipient_id), body, actor, _source(request)), message="Relationships saved.")


@router.put("/tenants/{tenant_id}/events/{event_id}/participants", response_model=ApiResponse[list[str]])
def put_participants(tenant_id: UUID, event_id: UUID, body: Annotated[ParticipantsBody, Body()], actor: CurrentUserDep, request: Request) -> ApiResponse[list[str]]:
    """The people who share this occasion (for example both partners on a wedding anniversary)."""
    return ApiResponse(data=profile_service.save_participants(str(tenant_id), str(event_id), body, actor, _source(request)), message="Occasion participants saved.")


@router.get(f"{BASE}/info-status", response_model=list[dict])
def get_info_status(tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep) -> list[dict]:
    return profile_service.list_info_status(str(tenant_id), str(recipient_id), actor)


@router.put(f"{BASE}/info-status", response_model=ApiResponse[list[dict]])
def put_info_status(tenant_id: UUID, recipient_id: UUID, body: Annotated[InfoStatusBody, Body()], actor: CurrentUserDep, request: Request) -> ApiResponse[list[dict]]:
    return ApiResponse(data=profile_service.set_info_status(str(tenant_id), str(recipient_id), body, actor, _source(request)), message="Status updated.")


@router.get(f"{BASE}/activity", response_model=trail.TrailList)
def get_activity(
    tenant_id: UUID, recipient_id: UUID, actor: CurrentUserDep,
    page: Annotated[int, Query(ge=1)] = 1, limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> trail.TrailList:
    """Who changed what on this recipient, and when."""
    return profile_service.activity(str(tenant_id), str(recipient_id), actor, page, limit)
