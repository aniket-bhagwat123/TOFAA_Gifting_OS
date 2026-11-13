"""The recipients list can be limited to specific recipient IDs, e.g. the members of one group."""

from types import SimpleNamespace

import pytest

from src.core.pagination import PaginationMeta
from src.modules.auth.schemas import UserProfileResponse
from src.modules.recipients.schemas import RecipientList
from src.modules.recipients.service import RecipientService, recipient_service

A = "14d36f4c-ec6a-4211-9f32-79e39c5d54d1"
B = "24d36f4c-ec6a-4211-9f32-79e39c5d54d2"


@pytest.fixture
def seen(monkeypatch):
    calls = []

    def list_recipients(tenant_id, actor, **kwargs):
        calls.append(kwargs)
        return RecipientList(items=[], pagination=PaginationMeta(page=1, limit=10, total_records=0))

    monkeypatch.setattr(recipient_service, "list_recipients", list_recipients)
    return calls


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_ids_are_passed_to_the_service(e2e_client, tenant_id, seen):
    response = await e2e_client.get(f"/api/v1/tenants/{tenant_id}/recipients?recipientIds={A},{B}")
    assert response.status_code == 200
    assert seen[0]["recipient_ids"] == [A, B]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_no_filter_means_every_recipient(e2e_client, tenant_id, seen):
    await e2e_client.get(f"/api/v1/tenants/{tenant_id}/recipients")
    assert seen[0]["recipient_ids"] is None


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_an_empty_filter_means_no_recipients_not_all(e2e_client, tenant_id, seen):
    await e2e_client.get(f"/api/v1/tenants/{tenant_id}/recipients?recipientIds=")
    assert seen[0]["recipient_ids"] == []


@pytest.mark.e2e
@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["not-a-uuid", f"{A},oops", ",".join([A] * 101)])
async def test_bad_ids_are_rejected(e2e_client, tenant_id, seen, value):
    response = await e2e_client.get(f"/api/v1/tenants/{tenant_id}/recipients?recipientIds={value}")
    assert response.status_code == 422
    assert seen == []


class Recorder:
    """Records every query call so the test can see what was asked of the database."""

    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.calls.append((name, args))
            return self if name != "execute" else SimpleNamespace(data=[], count=0)
        return call


def admin():
    return UserProfileResponse(id="99999999-0000-4000-8000-000000000009", email="a@example.com", role="SUPER_ADMIN", is_active=True)


def test_the_database_query_stays_inside_the_tenant_and_filters_by_id():
    database = Recorder()
    RecipientService(database=database).list_recipients("tenant-1", admin(), page=1, limit=10, recipient_ids=[A, B])
    assert ("eq", ("tenant_id", "tenant-1")) in database.calls
    assert ("in_", ("id", [A, B])) in database.calls


def test_an_empty_id_list_never_reaches_the_database():
    database = Recorder()
    result = RecipientService(database=database).list_recipients("tenant-1", admin(), page=1, limit=10, recipient_ids=[])
    assert result.items == [] and database.calls == []


def test_without_ids_there_is_no_id_filter():
    database = Recorder()
    RecipientService(database=database).list_recipients("tenant-1", admin(), page=1, limit=10)
    assert not any(name == "in_" for name, _ in database.calls)


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_a_possible_duplicate_reaches_the_client_with_its_matches(e2e_client, tenant_id, monkeypatch):
    from src.core.errors import ApiError

    def refuse(*_args, **_kwargs):
        raise ApiError(409, "This person may already be in your recipients.", {"duplicates": [{"id": A, "name": "Rohan Mehta", "reasons": ["SAME_MOBILE"]}]})

    monkeypatch.setattr(recipient_service, "create_recipient", refuse)
    response = await e2e_client.post(f"/api/v1/tenants/{tenant_id}/recipients", json={"name": "Rohan Mehta"})
    assert response.status_code == 409
    body = response.json()
    assert body["message"] == "This person may already be in your recipients."
    assert body["data"]["duplicates"][0]["reasons"] == ["SAME_MOBILE"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_the_duplicate_check_route_is_not_mistaken_for_a_recipient_id(e2e_client, tenant_id, monkeypatch):
    monkeypatch.setattr(recipient_service, "find_duplicates", lambda *_a, **kw: [{"id": A, "name": kw["name"], "reasons": ["SAME_NAME"]}])
    response = await e2e_client.get(f"/api/v1/tenants/{tenant_id}/recipients/duplicates?name=Rohan")
    assert response.status_code == 200 and response.json()["data"][0]["name"] == "Rohan"
