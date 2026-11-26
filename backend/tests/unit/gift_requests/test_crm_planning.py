"""Occasions, events and new requests from TOFAA CRM: switched off by default, checked before anything is made."""
from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from src.core.config import settings
from src.main import app
from src.modules.crm_gifting.planning import CrmPlanningService
from src.modules.gift_requests.schemas import GiftRequestCreate
from src.modules.gift_requests.service import GiftRequestService

TENANT = "11111111-1111-1111-1111-111111111111"
KEY = "k" * 40


def _service(*, tenant_status="ACTIVE"):
    calls = []

    class Requests:
        _require_recipient = _require_event = _require_occasion = lambda self, *a: None
        _require_complete = staticmethod(GiftRequestService._require_complete)

        def create(self, *a):
            calls.append("create")
            return type("D", (), {"id": "d-1"})()

        def transition(self, tenant, rid, action, actor):
            calls.append(action)
            return type("S", (), {"id": rid, "request_code": "TG-0001", "title": "Gift"})()

    class Actors:
        def get(self, *a):
            calls.append("identity")
            return type("A", (), {"id": "os-user", "role": "KAM"})()

    tenants = type("T", (), {"tenant_state": lambda self, t: {"status": tenant_status}})()
    return CrmPlanningService(requests=Requests(), actors=Actors(), tenants=tenants, occasions=object(), events=object()), calls


def _payload(**extra):
    values = {"recipient_id": uuid4(), "occasion_id": uuid4(), "delivery_date": date.today() + timedelta(days=5),
              "budget_min": 500, "budget_max": 500, "initiated_via": "SELF", "relationship": "Client", **extra}
    values.setdefault("requested_budget", values["budget_max"])
    return GiftRequestCreate(**values)


def _send(service, payload):
    return service.create_request(TENANT, payload, crm_user_id="u-1", crm_user_name="Asha")


def test_nothing_is_made_while_switched_off(monkeypatch):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", False)
    service, calls = _service()
    with pytest.raises(HTTPException) as err:
        _send(service, _payload())
    assert err.value.status_code == 403 and not calls


@pytest.mark.parametrize("status,extra", [
    ("DEACTIVATED", {}),
    ("ACTIVE", {"delivery_date": date.today() - timedelta(days=1)}),
    ("ACTIVE", {"relationship": None}),
])
def test_a_refused_request_leaves_nothing_behind(monkeypatch, status, extra):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", True)
    service, calls = _service(tenant_status=status)
    with pytest.raises(HTTPException):
        _send(service, _payload(**extra))
    assert not calls


def test_a_good_request_is_created_and_submitted(monkeypatch):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", True)
    service, calls = _service()
    assert _send(service, _payload())["requestCode"] == "TG-0001"
    assert calls == ["identity", "create", "submit"]


def test_the_chosen_client_must_be_one_the_crm_allows(monkeypatch):
    monkeypatch.setattr(settings, "CRM_API_KEY", KEY)
    res = TestClient(app).post("/api/v1/integrations/crm/planning/options", headers={"X-API-Key": KEY},
                               json={"tenantIds": [TENANT], "tenantId": str(uuid4())})
    assert res.status_code == 404
