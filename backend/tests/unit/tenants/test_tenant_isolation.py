"""Tenant isolation through the real router and guard, with only the database faked."""

import re
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from src.core.config import Settings, settings
from src.core.pagination import PaginationMeta
from src.main import app
from src.modules.auth.dependencies import get_current_active_user
from src.modules.auth.schemas import UserProfileResponse
from src.modules.auth.rbac import ROLE_PERMISSIONS, Permission, Role
from src.modules.auth.service import AuthService
from src.modules.credits.service import CreditsService
from src.modules.recipients.schemas import RecipientList
from src.modules.recipients.service import recipient_service
from src.modules.tenants.schemas import TenantCreate, TenantRead
from src.modules.tenants.service import TenantService, tenant_service
from src.modules.users.service import UserService

TENANT_A = "aaaaaaaa-0000-4000-8000-000000000001"
TENANT_B = "bbbbbbbb-0000-4000-8000-000000000002"
TENANT_INTERNAL = "dddddddd-0000-4000-8000-000000000004"
MISSING_TENANT = "cccccccc-0000-4000-8000-000000000003"
RECIPIENTS_A = f"/api/v1/tenants/{TENANT_A}/recipients"
RECIPIENT_BODY = {
    "name": "A Person",
    "mobileNumber": "+919999999999",
    "address": {"addressLine1": "1 Road", "city": "Pune", "postalCode": "411001", "country": "IN"},
    "dateOfBirth": "1990-01-01",
}


class FakeQuery:
    def __init__(self, rows, recorded):
        self.rows, self.recorded = rows, recorded

    def select(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def eq(self, column, value):
        self.recorded.append((column, value))
        self.rows = [row for row in self.rows if column not in row or str(row[column]) == str(value)]
        return self

    def neq(self, column, value):
        self.rows = [row for row in self.rows if str(row.get(column)) != str(value)]
        return self

    def in_(self, column, values):
        self.rows = [row for row in self.rows if row.get(column) in values]
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows, count=len(self.rows))


class FakeDatabase:
    def __init__(self, tables):
        self.tables, self.recorded = tables, []

    def table(self, name):
        return FakeQuery(list(self.tables.get(name, [])), self.recorded)


def tenant_row(tenant_id, status, name, tenant_type="ORGANIZATION"):
    return {
        "id": tenant_id, "status": status, "name": name, "tenant_type": tenant_type,
        "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-01-01T00:00:00Z",
    }


def actor(role, tenant_id=None):
    return UserProfileResponse(
        id="11111111-0000-4000-8000-00000000000a",
        email="person@example.com",
        role=role,
        is_active=True,
        tenant_id=tenant_id,
    )


@pytest.fixture
def database(monkeypatch):
    fake = FakeDatabase({
        "tenants": [
            tenant_row(TENANT_A, "ACTIVE", "Acme"),
            tenant_row(TENANT_B, "DEACTIVATED", "Beta"),
            tenant_row(TENANT_INTERNAL, "ACTIVE", "TOFAA Internal", "INTERNAL"),
        ],
        "team_client_assignments": [
            {"id": "x", "tenant_id": TENANT_A, "user_id": actor("KAM").id, "active": True}
        ],
    })
    monkeypatch.setattr(tenant_service, "database", fake)
    return fake


@pytest.fixture
def service_calls(monkeypatch):
    """Record reaching the service, proving a rejected request never touched tenant data."""
    calls = []

    def list_recipients(tenant_id, _actor, **_kwargs):
        calls.append(tenant_id)
        return RecipientList(items=[], pagination=PaginationMeta(page=1, limit=10, total_records=0))

    monkeypatch.setattr(recipient_service, "list_recipients", list_recipients)
    return calls


async def request_as(user, method, path, **kwargs):
    app.dependency_overrides[get_current_active_user] = lambda: user
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            return await client.request(method, path, **kwargs)
    finally:
        app.dependency_overrides.pop(get_current_active_user, None)


@pytest.mark.asyncio
async def test_client_cannot_reach_another_tenant(database, service_calls):
    response = await request_as(actor("CLIENT", TENANT_B), "GET", RECIPIENTS_A)
    assert response.status_code == 404
    assert service_calls == []


@pytest.mark.asyncio
async def test_client_reaches_own_tenant(database, service_calls):
    response = await request_as(actor("CLIENT", TENANT_A), "GET", RECIPIENTS_A)
    assert response.status_code == 200
    assert service_calls == [TENANT_A]


