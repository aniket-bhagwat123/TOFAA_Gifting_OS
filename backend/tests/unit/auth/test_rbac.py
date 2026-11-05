import pytest
from fastapi import HTTPException

from src.modules.auth.rbac import ROLE_PERMISSIONS, Permission, Role, has_permission, require_permission
from src.modules.auth.schemas import UserProfileResponse


@pytest.mark.parametrize("role", list(Role))
def test_super_admin_has_every_permission(role):
    assert has_permission(Role.SUPER_ADMIN, Permission.TENANT_CREATE)
    assert has_permission(Role.SUPER_ADMIN, Permission.CREDIT_REVIEW)


def test_client_can_request_credits_but_cannot_review():
    assert has_permission(Role.CLIENT, Permission.CREDIT_CREATE)
    assert not has_permission(Role.CLIENT, Permission.CREDIT_REVIEW)


def test_unknown_role_has_no_permissions():
    assert not has_permission("UNKNOWN", Permission.USER_READ)


def test_gift_spend_is_available_to_tenants_and_assigned_kam_roles():
    assert has_permission(Role.CLIENT, Permission.GIFT_SPEND_READ)
    assert has_permission(Role.CLIENT, Permission.GIFT_SPEND_MANAGE)
    assert has_permission(Role.KAM, Permission.GIFT_SPEND_READ)
    assert has_permission(Role.KAM, Permission.GIFT_SPEND_MANAGE)


def test_require_permission_rejects_missing_permission():
    actor = UserProfileResponse(id="u1", email="u@example.com", role=Role.CLIENT)
    with pytest.raises(HTTPException) as exc:
        require_permission(actor, Permission.TENANT_CREATE)
    assert exc.value.status_code == 403


def test_kam_can_do_everything_a_client_can():
    assert ROLE_PERMISSIONS[Role.CLIENT] <= ROLE_PERMISSIONS[Role.KAM]


def test_clients_cannot_manage_users():
    for permission in (Permission.USER_INVITE, Permission.USER_UPDATE, Permission.USER_DEACTIVATE, Permission.USER_RESEND_INVITE):
        assert not has_permission(Role.CLIENT, permission)


def test_kam_can_edit_client_details_but_not_switch_a_tenant_off():
    assert has_permission(Role.KAM, Permission.TENANT_UPDATE)
    assert not has_permission(Role.KAM, Permission.TENANT_MANAGE_STATUS)
