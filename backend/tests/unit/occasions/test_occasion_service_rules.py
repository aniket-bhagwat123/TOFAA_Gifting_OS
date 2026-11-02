import pytest
from fastapi import HTTPException

from src.modules.auth.schemas import UserProfileResponse
from src.modules.occasions.schemas import OccasionCreate
from src.modules.occasions.service import OccasionService


def test_only_super_admin_can_create_global_occasion():
    client = UserProfileResponse(id="client-1", email="client@example.com", role="CLIENT")
    service = OccasionService(database=object())
    with pytest.raises(HTTPException) as exc:
        service.create_global_occasion(OccasionCreate(occasionName="Diwali", occasionDate="2026-11-08"), client)
    assert exc.value.status_code == 403