@pytest.mark.asyncio
async def test_uppercase_tenant_id_still_matches_the_caller(database, service_calls):
    response = await request_as(actor("CLIENT", TENANT_A), "GET", RECIPIENTS_A.upper().replace("/API/V1/TENANTS", "/api/v1/tenants").replace("/RECIPIENTS", "/recipients"))
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_kam_reaches_every_client_for_now(database, service_calls):
    for tenant in (TENANT_A, TENANT_B):
        assert (await request_as(actor("KAM"), "GET", f"/api/v1/tenants/{tenant}/recipients")).status_code == 200
    assert service_calls == [TENANT_A, TENANT_B]


@pytest.mark.asyncio
async def test_kam_is_limited_to_assignments_once_enforced(database, service_calls, monkeypatch):
    """Sprint 2's manager role flips this switch; a KAM's own home tenant must still grant nothing."""
    monkeypatch.setattr(settings, "KAM_ACCESS_ALL_CLIENTS", False)
    assert (await request_as(actor("KAM", TENANT_B), "GET", RECIPIENTS_A)).status_code == 200
    denied = await request_as(actor("KAM", TENANT_B), "GET", f"/api/v1/tenants/{TENANT_B}/recipients")
    assert denied.status_code == 404
    assert service_calls == [TENANT_A]


@pytest.mark.asyncio
async def test_internal_tenant_is_never_a_data_context(database, service_calls):
    for role in ("SUPER_ADMIN", "KAM"):
        response = await request_as(actor(role), "GET", f"/api/v1/tenants/{TENANT_INTERNAL}/recipients")
        assert response.status_code == 404
    assert service_calls == []


def test_internal_tenant_is_hidden_from_the_client_list(database):
    names = [t.name for t in tenant_service.list(actor("SUPER_ADMIN"), page=1, limit=10, search=None).items]
    assert names == ["Acme", "Beta"]


def test_the_internal_tenant_cannot_be_created_through_the_api():
    with pytest.raises(ValidationError):
        TenantCreate(tenantType="INTERNAL", name="Another internal")


@pytest.mark.asyncio
async def test_super_admin_tenant_id_is_still_validated(database, service_calls):
    """The reported bug: a super admin passed for any ID, including one that does not exist."""
    response = await request_as(actor("SUPER_ADMIN"), "GET", f"/api/v1/tenants/{MISSING_TENANT}/recipients")
    assert response.status_code == 404
    assert response.json()["message"] == "Tenant not found."
    assert service_calls == []


@pytest.mark.asyncio
async def test_malformed_tenant_id_is_rejected(database, service_calls):
    response = await request_as(actor("SUPER_ADMIN"), "GET", "/api/v1/tenants/not-a-uuid/recipients")
    assert response.status_code == 422
    assert service_calls == []


@pytest.mark.asyncio
async def test_deactivated_tenant_is_readable_but_frozen(database, service_calls, monkeypatch):
    path = f"/api/v1/tenants/{TENANT_B}/recipients"
    assert (await request_as(actor("SUPER_ADMIN"), "GET", path)).status_code == 200

    def create_must_not_run(*_args):
        raise AssertionError("A write reached a deactivated tenant")

    monkeypatch.setattr(recipient_service, "create_recipient", create_must_not_run)
    response = await request_as(actor("SUPER_ADMIN"), "POST", path, json=RECIPIENT_BODY)
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_every_tenant_route_rejects_another_tenants_client(database):
    """Calls each route in the API schema, so a new route mounted without the guard fails here."""
    # Tenant management reaches deactivated tenants on purpose and checks scope in its service.
    management = {
        "/api/v1/tenants/{tenant_id}",
        "/api/v1/tenants/{tenant_id}/activate",
        "/api/v1/tenants/{tenant_id}/deactivate",
    }
    operations = [
        (method.upper(), path)
        for path, item in app.openapi()["paths"].items()
        if "{tenant_id}" in path and path not in management
        for method in item
        if method in {"get", "post", "put", "patch", "delete"}
    ]
    assert len(operations) > 40

    not_rejected = []
    for method, path in operations:
        url = re.sub(r"\{[a-z_]+\}", MISSING_TENANT, path.replace("{tenant_id}", TENANT_A))
        response = await request_as(actor("CLIENT", TENANT_B), method, url)
        if response.status_code != 404 or response.json()["message"] != "Tenant not found.":
            not_rejected.append((method, path, response.status_code))
    assert not_rejected == []


