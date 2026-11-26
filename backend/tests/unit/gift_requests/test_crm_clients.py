"""Client set-up from TOFAA CRM, and the switch that ends KAM use of Gifting OS. Nothing real is written."""
import pytest
from fastapi import HTTPException

from src.core.config import settings
from src.modules.auth.dependencies import get_current_active_user
from src.modules.auth.rbac import Role
from src.modules.auth.schemas import UserProfileResponse
from src.modules.crm_gifting.clients import CrmClientsService, literal_pattern

WHO = {"crm_user_id": "u-1", "crm_user_name": "Asha"}


def test_nothing_is_made_or_sent_while_switched_off(monkeypatch):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", False)
    service = CrmClientsService(database=object(), actors=object(), tenants=object(), users=object())
    for call in (lambda: service.create("Wendy", **WHO), lambda: service.invite("t-1", "a@b.co", None, "OWNER", **WHO)):
        with pytest.raises(HTTPException) as err:
            call()
        assert err.value.status_code == 403


def test_a_name_with_wildcards_is_matched_literally():
    assert literal_pattern("100%_Gifts") == "100\\%\\_Gifts"


def _user(role: Role) -> UserProfileResponse:
    return UserProfileResponse(id="u", email="a@b.co", role=role, is_active=True, tenant_id="t")


def test_the_kam_switch_is_off_by_default_and_stops_only_kams(monkeypatch):
    assert type(settings).model_fields["OS_KAM_LOGIN_DISABLED"].default is False
    monkeypatch.setattr(settings, "OS_KAM_LOGIN_DISABLED", False)
    assert get_current_active_user(_user(Role.KAM)).role == Role.KAM
    monkeypatch.setattr(settings, "OS_KAM_LOGIN_DISABLED", True)
    with pytest.raises(HTTPException) as err:
        get_current_active_user(_user(Role.KAM))
    assert err.value.status_code == 403 and "TOFAA CRM" in err.value.detail
    for role in (Role.CLIENT, Role.SUPER_ADMIN):
        assert get_current_active_user(_user(role)).role == role
