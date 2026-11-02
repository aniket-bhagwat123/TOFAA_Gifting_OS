import pytest
from pydantic import ValidationError

from src.modules.events.schemas import EventCreate, EventUpdate


def test_event_create_accepts_camel_case_payload():
    event = EventCreate(eventName="Birthday", eventDate="2026-10-30")
    assert event.event_name == "Birthday"
    assert event.is_active is True


def test_event_update_requires_at_least_one_non_null_required_field():
    with pytest.raises(ValidationError):
        EventUpdate()
    with pytest.raises(ValidationError):
        EventUpdate(eventName=None)


def test_event_create_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        EventCreate(eventName="Birthday", eventDate="2026-10-30", occasionId="unused")
