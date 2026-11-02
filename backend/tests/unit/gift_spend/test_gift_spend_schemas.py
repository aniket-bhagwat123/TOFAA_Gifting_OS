import pytest
from pydantic import ValidationError

from src.modules.gift_spend.schemas import (
    GiftSpendSettingsUpdate,
    OccasionGroupImport,
    RecipientGroupCreate,
    SpendBudgetMode,
)

RECIPIENT_A = "14d36f4c-ec6a-4211-9f32-79e39c5d54d1"
RECIPIENT_B = "11770456-747a-458e-9bbf-f5b6a3bbb785"
GROUP_ID = "7e2493b0-2a36-44be-a4e9-9913e0894a28"


def test_recipient_group_accepts_unique_members():
    group = RecipientGroupCreate(name="Executives", recipientIds=[RECIPIENT_A, RECIPIENT_B])
    assert group.recipient_ids[0].hex


def test_recipient_group_rejects_empty_or_duplicate_members():
    with pytest.raises(ValidationError):
        RecipientGroupCreate(name="Empty", recipientIds=[])
    with pytest.raises(ValidationError):
        RecipientGroupCreate(name="Duplicate", recipientIds=[RECIPIENT_A, RECIPIENT_A])


@pytest.mark.parametrize("mode", list(SpendBudgetMode))
def test_occasion_group_import_supports_both_budget_modes(mode):
    allocation = OccasionGroupImport(
        recipientGroupId=GROUP_ID,
        budgetMode=mode,
        budgetCredits=125,
    )
    assert allocation.budget_mode == mode


@pytest.mark.parametrize("credits", [0, -1, 1.5, 1_000_000_001])
def test_budget_rejects_non_positive_or_invalid_credit_amount(credits):
    with pytest.raises(ValidationError):
        OccasionGroupImport(
            recipientGroupId=GROUP_ID,
            budgetMode="PER_RECIPIENT",
            budgetCredits=credits,
        )


def test_reminder_settings_defaults_and_validates_lead_days():
    assert GiftSpendSettingsUpdate().reminder_days == [30, 7, 1]
    assert GiftSpendSettingsUpdate(reminderDays=[60, 14, 2]).reminder_days == [60, 14, 2]
    for days in ([366], [-1], [7, 7], []):
        with pytest.raises(ValidationError):
            GiftSpendSettingsUpdate(reminderDays=days)
