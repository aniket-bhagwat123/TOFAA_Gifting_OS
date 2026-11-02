import pytest
from pydantic import ValidationError

from src.modules.users.schemas import UserInviteCreate, UserUpdate


def test_invite_defaults_to_client_role():
    invite = UserInviteCreate(email="alex@example.com", fullName="Alex User")
    assert invite.role.value == "CLIENT"
    assert invite.full_name == "Alex User"


@pytest.mark.parametrize("email", ["bad", "missing-at.example.com", "a@b"])
def test_invite_rejects_invalid_email(email):
    with pytest.raises(ValidationError):
        UserInviteCreate(email=email)


def test_user_patch_requires_a_field():
    with pytest.raises(ValidationError):
        UserUpdate()
