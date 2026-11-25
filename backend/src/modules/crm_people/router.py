"""The CRM tells Gifting OS that People changed (server to server, shared key). Gifting OS then fetches the changes."""

import hmac
from typing import Annotated

from fastapi import APIRouter, Header, status

from src.core.config import settings
from src.core.errors import ApiError
from src.modules.crm_people.sync import people_mirror

router = APIRouter(tags=["CRM integration"], include_in_schema=False)


def key_matches(sent: str | None) -> bool:
    expected = settings.CRM_API_KEY or ""
    return len(expected) >= 32 and bool(sent) and hmac.compare_digest(sent.encode(), expected.encode())


@router.post("/integrations/crm/people-changed", status_code=status.HTTP_202_ACCEPTED)
def people_changed(x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None) -> dict[str, str]:
    if not key_matches(x_api_key):
        raise ApiError(401, "A valid API key is required.")
    people_mirror.catch_up_in_background()
    return {"status": "accepted"}
