from datetime import date, datetime, timezone

import pytest
from fastapi import HTTPException

from src.modules.auth.schemas import UserProfileResponse
from src.modules.credits.service import CreditsService


def test_idempotency_key_is_trimmed():
    assert CreditsService._validate_idempotency_key("  request-123  ") == "request-123"


@pytest.mark.parametrize("key", ["short", "x" * 129])
def test_idempotency_key_enforces_length(key):
    with pytest.raises(HTTPException) as exc:
        CreditsService._validate_idempotency_key(key)
    assert exc.value.status_code == 422


def test_only_staff_can_review_credit_requests():
    client = UserProfileResponse(id="u1", email="client@example.com", role="CLIENT")
    with pytest.raises(HTTPException) as exc:
        CreditsService._require_staff(client)
    assert exc.value.status_code == 403


def test_utc_midnight_is_timezone_aware():
    value = CreditsService._utc_midnight(date(2026, 10, 30))
    assert value == datetime(2026, 10, 30, tzinfo=timezone.utc)
