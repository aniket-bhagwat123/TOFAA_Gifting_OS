from functools import lru_cache
from typing import Any
import jwt
from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from src.core.config import settings


ASYMMETRIC_JWT_ALGORITHMS = {"ES256", "RS256"}


@lru_cache(maxsize=1)
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url)


def _verification_key(token: str) -> tuple[Any, str]:
    algorithm = jwt.get_unverified_header(token).get("alg")
    if algorithm == "HS256" and settings.SUPABASE_JWT_ALGORITHM == "HS256":
        return settings.SUPABASE_JWT_SECRET, algorithm
    if algorithm not in ASYMMETRIC_JWT_ALGORITHMS:
        raise jwt.InvalidAlgorithmError("Unsupported Supabase JWT signing algorithm.")

    jwks_url = settings.SUPABASE_JWKS_URL or (
        f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
    )
    signing_key = _jwks_client(jwks_url).get_signing_key_from_jwt(token)
    if signing_key.algorithm_name != algorithm:
        raise jwt.InvalidAlgorithmError("JWT algorithm does not match its signing key.")
    return signing_key.key, algorithm


class TokenPayload(BaseModel):
    sub: str = Field(description="Supabase user UUID")
    email: str | None = None
    role: str = "authenticated"
    aud: str = "authenticated"
    exp: int
    iat: int | None = None
    app_metadata: dict[str, Any] = Field(default_factory=dict)
    user_metadata: dict[str, Any] = Field(default_factory=dict)


def decode_access_token(token: str) -> TokenPayload:
    """
    Decodes and validates a Supabase JWT access token.
    Verifies legacy HS256 tokens with the configured secret and asymmetric tokens with Supabase JWKS.
    Also validates expiration and audience.
    """
    try:
        verification_key, algorithm = _verification_key(token)
        payload = jwt.decode(
            token,
            verification_key,
            algorithms=[algorithm],
            audience=settings.SUPABASE_JWT_AUDIENCE,
            options={
                "verify_aud": bool(settings.SUPABASE_JWT_AUDIENCE),
                "verify_exp": True,
            },
        )
        return TokenPayload(**payload)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired. Please refresh your session.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWKClientConnectionError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication signing keys are temporarily unavailable.",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
