from datetime import date, datetime, timezone
from decimal import Decimal

import pytest

from src.modules.credits.schemas import CreditRequestRead
from src.modules.events.schemas import EventRead
from src.modules.occasions.schemas import OccasionRead
from src.modules.recipients.schemas import RecipientRead
from src.modules.tenants.models import TenantStatus, TenantType
from src.modules.tenants.schemas import TenantRead
from src.modules.users.schemas import UserInviteRead


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_tenant_create_api_contract(e2e_client, monkeypatch):
    from src.modules.tenants.service import tenant_service

    monkeypatch.setattr(
        tenant_service,
        "create",
        lambda payload, actor: TenantRead(
            id="031c4871-26ff-4b7c-845d-7ce2efd9e745",
            tenant_type=TenantType.ORGANIZATION,
            name=payload.name,
            status=TenantStatus.PENDING_SETUP,
            created_at="2026-10-30T00:00:00Z",
            updated_at="2026-10-30T00:00:00Z",
        ),
    )
    response = await e2e_client.post(
        "/api/v1/tenants",
        json={"tenantType": "ORGANIZATION", "name": "Apex Global"},
    )
    assert response.status_code == 201
    assert response.json()["data"]["name"] == "Apex Global"
    assert response.json()["message"] == "Tenant created successfully."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_user_invitation_api_contract(e2e_client, monkeypatch, tenant_id):
    from src.modules.users.service import user_service

    monkeypatch.setattr(
        user_service,
        "create_invitation",
        lambda tenant, payload, actor: UserInviteRead(
            invitation_id="inv-1",
            tenant_id=tenant,
            email=payload.email,
            status="SENT",
            expires_at="2026-10-30T01:00:00Z",
        ),
    )
    response = await e2e_client.post(
        f"/api/v1/tenants/{tenant_id}/users",
        json={"email": "client@example.com", "fullName": "Client User"},
    )
    assert response.status_code == 202
    assert response.json()["data"]["email"] == "client@example.com"
    assert "message" in response.json()


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_recipient_create_api_contract(e2e_client, monkeypatch, tenant_id):
    from src.modules.recipients.service import recipient_service

    monkeypatch.setattr(
        recipient_service,
        "create_recipient",
        lambda tenant, payload, actor: RecipientRead(
            id="recipient-1",
            tenant_id=tenant,
            name=payload.name,
            mobile_number=payload.mobile_number,
            address=payload.address,
            date_of_birth=payload.date_of_birth,
            budget=payload.budget,
        ),
    )
    response = await e2e_client.post(
        f"/api/v1/tenants/{tenant_id}/recipients",
        json={
            "name": "Alex Recipient",
            "mobileNumber": "+919876543210",
            "address": {"addressLine1": "12 Example Road", "city": "Mumbai", "postalCode": "400001"},
            "dateOfBirth": "1990-01-01",
            "budget": "2500.00",
        },
    )
    assert response.status_code == 201
    assert response.json()["data"]["name"] == "Alex Recipient"
    assert response.json()["message"] == "Recipient added successfully."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_event_create_requires_recipient_query_parameter(e2e_client, tenant_id):
    response = await e2e_client.post(
        f"/api/v1/tenants/{tenant_id}/events",
        json={"eventName": "Birthday", "eventDate": "2026-10-30"},
    )
    assert response.status_code == 422


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_event_create_api_contract(e2e_client, monkeypatch, tenant_id, recipient_id):
    from src.modules.events.service import event_service

    monkeypatch.setattr(
        event_service,
        "create_event",
        lambda tenant, payload, actor, *, recipient_id: EventRead(
            id="event-1",
            tenant_id=tenant,
            recipient_id=recipient_id,
            event_name=payload.event_name,
            event_date=payload.event_date,
            is_active=payload.is_active,
            created_at="2026-10-30T00:00:00Z",
            updated_at="2026-10-30T00:00:00Z",
        ),
    )
    response = await e2e_client.post(
        f"/api/v1/tenants/{tenant_id}/events?recipient_id={recipient_id}",
        json={"eventName": "Birthday", "eventDate": "2026-10-30"},
    )
    assert response.status_code == 201
    assert response.json()["data"]["recipientId"] == recipient_id
    assert response.json()["message"] == "Event created successfully."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_occasion_create_api_contract(e2e_client, monkeypatch):
    from src.modules.occasions.service import occasion_service

    monkeypatch.setattr(
        occasion_service,
        "create_global_occasion",
        lambda payload, actor: OccasionRead(
            id="occasion-1",
            occasion_name=payload.occasion_name,
            occasion_date=payload.occasion_date,
            is_active=payload.is_active,
            created_at="2026-10-30T00:00:00Z",
            updated_at="2026-10-30T00:00:00Z",
        ),
    )
    response = await e2e_client.post(
        "/api/v1/occasions",
        json={"occasionName": "Diwali", "occasionDate": "2026-11-08"},
    )
    assert response.status_code == 201
    assert response.json()["data"]["occasionDate"] == "2026-11-08"
    assert response.json()["message"] == "Global occasion created successfully."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_credit_request_api_contract(e2e_client, monkeypatch, tenant_id):
    from src.modules.credits.service import credits_service

    monkeypatch.setattr(
        credits_service,
        "create_request",
        lambda tenant, payload, actor, key: CreditRequestRead(
            id="credit-request-1",
            tenant_id=tenant,
            requested_credits=payload.requested_credits,
            currency="INR",
            unit_price_minor=100,
            amount_due_minor=payload.requested_credits * 100,
            status="pending_review",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        ),
    )
    response = await e2e_client.post(
        f"/api/v1/tenants/{tenant_id}/credit-requests",
        headers={"Idempotency-Key": "test-request-001"},
        json={"requestedCredits": 50000, "note": "Monthly top-up"},
    )
    assert response.status_code == 201
    assert response.json()["data"]["requestedCredits"] == 50000
    assert response.json()["message"] == "Credit request submitted for review."
