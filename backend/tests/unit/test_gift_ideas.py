from datetime import date

import pytest
from pydantic import ValidationError

from src.modules.gift_ideas.schemas import GiftIdeaCreate, GiftIdeaUpdate, date_text


def test_an_idea_needs_an_occasion_and_a_gift_idea():
    idea = GiftIdeaCreate(occasion="  Doctors' Day ", gift_idea="Premium desk gifts", gift_to=[" Doctors ", "", "Hospital heads"])
    assert idea.occasion == "Doctors' Day" and idea.gift_to == ["Doctors", "Hospital heads"] and idea.is_active is True
    with pytest.raises(ValidationError):
        GiftIdeaCreate(occasion="", gift_idea="x")
    with pytest.raises(ValidationError):
        GiftIdeaCreate(occasion="x", gift_idea="")


def test_dates_must_be_in_order_and_a_range_needs_a_start():
    with pytest.raises(ValidationError):
        GiftIdeaCreate(occasion="x", gift_idea="y", start_date=date(2027, 2, 2), end_date=date(2027, 2, 1))
    with pytest.raises(ValidationError):
        GiftIdeaCreate(occasion="x", gift_idea="y", end_date=date(2027, 2, 1))


def test_the_date_is_written_the_way_people_read_it():
    assert date_text(date(2027, 7, 1), None) == "1 Jul"
    assert date_text(date(2027, 9, 13), date(2027, 9, 18)) == "13–18 Sep"
    assert date_text(date(2027, 9, 30), date(2027, 10, 8)) == "30 Sep – 8 Oct"
    assert date_text(None, None) == "No fixed date"


def test_an_update_needs_a_field_and_cannot_blank_the_required_ones():
    with pytest.raises(ValidationError):
        GiftIdeaUpdate()
    with pytest.raises(ValidationError):
        GiftIdeaUpdate(occasion=None)
    assert GiftIdeaUpdate(gift_to=[" A "]).gift_to == ["A"]
