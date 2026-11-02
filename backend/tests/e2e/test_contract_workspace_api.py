from datetime import date, datetime, timezone
from decimal import Decimal
from io import BytesIO
from zipfile import ZipFile

import pytest

from src.modules.contract_workspace.schemas import (
    ContractGiftStatus,
    ContractParameters,
    ContractSpend,
    ContractTierBudget,
    ContractWorkspaceRead,
    GiftBulkUpdateResult,
    GiftLinePage,
    GiftLineRead,
)

TENANT_ID = "031c4871-26ff-4b7c-845d-7ce2efd9e745"
GIFT_ID = "5892e56d-6139-44c0-9672-f0bfc20f19b0"
RECIPIENT_ID = "14d36f4c-ec6a-4211-9f32-79e39c5d54d1"
OCCASION_ID = "bd06003e-a116-40bf-806e-5e6de101219a"


@pytest.fixture
def gift_line() -> GiftLineRead:
    return GiftLineRead(
        id=GIFT_ID,
        tenant_id=TENANT_ID,
        contract_id="4f3b08ed-414d-4f73-9c43-e920a3c2de11",
        recipient_id=RECIPIENT_ID,
        recipient_name="Alex Recipient",
        recipient_tier="A",
        occasion_id=OCCASION_ID,
        occasion_name="Birthday",
        gift_name="Personalised hamper",
        customisation="Initials engraved",
        unit_price=Decimal("5000.00"),
        quantity=1,
        delivery_date=date(2026, 12, 12),
        status=ContractGiftStatus.PLANNED,
        created_at=datetime(2026, 10, 30, tzinfo=timezone.utc),
        updated_at=datetime(2026, 10, 30, tzinfo=timezone.utc),
    )


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_workspace_read_contract(e2e_client, monkeypatch, gift_line):
    from src.modules.contract_workspace.service import contract_workspace_service

    monkeypatch.setattr(
        contract_workspace_service,
        "workspace",
        lambda tenant, actor, *, page, limit: ContractWorkspaceRead(
            tenant_id=tenant,
            contract={
                "id": gift_line.contract_id,
                "contract_number": "CT-1001",
                "status": "ACTIVE",
                "sla_tier": "STANDARD",
                "start_date": date(2026, 1, 1),
                "end_date": date(2026, 12, 31),
                "currency": "INR",
                "contract_value": Decimal("2500000.00"),
            },
            tier_budgets=[{"tier_key": "A", "budget_amount": Decimal("500000.00")}],
            gift_plan={
                "items": [gift_line],
                "pagination": {"page": page, "limit": limit, "total_records": 1},
            },
            spend={
                "committed": Decimal("5000.00"),
                "delivered": Decimal("0.00"),
                "contract_value": Decimal("2500000.00"),
                "used_percent": Decimal("0.2"),
                "budget_alert": None,
            },
        ),
    )

    response = await e2e_client.get(f"/api/v1/tenants/{TENANT_ID}/contract-workspace")

    assert response.status_code == 200
    assert response.json()["data"]["contract"]["contractNumber"] == "CT-1001"
    assert response.json()["data"]["spend"]["usedPercent"] == "0.2"
    assert response.json()["message"] == "Contract workspace retrieved successfully."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_gift_create_api_contract(e2e_client, monkeypatch, gift_line):
    from src.modules.contract_workspace.service import contract_workspace_service

    def create(tenant, payload, actor):
        assert tenant == TENANT_ID
        assert payload.gift_name == "Personalised hamper"
        return gift_line

    monkeypatch.setattr(contract_workspace_service, "create_gift", create)
    response = await e2e_client.post(
        f"/api/v1/tenants/{TENANT_ID}/gifts",
        json={
            "recipientId": RECIPIENT_ID,
            "occasionId": OCCASION_ID,
            "giftName": "Personalised hamper",
            "customisation": "Initials engraved",
            "unitPrice": 5000,
            "quantity": 1,
            "deliveryDate": "2026-12-12",
            "vendorName": "Internal vendor",
            "status": "PLANNED",
        },
    )

    assert response.status_code == 201
    assert response.json()["data"]["lineTotal"] == "5000.00"
    assert response.json()["message"] == "Gift added to the contract plan."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_gift_list_api_contract(e2e_client, monkeypatch, gift_line):
    from src.modules.contract_workspace.service import contract_workspace_service

    monkeypatch.setattr(
        contract_workspace_service,
        "list_gifts",
        lambda tenant, actor, *, page, limit: GiftLinePage(
            items=[gift_line],
            pagination={"page": page, "limit": limit, "total_records": 1},
        ),
    )
    response = await e2e_client.get(f"/api/v1/tenants/{TENANT_ID}/gifts?page=1&limit=10")

    assert response.status_code == 200
    assert response.json()["data"]["items"][0]["occasionName"] == "Birthday"
    assert response.json()["message"] == "Contract gifts retrieved successfully."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_gift_patch_api_contract(e2e_client, monkeypatch, gift_line):
    from src.modules.contract_workspace.service import contract_workspace_service

    monkeypatch.setattr(contract_workspace_service, "update_gift", lambda gift, payload, actor: gift_line)
    response = await e2e_client.patch(
        f"/api/v1/gifts/{GIFT_ID}",
        json={"unitPrice": 5200, "reason": "Approved packaging upgrade"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["id"] == GIFT_ID
    assert response.json()["message"] == "Contract gift updated."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_gift_cancel_api_contract(e2e_client, monkeypatch, gift_line):
    from src.modules.contract_workspace.service import contract_workspace_service

    monkeypatch.setattr(contract_workspace_service, "cancel_gift", lambda gift, payload, actor: gift_line)
    response = await e2e_client.post(
        f"/api/v1/gifts/{GIFT_ID}/cancel", json={"reason": "Client changed delivery plan"}
    )

    assert response.status_code == 200
    assert response.json()["data"]["id"] == GIFT_ID
    assert response.json()["message"] == "Contract gift cancelled."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_gift_bulk_update_api_contract(e2e_client, monkeypatch, gift_line):
    from src.modules.contract_workspace.service import contract_workspace_service

    monkeypatch.setattr(
        contract_workspace_service,
        "bulk_update",
        lambda payload, actor: GiftBulkUpdateResult(updated_count=1, items=[gift_line]),
    )
    response = await e2e_client.post(
        "/api/v1/gifts/bulk-update",
        json={"giftIds": [GIFT_ID], "status": "IN_PREPARATION", "vendorName": "Internal vendor"},
    )

    assert response.status_code == 200
    assert response.json()["data"]["updatedCount"] == 1
    assert response.json()["message"] == "Contract gifts updated."


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_workspace_export_is_excel(e2e_client, monkeypatch, gift_line):
    from src.modules.contract_workspace.service import contract_workspace_service

    monkeypatch.setattr(
        contract_workspace_service,
        "export_rows",
        lambda tenant, actor: ({"contract_number": "CT-1001"}, [gift_line]),
    )
    response = await e2e_client.get(f"/api/v1/tenants/{TENANT_ID}/contract-workspace/export")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    with ZipFile(BytesIO(response.content)) as workbook:
        assert "xl/worksheets/sheet1.xml" in workbook.namelist()
        assert "mobile" not in workbook.read("xl/worksheets/sheet1.xml").decode().lower()


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_contract_gift_cancel_requires_reason(e2e_client):
    response = await e2e_client.post(f"/api/v1/gifts/{GIFT_ID}/cancel", json={"reason": "   "})

    assert response.status_code == 422
    assert response.json()["message"] == "Request validation failed."
    assert response.json()["data"]["errors"]


@pytest.mark.e2e
@pytest.mark.asyncio
async def test_client_cannot_add_contract_gift(e2e_client, monkeypatch):
    from src.main import app
    from src.modules.auth.dependencies import get_current_active_user
    from src.modules.auth.schemas import UserProfileResponse

    client_actor = UserProfileResponse(
        id="6c234558-d478-4d17-b364-91b297981d3c",
        email="client@example.com",
        role="CLIENT",
        tenant_id=TENANT_ID,
        is_active=True,
    )
    app.dependency_overrides[get_current_active_user] = lambda: client_actor
    response = await e2e_client.post(
        f"/api/v1/tenants/{TENANT_ID}/gifts",
        json={
            "recipientId": RECIPIENT_ID,
            "occasionId": OCCASION_ID,
            "giftName": "Personalised hamper",
            "unitPrice": 5000,
        },
    )

    assert response.status_code == 403
    assert response.json()["data"] == {}
    assert "manage gifts" in response.json()["message"]
