import pytest
from fastapi import HTTPException

from src.modules.auth.schemas import UserProfileResponse
from src.modules.recipients.service import RecipientService


def test_client_cannot_access_recipient_from_another_tenant():
    client = UserProfileResponse(
        id="client-1", email="client@example.com", role="CLIENT", tenant_id="tenant-a"
    )
    service = RecipientService(database=object())
    with pytest.raises(HTTPException) as exc:
        service._require_tenant_access("tenant-b", client)
    assert exc.value.status_code == 404
