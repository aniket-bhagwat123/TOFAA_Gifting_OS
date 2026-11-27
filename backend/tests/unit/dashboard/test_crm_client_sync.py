"""The CRM keeps its client accounts in step: which changes are announced to it, and what it may change here."""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from src.core.config import settings
from src.modules import crm_clients_notice as notice
from src.modules.crm_gifting.clients import CrmClientsService

ID = "00000000-0000-0000-0000-000000000001"


def test_only_changes_to_a_client_itself_are_announced():
    for path in ("/api/v1/tenants", f"/api/v1/tenants/{ID}", f"/api/v1/tenants/{ID}/deactivate"):
        assert notice.is_client_change("POST", path, 200)
    assert not notice.is_client_change("GET", f"/api/v1/tenants/{ID}", 200)
    assert not notice.is_client_change("POST", f"/api/v1/tenants/{ID}/recipients", 201)
    assert not notice.is_client_change("POST", "/api/v1/tenants", 422)


def test_the_crm_changes_nothing_while_switched_off(monkeypatch):
    monkeypatch.setattr(settings, "CRM_KAM_ACTIONS_ENABLED", False)
    service = CrmClientsService(database=SimpleNamespace(), actors=SimpleNamespace(), tenants=SimpleNamespace())
    with pytest.raises(HTTPException) as refused:
        service.change(ID, name="New", active=None, crm_user_id=ID, crm_user_name="Sync")
    assert refused.value.status_code == 403
