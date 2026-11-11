from decimal import Decimal

import pytest
from pydantic import ValidationError

from src.modules.gift_requests.schemas import (
    GiftProposalUpdate,
    GiftRequestCreate,
    GiftRequestUpdate,
)

RECIPIENT_ID = "b96a1e04-a2ee-4e93-93e6-60e7ab0d6bcb"
OCCASION_ID = "7e2493b0-2a36-44be-a4e9-9913e0894a28"
EVENT_ID = "23b151f6-a6f9-4e0d-9708-07897338da92"


def test_gift_request_accepts_valid_camel_case_payload():
    request = GiftRequestCreate(
        title="  Diwali gift  ",
        recipientId=RECIPIENT_ID,
        purpose="  Thank the customer  ",
        occasionId=OCCASION_ID,
        requestedBudget="2500.00",
        requestedCredits=250,
    )

    assert request.title == "Diwali gift"
    assert request.purpose == "Thank the customer"
    assert request.requested_budget == Decimal("2500.00")
    assert request.requested_credits == 250


def test_gift_request_requires_exactly_one_spend_source():
    base = {"title": "Gift", "recipientId": RECIPIENT_ID, "purpose": "Thanks"}
    with pytest.raises(ValidationError):
        GiftRequestCreate(**base)
    with pytest.raises(ValidationError):
        GiftRequestCreate(**base, eventId=EVENT_ID, occasionId=OCCASION_ID)
    assert GiftRequestCreate(**base, eventId=EVENT_ID).event_id.hex


@pytest.mark.parametrize(
    "payload",
    [
        {"title": " ", "recipient_id": RECIPIENT_ID, "purpose": "Thanks"},
        {"title": "Gift", "recipient_id": RECIPIENT_ID, "purpose": " "},
        {"title": "Gift", "recipient_id": "not-a-uuid", "purpose": "Thanks"},
        {"title": "Gift", "recipient_id": RECIPIENT_ID, "purpose": "Thanks", "requested_budget": -1},
        {"title": "Gift", "recipient_id": RECIPIENT_ID, "purpose": "Thanks", "unknown": True},
    ],
)
def test_gift_request_rejects_invalid_fields(payload):
    with pytest.raises(ValidationError):
        GiftRequestCreate(**payload)


def test_gift_request_patch_requires_fields_and_rejects_null_required_fields():
    with pytest.raises(ValidationError):
        GiftRequestUpdate()
    with pytest.raises(ValidationError):
        GiftRequestUpdate(recipient_id=None)
    with pytest.raises(ValidationError):
        GiftRequestUpdate(purpose="   ")


def test_gift_proposal_requires_named_nonnegative_options():
    with pytest.raises(ValidationError):
        GiftProposalUpdate(options=[])
    with pytest.raises(ValidationError):
        GiftProposalUpdate(options=[{"name": " ", "price": 25}])
    with pytest.raises(ValidationError):
        GiftProposalUpdate(options=[{"name": "Gift", "price": -1}])

    proposal = GiftProposalUpdate(options=[{"name": "  Gift  ", "price": "25.00"}])
    assert proposal.options[0].name == "Gift"
    assert proposal.options[0].price == Decimal("25.00")


def test_draft_only_needs_recipient_and_a_source():
    draft = GiftRequestCreate(recipientId=RECIPIENT_ID, occasionId=OCCASION_ID)
    assert draft.title is None and draft.purpose is None and draft.budget_mode == "SPECIFIC"


def test_form_fields_are_validated():
    base = {"recipientId": RECIPIENT_ID, "occasionId": OCCASION_ID}
    with pytest.raises(ValidationError):  # min above max
        GiftRequestCreate(**base, budgetMin="500000", budgetMax="300000")
    with pytest.raises(ValidationError):  # unknown initiator
        GiftRequestCreate(**base, initiatedVia="CARRIER_PIGEON")
    with pytest.raises(ValidationError):  # message limit is 300
        GiftRequestCreate(**base, message="x" * 301)
    with pytest.raises(ValidationError):  # instructions limit is 500
        GiftRequestCreate(**base, specialInstructions="x" * 501)
    with pytest.raises(ValidationError):
        GiftRequestCreate(**base, giftStyle="CHEAP")

    request = GiftRequestCreate(
        **base, budgetMin="300000", budgetMax="500000", initiatedVia="DIRECTOR_WHATSAPP",
        interests=["Sports", " sports ", "Books", ""], giftStyle="PREMIUM", giftPurpose="BUSINESS_RELATIONSHIP",
    )
    assert request.interests == ["Sports", "Books"]
    assert request.budget_max == Decimal("500000")
