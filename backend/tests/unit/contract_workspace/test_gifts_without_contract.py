"""A client without an active contract has an empty gift list, not an error; adding a gift is still refused."""
import pytest
from fastapi import HTTPException

from src.modules.contract_workspace.service import contract_workspace_service as service

TENANT = "11111111-1111-1111-1111-111111111111"


def test_listing_is_empty_and_says_why(monkeypatch):
    monkeypatch.setattr(service, "_authorize_read", lambda *a: None)
    monkeypatch.setattr(service, "_find_active_contract", lambda tenant: None)
    monkeypatch.setattr(service, "_enrich", lambda rows, actor: [])
    page = service.list_gifts(TENANT, None, page=1, limit=20)
    assert page.items == [] and page.pagination.total_records == 0
    assert page.model_dump(by_alias=True)["hasActiveContract"] is False


def test_other_gift_actions_still_need_a_contract(monkeypatch):
    monkeypatch.setattr(service, "_find_active_contract", lambda tenant: None)
    monkeypatch.setattr(service, "_authorize_team", lambda *a: None)
    for call in (lambda: service.create_gift(TENANT, None, None), lambda: service.export_rows(TENANT, None)):
        with pytest.raises(HTTPException) as err:
            call()
        assert err.value.status_code == 404
