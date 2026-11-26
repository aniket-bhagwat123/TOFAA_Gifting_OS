"""Gift requests read by TOFAA CRM: the shared key, and nothing outside the clients the CRM names."""
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.core.config import settings
from src.main import app
from src.modules.crm_gifting.service import STATUSES, CrmGiftingService, crm_gifting_service

KEY = "k" * 40
TENANT = "11111111-1111-1111-1111-111111111111"
REQUEST = "22222222-2222-2222-2222-222222222222"
BASE = "/api/v1/integrations/crm/gift-requests"


def test_key_is_required(monkeypatch):
    monkeypatch.setattr(settings, "CRM_API_KEY", KEY)
    monkeypatch.setattr(crm_gifting_service, "search", lambda ids, **kw: {"ids": ids})
    client = TestClient(app)
    body = {"tenantIds": [TENANT]}
    assert client.post(f"{BASE}/search", json=body).status_code == 401
    assert client.post(f"{BASE}/search", json=body, headers={"X-API-Key": "wrong"}).status_code == 401
    assert client.post(f"{BASE}/{REQUEST}", json=body).status_code == 401
    res = client.post(f"{BASE}/search", json=body, headers={"X-API-Key": KEY})
    assert res.status_code == 200 and res.json()["data"] == {"ids": [TENANT]}


def test_no_clients_means_nothing_and_no_database_call():
    service = CrmGiftingService(requests=object())  # any database use would fail
    assert service.search([], status=None, search=None, page=1, limit=25)["items"] == []
    with pytest.raises(HTTPException) as err:
        service.detail([], REQUEST)
    assert err.value.status_code == 404


def test_drafts_are_never_listed():
    assert "DRAFT" not in STATUSES and "SUBMITTED" in STATUSES


class _Actors:
    def __init__(self):
        self.made = []

    def get(self, crm_user_id, name):
        self.made.append(crm_user_id)
        return type("A", (), {"id": "os-user", "role": "KAM"})()


def _service(monkeypatch, status, *, tenant_status="ACTIVE"):
    sent = []
    requests = type("R", (), {"_transition_rpc": lambda self, *a, **k: sent.append((a, k))})()
    tenants = type("T", (), {"tenant_state": lambda self, t: {"status": tenant_status}})()
    actors = _Actors()
    service = CrmGiftingService(requests=requests, actors=actors, tenants=tenants)
    monkeypatch.setattr(service, "_row", lambda ids, rid: {"status": status, "tenant_id": TENANT})
    monkeypatch.setattr(service, "detail", lambda ids, rid: {"ok": True})
    return service, actors, sent


def _act(service, action, **kw):
    return service.act([TENANT], REQUEST, action, crm_user_id="u-1", crm_user_name="Asha", **kw)


def test_actions_are_off_by_default_and_create_nothing(monkeypatch):
    assert type(settings).model_fields["CRM_KAM_ACTIONS_ENABLED"].default is False
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", False)
    service, actors, sent = _service(monkeypatch, "SUBMITTED")
    with pytest.raises(HTTPException) as err:
        _act(service, "start_review")
    assert err.value.status_code == 403 and not actors.made and not sent


@pytest.mark.parametrize("status,action,kw,code", [
    ("SUBMITTED", "deliver", {}, 409),
    ("PROPOSAL_READY", "approve", {}, 409),
    ("SUBMITTED", "request_info", {"note": "  "}, 422),
    ("IN_REVIEW", "publish_proposal", {}, 422),
])
def test_a_refused_action_creates_no_account_and_writes_nothing(monkeypatch, status, action, kw, code):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", True)
    service, actors, sent = _service(monkeypatch, status)
    with pytest.raises(HTTPException) as err:
        _act(service, action, **kw)
    assert err.value.status_code == code and not actors.made and not sent


def test_a_deactivated_client_cannot_be_changed(monkeypatch):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", True)
    service, actors, sent = _service(monkeypatch, "SUBMITTED", tenant_status="DEACTIVATED")
    with pytest.raises(HTTPException):
        _act(service, "start_review")
    assert not actors.made and not sent


def test_an_allowed_action_runs_as_the_crm_persons_identity(monkeypatch):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", True)
    service, actors, sent = _service(monkeypatch, "SUBMITTED")
    assert _act(service, "start_review") == {"ok": True}
    (args, kwargs), = sent
    assert actors.made == ["u-1"] and args[:3] == (TENANT, REQUEST, "start_review") and args[3].id == "os-user"
    assert kwargs == {"note": None, "proposal": None}
