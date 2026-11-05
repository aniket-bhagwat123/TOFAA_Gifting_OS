from functools import lru_cache
from typing import Annotated, Any
from pydantic import BeforeValidator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def parse_cors(v: Any) -> list[str]:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, list):
        return v
    return []


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    # App Settings
    ENVIRONMENT: str = "development"
    PROJECT_NAME: str = "TOFAA Gifting OS"
    API_V1_STR: str = "/api/v1"
    BACKEND_CORS_ORIGINS: Annotated[list[str], BeforeValidator(parse_cors)] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]
    FRONTEND_URL: str = "http://localhost:3000"

    # Every KAM can work on every client for now. When the manager role arrives, set this to
    # false so team_client_assignments decides which clients each KAM may open.
    KAM_ACCESS_ALL_CLIENTS: bool = True

    # Seconds a user's profile, a KAM's client list and a tenant's status are remembered, to skip
    # repeat database reads. Any successful write clears them. 0 turns the cache off.
    AUTH_CACHE_SECONDS: float = 15

    # How far ahead a client sees upcoming occasions (days). Clients get 15-20 days to plan gifts.
    UPCOMING_OCCASION_DAYS: int = 20

    # Resend delivery for tenant invitation emails.
    RESEND_API_KEY: str | None = None
    RESEND_FROM_EMAIL: str | None = None

    # Supabase Settings
    SUPABASE_URL: str = "https://mock.supabase.co"
    SUPABASE_ANON_KEY: str = "mock-anon-key"
    SUPABASE_SERVICE_ROLE_KEY: str = "mock-service-role-key"

    # Supabase JWT Settings
    SUPABASE_JWT_SECRET: str = "mock-jwt-secret-for-development-and-testing-only"
    SUPABASE_JWT_ALGORITHM: str = "HS256"
    SUPABASE_JWT_AUDIENCE: str = "authenticated"
    SUPABASE_JWKS_URL: str | None = None

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() in {"production", "prod"}

    @model_validator(mode="after")
    def reject_unsafe_production_settings(self) -> "Settings":
        """Stop at startup rather than serve production on development secrets or plain HTTP.

        A default JWT secret is public in this repository, so it would let anyone forge a token.
        """
        if not self.is_production:
            return self
        problems = []
        if "mock" in self.SUPABASE_URL or "mock" in self.SUPABASE_ANON_KEY or "mock" in self.SUPABASE_SERVICE_ROLE_KEY:
            problems.append("Supabase URL and keys must be set")
        if self.SUPABASE_JWT_ALGORITHM == "HS256" and (
            "mock" in self.SUPABASE_JWT_SECRET or len(self.SUPABASE_JWT_SECRET) < 32
        ):
            problems.append("SUPABASE_JWT_SECRET must be a real secret of at least 32 characters")
        if not self.SUPABASE_URL.startswith("https://"):
            problems.append("SUPABASE_URL must use https")
        if not self.FRONTEND_URL.startswith("https://"):
            problems.append("FRONTEND_URL must use https")
        if any(origin == "*" or not origin.startswith("https://") for origin in self.BACKEND_CORS_ORIGINS):
            problems.append("BACKEND_CORS_ORIGINS must list https origins only")
        if problems:
            raise ValueError("Unsafe production settings: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