def test_require_context_checks_scope_before_existence():
    """Another tenant's real ID and a made-up ID must look identical to a client."""
    service = TenantService(FakeDatabase({"tenants": [{"id": TENANT_B, "status": "ACTIVE"}]}))
    responses = []
    for target in (TENANT_B, MISSING_TENANT):
        with pytest.raises(HTTPException) as exc_info:
            service.require_context(target, actor("CLIENT", TENANT_A))
        responses.append((exc_info.value.status_code, exc_info.value.detail))
    assert responses[0] == responses[1] == (404, "Tenant not found.")


def test_clients_cannot_look_up_users_at_all(monkeypatch):
    monkeypatch.setattr(tenant_service, "require_access", lambda *_args: None)
    with pytest.raises(HTTPException) as exc_info:
        UserService(database=SimpleNamespace()).get_user(TENANT_A, "some-user", actor("CLIENT", TENANT_A))
    assert exc_info.value.status_code == 403


@pytest.mark.parametrize("role, expected_filter", [("KAM", True), ("SUPER_ADMIN", False)])
def test_only_super_admin_can_reach_platform_staff_through_a_tenant(monkeypatch, role, expected_filter):
    """Otherwise a client could reset the password of a super admin homed in their tenant."""
    monkeypatch.setattr(tenant_service, "require_access", lambda *_args: None)
    captured = {}
    service = UserService(database=SimpleNamespace())

    def user_query(_tenant_id, *, count=None, clients_only=False):
        captured["clients_only"] = clients_only
        raise HTTPException(status_code=404, detail="User not found.")

    monkeypatch.setattr(service, "_user_query", user_query)
    with pytest.raises(HTTPException):
        service.get_user(TENANT_A, "some-user", actor(role))
    assert captured["clients_only"] is expected_filter


def test_clients_only_filter_targets_the_profile_role():
    class Query:
        filters = []

        def select(self, *_args, **_kwargs):
            return self

        def eq(self, column, value):
            self.filters.append((column, value))
            return self

    service = UserService(database=SimpleNamespace(table=lambda _name: Query()))
    assert ("profiles.role", "CLIENT") in service._user_query(TENANT_A, clients_only=True).filters


def login_service(monkeypatch, *, role="CLIENT", tenant=None, active=True, tenant_after_accept=None):
    session = SimpleNamespace(
        access_token="access", refresh_token="refresh", expires_in=3600, expires_at=1, token_type="bearer"
    )
    user = SimpleNamespace(id="u", email="u@example.com", user_metadata={}, app_metadata={})
    anon = SimpleNamespace(
        auth=SimpleNamespace(sign_in_with_password=lambda _creds: SimpleNamespace(user=user, session=session))
    )
    service = AuthService(anon_client=anon, admin_client=SimpleNamespace())
    profile = UserProfileResponse(
        id="u", email="u@example.com", role=role, is_active=active, must_reset_password=True, tenant_id=tenant
    )
    accepted = []

    def accept(user_id, current):
        accepted.append(user_id)
        return current.model_copy(update={"tenant_id": tenant_after_accept})

    monkeypatch.setattr(service, "get_profile_by_id", lambda *_args, **_kwargs: profile)
    monkeypatch.setattr(service, "_accept_pending_invitation", accept)
    return service, accepted


LOGIN = SimpleNamespace(email="u@example.com", password="correct-password")


def test_a_super_admin_signs_in_without_a_tenant(monkeypatch):
    service, _ = login_service(monkeypatch, role="SUPER_ADMIN", tenant=None, tenant_after_accept=None)
    response = service.login(LOGIN)
    assert response.user.role == "SUPER_ADMIN" and response.user.tenant_id is None


def test_a_super_admin_can_use_the_api_without_a_tenant():
    from src.modules.auth.dependencies import get_current_active_user as check

    admin = actor("SUPER_ADMIN").model_copy(update={"must_reset_password": False})
    assert check(admin) is admin


def test_a_user_with_an_old_must_change_password_flag_is_not_blocked():
    """Nobody is forced to change a password before using the app any more."""
    from src.modules.auth.dependencies import get_current_active_user as check

    flagged = actor("CLIENT", TENANT_A).model_copy(update={"must_reset_password": True})
    assert check(flagged) is flagged


@pytest.mark.parametrize("role", ["CLIENT", "KAM"])
def test_a_kam_or_client_without_a_tenant_is_refused_on_every_request(role):
    from src.modules.auth.dependencies import get_current_active_user as check

    with pytest.raises(HTTPException) as exc_info:
        check(actor(role))
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_a_tenantless_super_admin_reaches_any_client(database, service_calls):
    for tenant in (TENANT_A, TENANT_B):
        assert (await request_as(actor("SUPER_ADMIN"), "GET", f"/api/v1/tenants/{tenant}/recipients")).status_code == 200
    assert service_calls == [TENANT_A, TENANT_B]


