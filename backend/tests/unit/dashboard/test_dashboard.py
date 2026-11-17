from datetime import date

import pytest
from fastapi import HTTPException

from src.modules.dashboard.service import category_of, has_address, month_range


class Item:
    def __init__(self, source_type):
        self.source_type = source_type


def test_category_follows_relationship_and_company_occasions():
    assert category_of(Item("COMPANY"), None) == "COMPANY"
    for relationship in ("CLIENT", "PARTNER", "ADVISOR", "VENDOR"):
        assert category_of(Item("RECIPIENT"), relationship) == "EXTERNAL"
    assert category_of(Item("RECIPIENT"), "EMPLOYEE") == "INTERNAL"
    assert category_of(Item("RECIPIENT"), "FRIEND") == "OTHER" and category_of(Item("RECIPIENT"), None) == "OTHER"


def test_the_external_internal_type_decides_when_there_is_no_relationship():
    person = Item("RECIPIENT")
    assert category_of(person, {"relationship": None, "recipient_type": "EXTERNAL"}) == "EXTERNAL"
    assert category_of(person, {"relationship": None, "recipient_type": "INTERNAL"}) == "INTERNAL"
    assert category_of(person, {"recipient_type": "BUSINESS"}) == "EXTERNAL" and category_of(person, {"recipient_type": "INDIVIDUAL"}) == "INTERNAL"
    # an older recipient's relationship still wins
    assert category_of(person, {"relationship": "CLIENT", "recipient_type": "INTERNAL"}) == "EXTERNAL"
    assert category_of(person, {"relationship": "FRIEND", "recipient_type": "INTERNAL"}) == "INTERNAL"


def test_month_range_handles_leap_february_and_rejects_bad_input():
    assert month_range("2028-02") == (date(2028, 2, 1), date(2028, 2, 29))
    assert month_range("2026-11") == (date(2026, 11, 1), date(2026, 11, 30))
    for bad in ("2026-13", "26-11", "2026-1", "nov"):
        with pytest.raises(HTTPException):
            month_range(bad)


def test_has_address_needs_a_street_line():
    assert has_address({"addressLine1": "12 MG Road"}) and has_address({"address_line1": "12 MG Road"})
    assert not has_address(None) and not has_address({}) and not has_address({"city": "Pune"}) and not has_address({"addressLine1": "  "})
