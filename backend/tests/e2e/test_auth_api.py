from unittest.mock import MagicMock, patch
import pytest
from httpx import AsyncClient

from src.modules.auth.schemas import (
    AuthResponse,
    TokenResponse,
    UserProfileResponse,
)


@pytest.mark.asyncio
async def test_health_check_endpoint(async_client: AsyncClient):
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "TOFAA Gifting OS"


@pytest.mark.asyncio
async def test_get_me_unauthorized(async_client: AsyncClient):
    response = await async_client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "Authorization" in response.json()["message"]
    assert response.json()["data"] == {}


@pytest.mark.asyncio
async def test_get_me_authorized(async_client: AsyncClient, create_test_token):
    user_id = "22222222-2222-2222-2222-222222222222"
    token = create_test_token(user_id=user_id, email="alice@tofaa.com", user_metadata={"full_name": "Alice Smith"})
    profile = UserProfileResponse(
        id=user_id, email="alice@tofaa.com", full_name="Alice Smith", role="SUPER_ADMIN",
        tenant_id="44444444-4444-4444-4444-444444444444",
    )

    with patch("src.modules.auth.dependencies.auth_service.get_profile_by_id", return_value=profile):
        response = await async_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user_id
    assert data["email"] == "alice@tofaa.com"
    assert data["full_name"] == "Alice Smith"
    assert data["role"] == "SUPER_ADMIN"


@pytest.mark.asyncio
async def test_public_registration_is_closed(async_client: AsyncClient):
    """Users only exist because an administrator invited them into a tenant."""
    response = await async_client.post(
        "/api/v1/auth/register",
        json={"email": "bob@tofaa.com", "password": "Password123!"},
    )
    assert response.status_code in (404, 405)


@pytest.mark.asyncio
async def test_login_endpoint(async_client: AsyncClient):
    fake_profile = UserProfileResponse(
        id="44444444-4444-4444-4444-444444444444",
        email="clara@tofaa.com",
        full_name="Clara Oswald",
        role="CLIENT",
        is_active=True,
    )
    fake_session = TokenResponse(
        access_token="fake-access-token",
        refresh_token="fake-refresh-token",
        token_type="bearer",
        expires_in=3600,
    )
    fake_auth_response = AuthResponse(
        user=fake_profile,
        session=fake_session,
        message="Login successful.",
    )

    with patch("src.modules.auth.router.auth_service.login", return_value=fake_auth_response):
        response = await async_client.post(
            "/api/v1/auth/login",
            json={
                "email": "clara@tofaa.com",
                "password": "Password123!",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["id"] == fake_profile.id
        assert data["session"]["access_token"] == "fake-access-token"
        assert data["session"]["refresh_token"] == "fake-refresh-token"


@pytest.mark.asyncio
async def test_refresh_token_endpoint(async_client: AsyncClient):
    fake_session = TokenResponse(
        access_token="new-access-token",
        refresh_token="new-refresh-token",
        token_type="bearer",
        expires_in=3600,
    )

    with patch("src.modules.auth.router.auth_service.refresh", return_value=fake_session):
        response = await async_client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": "valid-old-refresh-token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["access_token"] == "new-access-token"
        assert data["refresh_token"] == "new-refresh-token"


@pytest.mark.asyncio
async def test_logout_endpoint(async_client: AsyncClient, create_test_token):
    token = create_test_token()
    with patch("src.modules.auth.router.auth_service.logout") as mock_logout:
        response = await async_client.post(
            "/api/v1/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 200
        assert "logged out" in response.json()["message"].lower()
        mock_logout.assert_called_once()
