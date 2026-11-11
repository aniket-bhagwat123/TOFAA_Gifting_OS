"""Planning status and priority for an occasion. Pure functions, derived on read (nothing stored)."""

from enum import Enum


class PlanningStatus(str, Enum):
    NOT_PLANNED = "NOT_PLANNED"
    BUDGET_ALLOCATED = "BUDGET_ALLOCATED"
    REQUEST_SUBMITTED = "REQUEST_SUBMITTED"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    IN_PROGRESS = "IN_PROGRESS"
    DELIVERED = "DELIVERED"


# Lower rank = further behind. An occasion with several requests shows its least advanced stage.
_RANK = {
    PlanningStatus.NOT_PLANNED: 0,
    PlanningStatus.BUDGET_ALLOCATED: 1,
    PlanningStatus.REQUEST_SUBMITTED: 2,
    PlanningStatus.AWAITING_APPROVAL: 3,
    PlanningStatus.IN_PROGRESS: 4,
    PlanningStatus.DELIVERED: 5,
}
_SUBMITTED = {"SUBMITTED", "IN_REVIEW", "NEEDS_INFO"}
_IGNORED = {"CANCELLED"}


def _request_stage(request_status: str, gift_statuses: list[str]) -> PlanningStatus | None:
    if request_status in _IGNORED:
        return None
    if request_status in _SUBMITTED:
        return PlanningStatus.REQUEST_SUBMITTED
    if request_status == "PROPOSAL_READY":
        return PlanningStatus.AWAITING_APPROVAL
    if request_status in ("CONFIRMED", "IN_PROGRESS", "DISPATCHED", "DELIVERED"):
        if gift_statuses and all(status == "DELIVERED" for status in gift_statuses):
            return PlanningStatus.DELIVERED
        return PlanningStatus.IN_PROGRESS
    return None  # DRAFT: nothing submitted yet


def planning_status(
    *, has_budget: bool, requests: list[tuple[str, list[str]]],
) -> PlanningStatus:
    """``requests`` is a list of (request status, statuses of that request's gifts)."""
    stages = [stage for status, gifts in requests if (stage := _request_stage(status, gifts))]
    if stages:
        return min(stages, key=_RANK.__getitem__)
    return PlanningStatus.BUDGET_ALLOCATED if has_budget else PlanningStatus.NOT_PLANNED


def lead_request_id(requests: list[tuple[str, str, list[str]]]) -> str | None:
    """The request to open from an occasion: the one holding the status back. ``requests`` is (id, status, gift statuses)."""
    staged = [(_RANK[stage], request_id) for request_id, status, gifts in requests if (stage := _request_stage(status, gifts))]
    return min(staged)[1] if staged else None


def needs_attention(status: PlanningStatus, days_away: int) -> bool:
    """The EA should act: the client must approve, or nothing is planned and the date is close."""
    if status == PlanningStatus.AWAITING_APPROVAL:
        return True
    return status in (PlanningStatus.NOT_PLANNED, PlanningStatus.BUDGET_ALLOCATED) and days_away <= 14


def priority_score(status: PlanningStatus, days_away: int) -> int:
    """Higher = show first. Behind-schedule occasions beat finished ones; closer dates beat distant ones."""
    behind = 5 - _RANK[status]  # 5 for not planned ... 0 for delivered
    urgency = max(0, 30 - max(days_away, 0))  # 0..30, grows as the date nears
    score = behind * 10 + urgency
    if needs_attention(status, days_away):
        score += 100
    if status == PlanningStatus.DELIVERED:
        score = 0
    return score
