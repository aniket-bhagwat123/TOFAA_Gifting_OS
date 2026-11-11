from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from src.modules.gift_requests.service import GiftRequestService

complete = {
    "recipient_id": "r", "occasion_id": "o", "delivery_date": (date.today() + timedelta(days=5)).isoformat(),
    "budget_mode": "SPECIFIC", "budget_max": "500000", "initiated_via": "SELF", "relationship": "Client",
}


def test_complete_request_can_be_submitted():
    GiftRequestService._require_complete(complete)
    GiftRequestService._require_complete({**complete, "budget_mode": "TOFAA_RECOMMEND", "budget_max": None})


@pytest.mark.parametrize("field", ["occasion_id", "delivery_date", "budget_max", "initiated_via", "relationship"])
def test_submit_lists_what_is_missing(field):
    row = {**complete, field: None}
    with pytest.raises(HTTPException) as caught:
        GiftRequestService._require_complete(row)
    assert caught.value.status_code == 422
    assert caught.value.detail.startswith("Please add ")


def test_submit_rejects_a_past_delivery_date():
    with pytest.raises(HTTPException) as caught:
        GiftRequestService._require_complete({**complete, "delivery_date": (date.today() - timedelta(days=1)).isoformat()})
    assert "past" in caught.value.detail


def test_normalise_fills_title_purpose_and_budget():
    values = {"recipient_id": "r", "budget_min": "300000", "budget_max": "500000", "title": None, "purpose": None, "interests": None, "budget_mode": "SPECIFIC"}
    GiftRequestService._normalise_values(values, recipient_name="Sachin")
    assert values["title"] == "Gift for Sachin"
    assert values["requested_budget"] == "500000"
    assert "interests" not in values and values["purpose"]


def test_recommend_mode_clears_budget():
    values = {"budget_mode": "TOFAA_RECOMMEND", "budget_min": "1", "budget_max": "2", "requested_budget": "2"}
    GiftRequestService._normalise_values(values, recipient_name="Sachin")
    assert values["budget_min"] is None and values["requested_budget"] is None


def test_past_delivery_date_is_rejected_on_save():
    with pytest.raises(HTTPException):
        GiftRequestService._check_delivery_date((date.today() - timedelta(days=1)).isoformat())
    GiftRequestService._check_delivery_date(None)


def test_one_credit_is_one_rupee():
    from src.modules.gift_requests.service import credits_for

    assert credits_for(500000) == 500000
    assert credits_for("2500.00") == 2500
    assert credits_for(99.5) == 100  # rounds up to a whole credit
    assert credits_for(0.2) == 1


def test_images_are_checked_before_they_are_stored():
    from src.core.images import store_image

    png = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    with pytest.raises(HTTPException) as caught:
        store_image(None, "x", png, "image/gif")
    assert caught.value.status_code == 415
    with pytest.raises(HTTPException) as caught:
        store_image(None, "x", b"not an image", "image/png")  # claims PNG, is not
    assert caught.value.status_code == 422
    with pytest.raises(HTTPException) as caught:
        store_image(None, "x", png + b"0" * (2 * 1024 * 1024), "image/png")
    assert caught.value.status_code == 413
    with pytest.raises(HTTPException) as caught:
        store_image(None, "x", b"", "image/png")
    assert caught.value.status_code == 422
