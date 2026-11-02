import pytest
from fastapi import HTTPException

from src.modules.auth.authorization import require_roles
from src.modules.auth.schemas import UserProfileResponse


def make_profile(role: str) -> UserProfileResponse:
    return UserProfileResponse(
        id="11111111-1111-1111-1111-111111111111",
        email="user@example.com",
        role=role,
        is_active=True,
        tenant_id="22222222-2222-2222-2222-222222222222" if role == "CLIENT" else None,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["CLIENT", "KAM", "SUPER_ADMIN"])
async def test_super_admin_bypasses_role_restrictions(role: str):
    dependency = require_roles(role)
    super_admin = make_profile("SUPER_ADMIN")

    assert await dependency(super_admin) == super_admin


@pytest.mark.asyncio
async def test_non_admin_must_have_allowed_role():
    dependency = require_roles("KAM")

    with pytest.raises(HTTPException) as exc_info:
        await dependency(make_profile("CLIENT"))

    assert exc_info.value.status_code == 403
