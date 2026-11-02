from datetime import datetime, timezone
from uuid import UUID

import pytest

from src.modules.gift_spend.schemas import (
    GiftSpendNotificationPage,
    OccasionSpendSummary,
    RecipientGroupRead,
)

TENANT_ID = "031c4871-26ff-4b7c-845d-7ce2efd9e745"
RECIPIENT_ID = "14d36f4c-ec6a-4211-9f32-79e39c5d54d1"
GROUP_ID = "7e2493b0-2a36-44be-a4e9-9913e0894a28"
OCCASION_ID = "11770456-747a-458e-9bbf-f5b6a3bbb785"


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_create_recipient_group_api_contract(e2e_client, monkeypatch):
    from src.modules.gift_spend.service import gift_spend_service

    def save_group(tenant_id, payload, actor, *, group_id=None):
        assert tenant_id == TENANT_ID
        assert payload.recipient_ids == [UUID(RECIPIENT_ID)]
        assert actor.role == "SUPER_ADMIN"
        return RecipientGroupRead(
            id=GROUP_ID,
            tenant_id=tenant_id,
            name=payload.name,
            recipient_ids=[RECIPIENT_ID],
            created_at=datetime(2026, 10, 31, tzinfo=timezone.utc),
            updated_at=datetime(2026, 10, 31, tzinfo=timezone.utc),
        )

    monkeypatch.setattr(gift_spend_service, "save_group", save_group)
    response = await e2e_client.post(
        f"/api/v1/tenants/{TENANT_ID}/gift-spend/groups",
        json={"name": "Executives", "recipientIds": [RECIPIENT_ID]},
    )

    assert response.status_code == 201
    assert response.json()["data"]["id"] == GROUP_ID
    assert response.json()["data"]["recipientIds"] == [RECIPIENT_ID]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_occasion_spend_summary_api_contract(e2e_client, monkeypatch):
    from src.modules.gift_spend.service import gift_spend_service

    monkeypatch.setattr(
        gift_spend_service,
        "occasion_summary",
        lambda tenant_id, occasion_id, actor: OccasionSpendSummary(
            occasion_id=occasion_id,
            occasion_name="Diwali",
            tenant_id=tenant_id,
            groups=[],
            recipients=[],
            allocated_credits=0,
            spent_credits=0,
            reserved_credits=0,
        ),
    )
    response = await e2e_client.get(
        f"/api/v1/tenants/{TENANT_ID}/gift-spend/occasions/{OCCASION_ID}/summary"
    )

    assert response.status_code == 200
    assert response.json()["data"]["occasionId"] == OCCASION_ID
    assert response.json()["data"]["occasionName"] == "Diwali"


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_notification_inbox_api_contract(e2e_client, monkeypatch):
    from src.modules.gift_spend.service import gift_spend_service

    def list_notifications(tenant_id, actor, *, page, limit, unread_only):
        assert tenant_id == TENANT_ID
        assert page == 2
        assert limit == 5
        assert unread_only is True
        return GiftSpendNotificationPage(
            items=[],
            pagination={"page": page, "limit": limit, "total_records": 0},
            next_cursor=None,
        )

    monkeypatch.setattr(gift_spend_service, "list_notifications", list_notifications)
    response = await e2e_client.get(
        f"/api/v1/tenants/{TENANT_ID}/gift-spend/notifications?page=2&limit=5&unreadOnly=true"
    )

    assert response.status_code == 200
    assert response.json()["data"]["items"] == []
    assert response.json()["data"]["pagination"] == {
        "page": 2,
        "limit": 5,
        "total_records": 0,
    }
