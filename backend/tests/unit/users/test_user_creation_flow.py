"""Creating a user with and without the email invitation, through the real service with a fake database."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from src.modules.auth.schemas import UserProfileResponse
from src.modules.tenants.schemas import TenantRead
from src.modules.tenants.service import tenant_service
from src.modules.users.schemas import UserInviteCreate
from src.modules.users.service import UserService

TENANT = "aaaaaaaa-0000-4000-8000-000000000001"


class Chain:
    def __init__(self, database, table):
        self.database, self.table, self.action, self.values = database, table, None, None

    def insert(self, values):
        self.action, self.values = "insert", values
        return self

    def update(self, values):
        self.action, self.values = "update", values
        return self

    def eq(self, *_args):
        return self

    def select(self, *_args):
        return self

    def execute(self):
        self.database.calls.append((self.table, self.action, self.values))
        if self.table == "tenant_invitations":
            status = (self.values or {}).get("status", "PENDING")
            return SimpleNamespace(data=[{"id": "inv-1", "status": status, "expires_at": "2026-12-01T00:00:00Z"}])
        return SimpleNamespace(data=[{"id": "u1"}])


class FlowDatabase:
    def __init__(self):
        self.calls = []
        self.auth = SimpleNamespace(admin=SimpleNamespace(
            create_user=lambda _attrs: SimpleNamespace(user=SimpleNamespace(id="u1")),
            generate_link=self.generate_link,
        ))

    def generate_link(self, _attrs):
        self.calls.append(("auth", "generate_link", None))
        return SimpleNamespace(properties=SimpleNamespace(action_link="https://example.com/reset"))

    def table(self, name):
        return Chain(self, name)

    def rpc(self, function, params):
        self.calls.append(("rpc", function, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=True))


@pytest.fixture
def flow(monkeypatch):
    emails = []
    database = FlowDatabase()
    tenant = TenantRead(
        id=TENANT, tenant_type="ORGANIZATION", name="Acme", status="ACTIVE",
        created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z",
    )
    monkeypatch.setattr(tenant_service, "require_access", lambda *_args: None)
    monkeypatch.setattr(tenant_service, "get", lambda *_args: tenant)
    monkeypatch.setattr("src.modules.users.service.user_email_service.send_temporary_password", lambda **kw: emails.append(kw))
    return UserService(database=database), database, emails


def admin():
    return UserProfileResponse(id="99999999-0000-4000-8000-000000000009", email="a@example.com", role="SUPER_ADMIN", is_active=True)


def test_with_the_box_ticked_an_email_is_sent(flow, monkeypatch):
    service, database, emails = flow
    monkeypatch.setattr("src.modules.users.service.user_email_service.ensure_configured", lambda: None)
    result = service.create_invitation(TENANT, UserInviteCreate(email="new@example.com", send_invitation=True), admin())
    assert len(emails) == 1 and emails[0]["email"] == "new@example.com"
    assert result.status == "SENT"
    assert not any(call[0] == "rpc" for call in database.calls)


def test_with_the_box_unticked_nobody_is_emailed_and_the_account_works_at_once(flow, monkeypatch):
    service, database, emails = flow

    def email_must_not_be_needed():
        raise AssertionError("email settings were required for a user created without an invitation")

    monkeypatch.setattr("src.modules.users.service.user_email_service.ensure_configured", email_must_not_be_needed)
    result = service.create_invitation(
        TENANT, UserInviteCreate(email="new@example.com", password="a-strong-password", send_invitation=False), admin()
    )
    assert emails == []
    assert ("auth", "generate_link", None) not in database.calls
    assert ("rpc", "accept_tenant_invitation", {"p_user_id": "u1"}) in database.calls
    assert result.status == "ACCEPTED"


def test_the_invitation_is_sent_by_default():
    assert UserInviteCreate(email="new@example.com").send_invitation is True


def test_without_an_email_a_password_is_required():
    with pytest.raises(ValidationError):
        UserInviteCreate(email="new@example.com", send_invitation=False)
