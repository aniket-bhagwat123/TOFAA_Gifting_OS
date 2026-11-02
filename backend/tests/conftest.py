import os
import time
from typing import AsyncGenerator
import jwt
import pytest
from httpx import ASGITransport, AsyncClient

# Set testing environment variables before imports
os.environ["ENVIRONMENT"] = "testing"
os.environ["SUPABASE_URL"] = "https://test.supabase.co"
os.environ["SUPABASE_ANON_KEY"] = "test-anon-key"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key"
os.environ["SUPABASE_JWT_SECRET"] = "super-secret-test-jwt-key-32-chars-long!"
os.environ["SUPABASE_JWT_ALGORITHM"] = "HS256"
os.environ["SUPABASE_JWT_AUDIENCE"] = "authenticated"

from src.core.config import get_settings
# Clear lru_cache to pick up testing environment
get_settings.cache_clear()

from src.main import app


@pytest.fixture
def jwt_secret() -> str:
    return "super-secret-test-jwt-key-32-chars-long!"


@pytest.fixture
def create_test_token(jwt_secret: str):
    def _create(
        user_id: str = "11111111-1111-1111-1111-111111111111",
        email: str = "tester@tofaa.com",
        role: str = "authenticated",
        expires_in: int = 3600,
        audience: str = "authenticated",
        user_metadata: dict | None = None,
    ) -> str:
        payload = {
            "sub": user_id,
            "email": email,
            "role": role,
            "aud": audience,
            "exp": int(time.time()) + expires_in,
            "iat": int(time.time()),
            "user_metadata": user_metadata or {"full_name": "Test User"},
            "app_metadata": {"provider": "email"},
        }
        return jwt.encode(payload, jwt_secret, algorithm="HS256")

    return _create


@pytest.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
