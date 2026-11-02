import pytest
from fastapi import HTTPException

from src.core.config import settings
from src.modules.users.email import UserEmailService


def test_invitation_email_requires_resend_settings(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", None)
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", None)
    with pytest.raises(HTTPException) as exc:
        UserEmailService.ensure_configured()
    assert exc.value.status_code == 503
    assert "RESEND_API_KEY" in exc.value.detail
    assert "RESEND_FROM_EMAIL" in exc.value.detail


def test_invitation_email_is_configured_when_both_values_exist(monkeypatch):
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(settings, "RESEND_FROM_EMAIL", "TOFAA <no-reply@example.com>")
    UserEmailService.ensure_configured()
