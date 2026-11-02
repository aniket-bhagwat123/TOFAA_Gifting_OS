from src.modules.users.service import UserService


def test_temporary_password_has_required_character_classes():
    password = UserService._generate_temporary_password()
    assert len(password) >= 16
    assert any(char.islower() for char in password)
    assert any(char.isupper() for char in password)
    assert any(char.isdigit() for char in password)
    assert any(not char.isalnum() for char in password)
