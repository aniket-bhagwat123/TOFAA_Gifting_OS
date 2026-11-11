from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException

from src.modules.gift_requests.schemas import (
    GiftRequestPage,
    GiftRequestRead,
    GiftRequestStatus,
)


TENANT_ID = "031c4871-26ff-4b7c-845d-7ce2efd9e745"
RECIPIENT_ID = "14d36f4c-ec6a-4211-9f32-79e39c5d54d1"
OCCASION_ID = "7e2493b0-2a36-44be-a4e9-9913e0894a28"
REQUEST_ID = "11770456-747a-458e-9bbf-f5b6a3bbb785"
USER_ID = "c1acaa-c6-9096-4731-b600-dffad4fed387"


@pytest.fixture
def gift_request() -> GiftRequestRead:
    return GiftRequestRead(
        id=REQUEST_ID,
        tenant_id=TENANT_ID,
        recipient_id=RECIPIENT_ID,
        created_by_user_id=USER_ID,
        title="Thank you gift",
        purpose="Thank a valued partner",
        requested_budget=Decimal("2500.00"),
        status=GiftRequestStatus.DRAFT,
        created_at=datetime(2026, 10, 30, tzinfo=timezone.utc),
        updated_at=datetime(2026, 10, 30, tzinfo=timezone.utc),
    )


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_gift_request_create_api_contract(e2e_client, monkeypatch, gift_request):
    from src.modules.gift_requests.service import gift_request_service

    def create(tenant, payload, actor):
        assert tenant == TENANT_ID
        assert payload.title == "Thank you gift"
        assert actor.id == USER_ID
        return gift_request

    monkeypatch.setattr(gift_request_service, "create", create)
    response = await e2e_client.post(
        f"/api/v1/tenants/{TENANT_ID}/gift-requests",
        json={
            "title": "Thank you gift",
            "recipientId": RECIPIENT_ID,
            "occasionId": OCCASION_ID,
            "purpose": "Thank a valued partner",
            "requestedBudget": "2500.00",
        },
    )

    assert response.status_code == 201
    assert response.json()["data"]["id"] == REQUEST_ID
    assert response.json()["data"]["requestedBudget"] == "2500.00"
    assert response.json()["message"] == "Gift request draft created."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_gift_request_list_keeps_success_response_contract(
    e2e_client, monkeypatch, gift_request
):
    from src.modules.gift_requests.service import gift_request_service

    monkeypatch.setattr(
        gift_request_service,
        "list_for_tenant",
        lambda tenant, actor, *, page, limit, status_filter, **_filters: GiftRequestPage(
            items=[gift_request],
            pagination={"page": page, "limit": limit, "total_records": 1},
        ),
    )
    response = await e2e_client.get(
        f"/api/v1/tenants/{TENANT_ID}/gift-requests?page=2&limit=5&status=DRAFT"
    )

    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["id"] == REQUEST_ID
    assert response.json()["data"]["pagination"] == {
        "page": 2,
        "limit": 5,
        "total_records": 1,
    }
    assert response.json()["message"] == "Gift requests retrieved successfully."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_gift_request_invalid_status_uses_error_envelope(
    e2e_client, monkeypatch
):
    from src.modules.gift_requests.service import gift_request_service

    def invalid_transition(*args, **kwargs):
        raise HTTPException(
            status_code=409,
            detail="Gift request is not in a valid state for this action.",
        )

    monkeypatch.setattr(gift_request_service, "staff_transition", invalid_transition)
    response = await e2e_client.post(
        f"/api/v1/admin/gift-requests/{REQUEST_ID}/start-review"
    )

    assert response.status_code == 409
    assert response.json() == {
        "data": {},
        "message": "Gift request is not in a valid state for this action.",
    }


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_gift_request_validation_uses_error_envelope(e2e_client):
    response = await e2e_client.post(
        f"/api/v1/tenants/{TENANT_ID}/gift-requests",
        json={"title": "", "recipientId": "invalid", "purpose": ""},
    )

    assert response.status_code == 422
    assert response.json()["message"] == "Request validation failed."
    assert response.json()["data"]["errors"]
