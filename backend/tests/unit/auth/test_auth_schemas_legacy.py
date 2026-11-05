from src.modules.auth.schemas import UserLoginRequest


def test_user_login_schema_valid():
    model = UserLoginRequest(
        email="test@example.com",
        password="anyPassword",
    )
    assert model.email == "test@example.com"