@pytest.mark.parametrize("role", ["CLIENT", "KAM"])
def test_clients_and_kams_need_an_active_tenant_to_sign_in(monkeypatch, role):
    service, accepted = login_service(monkeypatch, role=role, tenant=None, tenant_after_accept=None)
    with pytest.raises(HTTPException) as exc_info:
        service.login(LOGIN)
    assert exc_info.value.status_code == 403
    assert "organisation" in exc_info.value.detail
    assert accepted == ["u"]


@pytest.mark.parametrize("role", ["CLIENT", "KAM", "SUPER_ADMIN"])
def test_signing_in_activates_a_pending_invitation(monkeypatch, role):
    service, accepted = login_service(monkeypatch, role=role, tenant=None, tenant_after_accept=TENANT_A)
    assert service.login(LOGIN).user.tenant_id == TENANT_A
    assert accepted == ["u"]


def test_an_already_active_member_does_not_re_accept(monkeypatch):
    service, accepted = login_service(monkeypatch, tenant=TENANT_A)
    assert service.login(LOGIN).user.tenant_id == TENANT_A
    assert accepted == []


def test_a_deactivated_user_is_told_why(monkeypatch):
    service, _ = login_service(monkeypatch, tenant=TENANT_A, active=False)
    with pytest.raises(HTTPException) as exc_info:
        service.login(LOGIN)
    assert exc_info.value.status_code == 403
    assert "isn't active" in exc_info.value.detail


class Recorder:
    """Stands in for the Supabase client where a test only needs to see what was written."""

    def __init__(self, tables=None):
        self.rows, self.tables = [], tables or {}

    def table(self, name):
        return FakeQuery(list(self.tables.get(name, [])), []) if name != "audit_log_write" else self

    def insert(self, rows):
        self.rows.extend(rows)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))


class InsertOnly:
    def __init__(self):
        self.rows = []

    def table(self, name):
        assert name == "audit_log"
        return self

    def insert(self, rows):
        self.rows.extend(rows)
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=rows))


@pytest.fixture
def audit_rows(monkeypatch, database):
    fake = InsertOnly()
    monkeypatch.setattr("src.core.audit.get_supabase_admin_client", lambda: fake)
    return fake.rows


RECIPIENT_PATH = f"{RECIPIENTS_A}/eeeeeeee-0000-4000-8000-000000000005"


@pytest.mark.asyncio
async def test_a_staff_change_is_recorded_against_the_client(audit_rows, monkeypatch):
    monkeypatch.setattr(recipient_service, "soft_delete", lambda *_args: None)
    assert (await request_as(actor("KAM"), "DELETE", RECIPIENT_PATH)).status_code == 200
    assert len(audit_rows) == 1
    row = audit_rows[0]
    assert (row["tenant_id"], row["actor_role"], row["on_behalf"], row["resource"]) == (TENANT_A, "KAM", True, "recipients")
    assert row["details"]["recipientId"] == "eeeeeeee-0000-4000-8000-000000000005"


@pytest.mark.asyncio
async def test_the_facts_of_a_change_are_saved_and_the_response_is_untouched(audit_rows, monkeypatch):
    from src.modules.recipients.schemas import RecipientRead

    saved = RecipientRead(id="eeeeeeee-0000-4000-8000-000000000005", tenant_id=TENANT_A, name="Rohan Mehta", mobile_number="+919999999999")
    monkeypatch.setattr(recipient_service, "update_recipient", lambda *_args, **_kw: saved)
    response = await request_as(actor("KAM"), "PATCH", RECIPIENT_PATH, json={"remark": "Likes tea"})
    assert response.status_code == 200 and response.json()["data"]["name"] == "Rohan Mehta"
    assert response.headers["content-length"] == str(len(response.content))
    assert audit_rows[0]["details"]["name"] == "Rohan Mehta" and "mobileNumber" not in audit_rows[0]["details"]


@pytest.mark.asyncio
async def test_a_clients_own_change_is_recorded_but_not_as_staff(audit_rows, monkeypatch):
    monkeypatch.setattr(recipient_service, "soft_delete", lambda *_args: None)
    await request_as(actor("CLIENT", TENANT_A), "DELETE", RECIPIENT_PATH)
    assert [row["on_behalf"] for row in audit_rows] == [False]


