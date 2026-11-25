"""People mastered in the CRM: the client sends the key and actor, passes CRM answers through, links new clients;
the mirror stores CRM data with the same ids; the CRM's change notice needs the key."""
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from src.core.config import settings
from src.core.errors import ApiError
from src.main import app
from src.modules.auth.rbac import Role
from src.modules.crm_people import client as client_module, mapping, sync
from src.modules.crm_people.client import CrmPeopleClient, actor_headers

KEY = "k" * 40
TENANT = "11111111-1111-1111-1111-111111111111"


def actor(role=Role.CLIENT):
    return SimpleNamespace(id="u1", full_name="Priya Sharma", email="priya@acme.com", role=role)


@pytest.fixture
def crm(monkeypatch):
    monkeypatch.setattr(settings, "CRM_API_URL", "https://crm.example.com/")
    monkeypatch.setattr(settings, "CRM_API_KEY", KEY)
    calls, answers = [], []

    def fake_request(method, url, **kwargs):
        calls.append((method, url, kwargs))
        status, body = answers.pop(0)
        return httpx.Response(status, json=body, request=httpx.Request(method, url))

    monkeypatch.setattr(client_module.httpx, "request", fake_request)
    return calls, answers


def test_each_call_carries_the_key_tenant_and_who_acted(crm):
    calls, answers = crm
    answers.append((200, {"data": {"items": []}, "message": "OK"}))
    assert CrmPeopleClient().call("GET", "/people", TENANT, actor()) == {"items": []}
    method, url, kwargs = calls[0]
    assert url == "https://crm.example.com/api/v1/integrations/gifting/people"
    headers = kwargs["headers"]
    assert headers["X-API-Key"] == KEY and headers["X-Tenant-Id"] == TENANT
    assert (headers["X-Actor-Name"], headers["X-Actor-Kind"]) == ("Priya Sharma", "CLIENT")
    assert kwargs["follow_redirects"] is False


def test_staff_are_recorded_as_tofaa():
    assert actor_headers(actor(Role.KAM))["X-Actor-Kind"] == "TOFAA"
    assert actor_headers(actor(Role.SUPER_ADMIN))["X-Actor-Role"] == "SUPER_ADMIN"


@pytest.mark.parametrize("status,expected", [(409, 409), (422, 422), (404, 404), (401, 502), (500, 502)])
def test_crm_refusals_keep_their_meaning(crm, status, expected):
    calls, answers = crm
    answers.append((status, {"data": {"duplicates": []}, "message": "This person may already be here."}))
    with pytest.raises(ApiError) as caught:
        CrmPeopleClient().call("POST", "/people", TENANT, actor())
    assert caught.value.status_code == expected
    if expected == status:
        assert caught.value.detail == "This person may already be here." and caught.value.data == {"duplicates": []}


def test_an_unlinked_client_is_linked_once_then_the_call_repeats(crm, monkeypatch):
    calls, answers = crm
    monkeypatch.setattr(client_module, "get_supabase_admin_client", lambda: SimpleNamespace(table=lambda _: _Rows([{"name": "Wendy"}])))
    answers += [
        (404, {"data": {"code": "TENANT_NOT_LINKED"}, "message": "not linked"}),
        (200, {"data": {"companyId": "c-9", "name": "Wendy"}, "message": "OK"}),
        (200, {"data": {"companyId": "c-9", "name": "Wendy"}, "message": "OK"}),
    ]
    client = CrmPeopleClient()
    assert client.company_id(TENANT, actor()) == "c-9"
    assert [c[0] for c in calls] == ["GET", "PUT", "GET"]
    assert calls[1][2]["json"] == {"name": "Wendy"}
    assert client.company_id(TENANT, actor()) == "c-9" and len(calls) == 3  # remembered


def test_without_a_crm_connection_nothing_is_saved(monkeypatch):
    monkeypatch.setattr(settings, "CRM_API_URL", "")
    with pytest.raises(ApiError) as caught:
        CrmPeopleClient().call("POST", "/people", TENANT, actor())
    assert caught.value.status_code == 503


def test_the_crm_being_down_is_a_clear_503(crm, monkeypatch):
    def down(*_a, **_k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(client_module.httpx, "request", down)
    with pytest.raises(ApiError) as caught:
        CrmPeopleClient().call("PATCH", "/people/x", TENANT, actor())
    assert caught.value.status_code == 503


def test_gifting_fields_map_to_crm_fields():
    body = mapping.person_body({"name": "A", "company": "Acme", "recipient_type": "INDIVIDUAL", "import_batch_id": "x", "avatar_url": "y"})
    assert body == {"name": "A", "companyName": "Acme", "recipientType": "INTERNAL"}


def test_a_crm_person_becomes_the_same_mirror_row():
    item = {
        "id": "p1", "giftingTenantId": TENANT, "name": "Asha", "mobileNumber": "+919876543210", "companyName": "Acme", "addedBy": "CLIENT",
        "status": "ACTIVE", "version": 4, "deletedAt": None, "isPrimary": False, "recipientType": "EXTERNAL", "city": None,
        "addresses": [
            {"id": "a2", "addressLine1": "2 Other Rd", "city": "Pune", "postalCode": "411001", "country": "IN", "isDefault": False},
            {"id": "a1", "addressLine1": "1 Marine Drive", "city": "Mumbai", "postalCode": "400001", "country": "IN", "isDefault": True},
        ],
    }
    row = sync.person_row(item)
    assert (row["id"], row["tenant_id"], row["company"], row["source"], row["version"]) == ("p1", TENANT, "Acme", "CLIENT", 4)
    assert row["address"]["address_line1"] == "1 Marine Drive" and row["city"] == "Mumbai"  # the default address


def test_the_change_notice_needs_the_key(monkeypatch):
    monkeypatch.setattr(settings, "CRM_API_KEY", KEY)
    started = []
    monkeypatch.setattr(sync.people_mirror, "catch_up_in_background", lambda: started.append(True))
    client = TestClient(app)
    url = "/api/v1/integrations/crm/people-changed"
    assert client.post(url).status_code == 401
    assert client.post(url, headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.post(url, headers={"X-API-Key": KEY}).status_code == 202
    assert started == [True]


class _Rows:
    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, _):
        return lambda *a, **k: self

    def execute(self):
        return SimpleNamespace(data=self.rows)
