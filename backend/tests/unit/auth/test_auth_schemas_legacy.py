import pytest
from pydantic import ValidationError
from src.modules.auth.schemas import UserLoginRequest, UserRegisterRequest


def test_user_register_schema_valid():
    model = UserRegisterRequest(
        email="test@example.com",
        password="securePassword123",
        full_name="Alice Wonder",
    )
    assert model.email == "test@example.com"
    assert model.password == "securePassword123"
    assert model.full_name == "Alice Wonder"


def test_user_register_schema_invalid_email():
    with pytest.raises(ValidationError):
        UserRegisterRequest(
            email="invalid-email-address",
            password="securePassword123",
        )


def test_user_register_schema_short_password():
    with pytest.raises(ValidationError):
        UserRegisterRequest(
            email="test@example.com",
            password="short",  # Less than 8 characters
        )


def test_user_login_schema_valid():
    model = UserLoginRequest(
        email="test@example.com",
        password="anyPassword",
    )
    assert model.email == "test@example.com"
