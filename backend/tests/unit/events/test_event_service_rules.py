import pytest
from fastapi import HTTPException

from src.modules.auth.schemas import UserProfileResponse
from src.modules.auth.rbac import Permission
from src.modules.events.service import EventService


def test_kam_cannot_edit_tenant_events():
    kam = UserProfileResponse(id="kam-1", email="kam@example.com", role="KAM")
    with pytest.raises(HTTPException) as exc:
        EventService._require_tenant_editor("tenant-1", kam, Permission.EVENT_UPDATE)
    assert exc.value.status_code == 403


def test_tenant_user_can_pass_event_editor_role_check(monkeypatch):
    client = UserProfileResponse(
        id="client-1", email="client@example.com", role="CLIENT", tenant_id="tenant-1"
    )
    monkeypatch.setattr("src.modules.events.service.tenant_service.require_access", lambda tenant, actor: None)
    EventService._require_tenant_editor("tenant-1", client, Permission.EVENT_UPDATE)
