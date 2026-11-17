import pytest
from pydantic import ValidationError

from src.modules.gift_spend.schemas import BulkGroupDelete
from src.modules.imports.schemas import ImportBatchFinish
from src.modules.recipients.schemas import BulkRecipientIds, BulkRecipientStatus

ID = "6f1c1a52-0000-4000-8000-000000000001"


def test_bulk_actions_take_between_one_and_a_thousand_people():
    assert len(BulkRecipientIds(recipientIds=[ID]).recipient_ids) == 1
    with pytest.raises(ValidationError):
        BulkRecipientIds(recipientIds=[])
    with pytest.raises(ValidationError):
        BulkRecipientIds(recipientIds=[ID] * 1001)
    with pytest.raises(ValidationError):
        BulkRecipientStatus(recipientIds=[ID], status="DELETED")


def test_bulk_group_delete_and_import_result_are_bounded():
    with pytest.raises(ValidationError):
        BulkGroupDelete(groupIds=[])
    with pytest.raises(ValidationError):
        ImportBatchFinish(createdCount=-1)
    assert ImportBatchFinish(createdCount=3).groups_created == []
