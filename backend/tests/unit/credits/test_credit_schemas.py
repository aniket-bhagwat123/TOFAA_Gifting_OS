import pytest
from pydantic import ValidationError

from src.modules.credits.schemas import CreditAdjustment, CreditRequestCreate, PaymentSubmission


def test_credit_request_accepts_positive_amount():
    assert CreditRequestCreate(requestedCredits=50000).requested_credits == 50000


@pytest.mark.parametrize("amount", [0, -1, 1_000_000_001])
def test_credit_request_rejects_invalid_amount(amount):
    with pytest.raises(ValidationError):
        CreditRequestCreate(requestedCredits=amount)


def test_adjustment_requires_valid_direction_and_reason():
    with pytest.raises(ValidationError):
        CreditAdjustment(direction="add", credits=10, reason="test")
    with pytest.raises(ValidationError):
        CreditAdjustment(direction="credit", credits=10, reason="")


def test_payment_submission_requires_reference_and_positive_payment():
    with pytest.raises(ValidationError):
        PaymentSubmission(paymentReference="", paidAmountMinor=100)
    with pytest.raises(ValidationError):
        PaymentSubmission(paymentReference="PAY-123", paidAmountMinor=0)
