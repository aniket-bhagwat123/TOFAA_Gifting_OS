import time
import jwt
import pytest
from fastapi import HTTPException
from src.core.security import decode_access_token


def test_decode_valid_access_token(create_test_token):
    token = create_test_token(user_id="user-123", email="user@example.com")
    payload = decode_access_token(token)

    assert payload.sub == "user-123"
    assert payload.email == "user@example.com"
    assert payload.aud == "authenticated"


def test_decode_expired_access_token(create_test_token):
    token = create_test_token(user_id="user-123", expires_in=-300)
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(token)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_decode_invalid_signature_access_token():
    invalid_token = jwt.encode(
        {"sub": "hacker", "aud": "authenticated", "exp": int(time.time()) + 3600},
        "wrong-secret-key-that-is-at-least-32-bytes-long",
        algorithm="HS256",
    )
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(invalid_token)
    assert exc_info.value.status_code == 401
    assert "invalid" in exc_info.value.detail.lower()


def test_decode_wrong_audience_access_token(create_test_token):
    token = create_test_token(audience="wrong-audience")
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(token)
    assert exc_info.value.status_code == 401