@pytest.mark.asyncio
async def test_failed_changes_and_reads_are_not_recorded(audit_rows, monkeypatch):
    def not_found(*_args):
        raise HTTPException(status_code=404, detail="Recipient not found.")

    monkeypatch.setattr(recipient_service, "soft_delete", not_found)
    assert (await request_as(actor("KAM"), "DELETE", RECIPIENT_PATH)).status_code == 404
    monkeypatch.setattr(
        recipient_service, "list_recipients",
        lambda *_a, **_k: RecipientList(items=[], pagination=PaginationMeta(page=1, limit=10, total_records=0)),
    )
    assert (await request_as(actor("KAM"), "GET", RECIPIENTS_A)).status_code == 200
    assert audit_rows == []


@pytest.mark.asyncio
async def test_clients_see_their_tenants_activity_but_staff_only_as_tofaa(database, monkeypatch):
    rows = [
        {"id": 1, "tenant_id": TENANT_A, "on_behalf": True, "resource": "gift-spend", "method": "PUT", "route": "/api/v1/tenants/{tenant_id}/gift-spend/default-budgets",
         "created_at": "2026-11-04T10:00:00Z", "actor_user_id": "secret-staff-id"},
        {"id": 2, "tenant_id": TENANT_A, "on_behalf": False, "resource": "recipients", "method": "POST", "route": "/api/v1/tenants/{tenant_id}/recipients",
         "created_at": "2026-11-04T09:00:00Z", "actor_user_id": "the-client"},
        {"id": 3, "tenant_id": TENANT_B, "on_behalf": True, "resource": "credits", "method": "POST", "route": "/api/v1/admin/tenants/{tenant_id}/credits/adjustments",
         "created_at": "2026-11-04T08:00:00Z", "actor_user_id": "other-tenant-staff"},
    ]
    profiles = [{"id": "the-client", "full_name": "Priya Sharma", "email": "priya@acme.com"}, {"id": "secret-staff-id", "full_name": "Secret Staffer", "email": "s@tofaa.in"}]
    monkeypatch.setattr("src.core.audit.get_supabase_admin_client", lambda: FakeDatabase({"audit_log": rows, "profiles": profiles}))
    response = await request_as(actor("CLIENT", TENANT_A), "GET", f"/api/v1/tenants/{TENANT_A}/activity")
    assert response.status_code == 200
    items = response.json()["items"]
    assert [(i["title"], i["actorName"], i["actorKind"], i["category"]) for i in items] == [
        ("Default budget updated", "TOFAA", "TOFAA", "budget"),
        ("New recipient added", "Priya Sharma", "USER", "people"),
    ]
    assert items[1]["description"] == "A new person was added to your recipients."
    assert "Secret" not in response.text and "secret-staff-id" not in response.text and "other-tenant" not in response.text


@pytest.mark.asyncio
async def test_staff_see_who_made_each_change(database, monkeypatch):
    rows = [{"id": 1, "tenant_id": TENANT_A, "on_behalf": True, "resource": "recipients", "method": "DELETE", "route": "/api/v1/tenants/{tenant_id}/recipients/{recipient_id}",
             "created_at": "2026-11-04T10:00:00Z", "actor_user_id": "staff-1", "entity_id": "eeeeeeee-0000-4000-8000-000000000005"}]
    fake = FakeDatabase({"audit_log": rows, "profiles": [{"id": "staff-1", "full_name": "Asha Rao", "email": "a@tofaa.in"}],
                         "recipients": [{"id": "eeeeeeee-0000-4000-8000-000000000005", "name": "Rohan Mehta"}]})
    monkeypatch.setattr("src.core.audit.get_supabase_admin_client", lambda: fake)
    item = (await request_as(actor("KAM"), "GET", f"/api/v1/tenants/{TENANT_A}/activity")).json()["items"][0]
    assert (item["actorName"], item["title"]) == ("Asha Rao", "Rohan Mehta removed from your recipients")


def invite_service(monkeypatch, tenant_type, members=()):
    service = UserService(database=FakeDatabase({"tenant_memberships": list(members)}))
    tenant = TenantRead(
        id=TENANT_A, tenant_type=tenant_type, name="Acme", status="ACTIVE", email_domain="acme.com",
        created_at="2026-01-01T00:00:00Z", updated_at="2026-01-01T00:00:00Z",
    )
    monkeypatch.setattr(tenant_service, "require_access", lambda *_args: None)
    monkeypatch.setattr(tenant_service, "get", lambda *_args: tenant)

    def reached_email_step():
        raise AssertionError("the invitation got past every tenant rule")

    # Anything that gets this far was allowed, so refusal tests can only pass on the rule they test.
    monkeypatch.setattr("src.modules.users.service.user_email_service.ensure_configured", reached_email_step)
    return service


