import pytest
from pydantic import ValidationError

from src.modules.contract_workspace.schemas import GiftLineCreate

RECIPIENT_ID = "14d36f4c-ec6a-4211-9f32-79e39c5d54d1"
EVENT_ID = "23b151f6-a6f9-4e0d-9708-07897338da92"
OCCASION_ID = "7e2493b0-2a36-44be-a4e9-9913e0894a28"


def payload(**source):
    return {
        "recipientId": RECIPIENT_ID,
        "giftName": "Personalised hamper",
        "unitPrice": 100,
        **source,
    }


def test_gift_line_accepts_either_event_or_occasion():
    assert GiftLineCreate(**payload(eventId=EVENT_ID)).event_id
    assert GiftLineCreate(**payload(occasionId=OCCASION_ID)).occasion_id


@pytest.mark.parametrize("source", [{}, {"eventId": EVENT_ID, "occasionId": OCCASION_ID}])
def test_gift_line_rejects_missing_or_ambiguous_source(source):
    with pytest.raises(ValidationError):
        GiftLineCreate(**payload(**source))
