import pytest
from pydantic import ValidationError

from src.modules.occasions.schemas import OccasionCreate, OccasionUpdate


def test_occasion_date_is_required_and_parsed():
    occasion = OccasionCreate(occasionName="Diwali", occasionDate="2026-11-08")
    assert str(occasion.occasion_date) == "2026-11-08"


def test_occasion_update_requires_change():
    with pytest.raises(ValidationError):
        OccasionUpdate()


def test_occasion_create_rejects_missing_date():
    with pytest.raises(ValidationError):
        OccasionCreate(occasionName="Diwali")
