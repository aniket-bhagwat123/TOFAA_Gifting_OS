import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app
from src.modules.auth.dependencies import get_current_active_user
from src.modules.auth.schemas import UserProfileResponse


@pytest.fixture
def tenant_id() -> str:
    return "031c4871-26ff-4b7c-845d-7ce2efd9e745"


@pytest.fixture
def recipient_id() -> str:
    return "14d36f4c-ec6a-4211-9f32-79e39c5d54d1"


@pytest.fixture(autouse=True)
def tenant_context_valid(monkeypatch):
    """These contract tests stub services and have no database; the guard has its own tests."""
    from src.modules.tenants.service import tenant_service

    monkeypatch.setattr(tenant_service, "require_context", lambda *_args, **_kwargs: None)


@pytest.fixture
async def e2e_client():
    actor = UserProfileResponse(
        id="c1acaa-c6-9096-4731-b600-dffad4fed387",
        email="admin@example.com",
        role="SUPER_ADMIN",
        is_active=True,
    )
    app.dependency_overrides[get_current_active_user] = lambda: actor
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client
    app.dependency_overrides.pop(get_current_active_user, None)