def invite(role="CLIENT", email="someone@gmail.com"):
    from src.modules.users.schemas import UserInviteCreate

    return UserInviteCreate(email=email, role=role)


def test_an_individual_tenant_can_have_several_users(monkeypatch):
    member = {"tenant_id": TENANT_A, "status": "INVITED", "profiles": {"email": "first@example.com", "is_active": True}}
    service = invite_service(monkeypatch, "INDIVIDUAL", members=[member])
    # Reaching the email step means no tenant rule refused the second user.
    with pytest.raises(AssertionError, match="got past every tenant rule"):
        service.create_invitation(TENANT_A, invite(), actor("SUPER_ADMIN"))


@pytest.mark.parametrize("tenant_type, role", [("INTERNAL", "CLIENT"), ("ORGANIZATION", "KAM"), ("INDIVIDUAL", "SUPER_ADMIN")])
def test_staff_and_client_users_cannot_share_a_tenant(monkeypatch, tenant_type, role):
    service = invite_service(monkeypatch, tenant_type)
    with pytest.raises(HTTPException) as exc_info:
        service.create_invitation(TENANT_A, invite(role=role), actor("SUPER_ADMIN"))
    assert exc_info.value.status_code == 422


def test_the_email_domain_no_longer_blocks_an_invitation(monkeypatch):
    """The tenant's domain is optional information now; any address can be invited."""
    class ReachedEmailStep(Exception):
        pass

    def stop_here():
        raise ReachedEmailStep

    service = invite_service(monkeypatch, "ORGANIZATION")
    monkeypatch.setattr("src.modules.users.service.user_email_service.ensure_configured", stop_here)
    with pytest.raises(ReachedEmailStep):
        service.create_invitation(TENANT_A, invite(email="someone@gmail.com"), actor("SUPER_ADMIN"))


def test_nobody_can_deactivate_their_own_account(monkeypatch):
    service = invite_service(monkeypatch, "ORGANIZATION")
    me = actor("SUPER_ADMIN")
    with pytest.raises(HTTPException) as exc_info:
        service._set_user_active(TENANT_A, me.id, me, is_active=False)
    assert exc_info.value.status_code == 409


def test_nobody_reviews_a_credit_request_they_created():
    kam = actor("KAM")
    service = CreditsService(database=FakeDatabase({
        "credit_requests": [{"id": "r1", "tenant_id": TENANT_A, "created_by_user_id": kam.id}],
    }))
    with pytest.raises(HTTPException) as exc_info:
        service._reviewable_tenant_id("r1", kam)
    assert exc_info.value.status_code == 403
    colleague = actor("KAM").model_copy(update={"id": "22222222-0000-4000-8000-00000000000b"})
    assert service._reviewable_tenant_id("r1", colleague) == TENANT_A


SAFE_PRODUCTION = {
    "ENVIRONMENT": "production",
    "SUPABASE_URL": "https://project.supabase.co",
    "SUPABASE_ANON_KEY": "anon",
    "SUPABASE_SERVICE_ROLE_KEY": "service",
    "SUPABASE_JWT_SECRET": "x" * 40,
    "FRONTEND_URL": "https://app.example.com",
    "BACKEND_CORS_ORIGINS": "https://app.example.com",
}


def test_safe_production_settings_are_accepted():
    assert Settings(_env_file=None, **SAFE_PRODUCTION).is_production


@pytest.mark.parametrize(
    "override",
    [
        {"SUPABASE_JWT_SECRET": "mock-jwt-secret-for-development-and-testing-only"},
        {"SUPABASE_JWT_SECRET": "short"},
        {"SUPABASE_SERVICE_ROLE_KEY": "mock-service-role-key"},
        {"SUPABASE_URL": "http://project.supabase.co"},
        {"FRONTEND_URL": "http://app.example.com"},
        {"BACKEND_CORS_ORIGINS": "*"},
        {"BACKEND_CORS_ORIGINS": "http://app.example.com"},
    ],
)
def test_unsafe_production_settings_stop_startup(override):
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{**SAFE_PRODUCTION, **override})


def test_development_defaults_stay_allowed():
    assert not Settings(_env_file=None, ENVIRONMENT="development").is_production
