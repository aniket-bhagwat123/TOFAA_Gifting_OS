from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from src.modules.auth.schemas import ProfileUpdateRequest, UserProfileResponse
from src.modules.auth.service import AuthService


def test_accepts_camel_case_and_clears_mobile():
    model = ProfileUpdateRequest.model_validate({"fullName": "  Asha Rao ", "mobileNumber": ""})
    assert model.full_name == "Asha Rao"
    assert model.mobile_number == ""


@pytest.mark.parametrize("body", [{}, {"fullName": ""}, {"email": "nope"}, {"mobileNumber": "12ab"}, {"role": "SUPER_ADMIN"}])
def test_rejects_bad_input(body):
    with pytest.raises(ValidationError):
        ProfileUpdateRequest.model_validate(body)


def _service(taken: list[dict]) -> tuple[AuthService, MagicMock]:
    db = MagicMock()
    db.table.return_value.select.return_value.eq.return_value.neq.return_value.limit.return_value.execute.return_value.data = taken
    db.table.return_value.update.return_value.eq.return_value.select.return_value.execute.return_value.data = [{"id": "u1"}]
    service = AuthService.__new__(AuthService)
    service.admin_client = db
    service.get_profile_by_id = lambda *a, **k: UserProfileResponse(id="u1", email="n@x.com")
    return service, db


def test_email_already_used_is_conflict():
    service, db = _service([{"id": "other"}])
    with pytest.raises(HTTPException) as exc:
        service.update_profile(UserProfileResponse(id="u1", email="old@x.com"), ProfileUpdateRequest(email="N@x.com"))
    assert exc.value.status_code == 409
    db.auth.admin.update_user_by_id.assert_not_called()


def test_email_change_updates_auth_and_profile():
    service, db = _service([])
    service.update_profile(UserProfileResponse(id="u1", email="old@x.com"), ProfileUpdateRequest(email="N@x.com", full_name="Asha"))
    db.auth.admin.update_user_by_id.assert_called_once_with("u1", {"email": "n@x.com", "email_confirm": True})
    db.table.return_value.update.assert_called_once_with({"full_name": "Asha", "email": "n@x.com"})
