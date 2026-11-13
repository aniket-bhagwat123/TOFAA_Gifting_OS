"""The activity feed says exactly what happened, using the facts saved with each change."""

from src.core.activity import describe, inr, pick_details

TENANT_ROUTE = "/api/v1/tenants/{tenant_id}"


def route(path):
    return TENANT_ROUTE + path


def test_gift_request_headline_names_the_occasion_and_person():
    facts = {"recipientName": "Rohan Mehta", "occasionName": "Birthday", "requestCode": "TG-0008", "budgetMin": "3000.00", "budgetMax": "5000.00", "deliveryDate": "2026-11-24"}
    category, title, text = describe("POST", route("/gift-requests/{request_id}/submit"), facts)
    assert (category, title) == ("requests", "Birthday gift request for Rohan Mehta submitted")
    assert text == "Request #TG-0008 · Budget ₹3,000 – ₹5,000 · Deliver by 24 Nov 2026"


def test_proposal_and_fulfilment_headlines():
    facts = {"recipientName": "Rohan Mehta", "occasionName": "Birthday"}
    assert describe("POST", route("/gift-requests/{request_id}/approve"), facts)[1] == "Gift proposal for Rohan Mehta approved"
    assert describe("POST", "/api/v1/admin/gift-requests/{request_id}/dispatch", facts)[1] == "Gift for Rohan Mehta dispatched"


def test_credit_topup_says_how_many_credits_and_how_the_budget_moved():
    facts = {"requestedCredits": 500, "creditsDelta": 500, "balanceAfter": 30000}
    _, title, text = describe("POST", "/api/v1/admin/credit-requests/{request_id}/approve", facts)
    assert title == "500 gifting credits added to your account"
    assert text == "Gifting budget increased from ₹29,500 to ₹30,000."


def test_budget_adjustment_shows_before_and_after_in_indian_grouping():
    facts = {"creditsDelta": 10000, "balanceAfter": 30000, "reason": "Annual renewal"}
    _, title, text = describe("POST", "/api/v1/admin/tenants/{tenant_id}/credits/adjustments", facts)
    assert (title, text) == ("Gifting budget increased from ₹20,000 to ₹30,000", "Annual renewal")
    assert describe("POST", "/api/v1/admin/tenants/{tenant_id}/credits/adjustments", {"creditsDelta": -5000, "balanceAfter": 100000})[1] == "Gifting budget decreased from ₹1,05,000 to ₹1,00,000"


def test_group_budget_on_an_occasion():
    facts = {"groupName": "Key Clients", "occasionName": "Diwali", "budgetCredits": 250000, "budgetMode": "PER_RECIPIENT"}
    assert describe("POST", route("/gift-spend/occasions/{occasion_id}/groups/import"), facts)[1] == "Key Clients added to Diwali with a ₹2,50,000 budget"


def test_without_facts_the_general_sentence_is_used():
    assert describe("POST", route("/gift-requests/{request_id}/submit"), {})[1:] == ("Gift request submitted", "A gift request was submitted to TOFAA.")
    assert describe("POST", route("/gift-requests/{request_id}/submit"), None)[1] == "Gift request submitted"
    assert describe("PATCH", route("/something-new/{id}"), None)[1] == "Something new updated"


def test_only_whitelisted_facts_are_kept_and_snake_case_is_understood():
    kept = pick_details({"data": {"recipient_name": "A", "recipientMobile": "+911234567890", "email": "x@y.z", "budget_credits": 5, "nested": {"a": 1}, "note": "n"}})
    assert kept == {"recipientName": "A", "budgetCredits": 5}
    assert pick_details({"data": [1, 2]}) == {} and pick_details("x") == {}


def test_rupee_formatting():
    assert [inr(v) for v in (500, "5000.00", 123456, 10000000)] == ["₹500", "₹5,000", "₹1,23,456", "₹1,00,00,000"]
