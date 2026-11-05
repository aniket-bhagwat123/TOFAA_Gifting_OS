from datetime import date, timedelta

import pytest
from pydantic import ValidationError

from src.modules.recipients.schemas import RecipientAddress, RecipientCreate, RecipientUpdate


def valid_recipient(**updates):
    data = {
        "name": "Alex Recipient",
        "mobileNumber": "+919876543210",
        "address": {
            "addressLine1": "12 Example Road",
            "city": "Mumbai",
            "postalCode": "400001",
        },
        "dateOfBirth": "1990-01-01",
        "budget": "2500.00",
    }
    data.update(updates)
    return data


def test_recipient_create_parses_decimal_and_nested_address():
    recipient = RecipientCreate(**valid_recipient())
    assert str(recipient.budget) == "2500.00"
    assert recipient.address.country == "IN"


@pytest.mark.parametrize("postal_code", ["12345", "ABCDEF", "1234567"])
def test_address_rejects_invalid_postal_code(postal_code):
    with pytest.raises(ValidationError):
        RecipientAddress(addressLine1="123 Road", city="Pune", postalCode=postal_code)


def test_recipient_rejects_future_birth_date():
    with pytest.raises(ValidationError):
        RecipientCreate(**valid_recipient(dateOfBirth=str(date.today() + timedelta(days=1))))


def test_recipient_patch_must_include_a_field():
    with pytest.raises(ValidationError):
        RecipientUpdate()


def test_a_recipient_can_be_created_without_a_budget():
    recipient = RecipientCreate.model_validate({
        "name": "Rohan Mehta",
        "mobileNumber": "+919876543210",
        "address": {"addressLine1": "1 Road", "city": "Pune", "postalCode": "411001"},
        "dateOfBirth": "1990-01-01",
    })
    assert recipient.budget is None
