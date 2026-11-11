from src.modules.occasions.planning import PlanningStatus as S
from src.modules.occasions.planning import needs_attention, planning_status, priority_score


def test_not_planned_and_budget_allocated():
    assert planning_status(has_budget=False, requests=[]) == S.NOT_PLANNED
    assert planning_status(has_budget=True, requests=[]) == S.BUDGET_ALLOCATED
    assert planning_status(has_budget=True, requests=[("DRAFT", [])]) == S.BUDGET_ALLOCATED


def test_request_stages():
    assert planning_status(has_budget=True, requests=[("IN_REVIEW", [])]) == S.REQUEST_SUBMITTED
    assert planning_status(has_budget=True, requests=[("PROPOSAL_READY", [])]) == S.AWAITING_APPROVAL
    assert planning_status(has_budget=True, requests=[("CONFIRMED", ["PLANNED"])]) == S.IN_PROGRESS
    assert planning_status(has_budget=True, requests=[("CONFIRMED", ["DELIVERED", "IN_TRANSIT"])]) == S.IN_PROGRESS
    assert planning_status(has_budget=True, requests=[("CONFIRMED", ["DELIVERED", "DELIVERED"])]) == S.DELIVERED


def test_cancelled_ignored_and_least_advanced_wins():
    assert planning_status(has_budget=False, requests=[("CANCELLED", [])]) == S.NOT_PLANNED
    mixed = [("CONFIRMED", ["DELIVERED"]), ("PROPOSAL_READY", [])]
    assert planning_status(has_budget=True, requests=mixed) == S.AWAITING_APPROVAL


def test_attention_and_priority_order():
    assert needs_attention(S.AWAITING_APPROVAL, 40)
    assert needs_attention(S.NOT_PLANNED, 5)
    assert not needs_attention(S.NOT_PLANNED, 30)
    assert not needs_attention(S.DELIVERED, 1)
    assert priority_score(S.AWAITING_APPROVAL, 10) > priority_score(S.IN_PROGRESS, 2)
    assert priority_score(S.NOT_PLANNED, 3) > priority_score(S.NOT_PLANNED, 18)
    assert priority_score(S.DELIVERED, 1) == 0


def test_lead_request_is_the_one_holding_status_back():
    from src.modules.occasions.planning import lead_request_id
    assert lead_request_id([]) is None
    assert lead_request_id([("a", "DRAFT", [])]) is None
    mixed = [("a", "CONFIRMED", ["DELIVERED"]), ("b", "PROPOSAL_READY", [])]
    assert lead_request_id(mixed) == "b"
