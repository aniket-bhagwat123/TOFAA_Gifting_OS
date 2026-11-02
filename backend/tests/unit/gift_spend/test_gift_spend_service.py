from types import SimpleNamespace

from src.modules.auth.schemas import UserProfileResponse
from src.modules.gift_spend.schemas import EventBudgetUpdate, OccasionGroupImport
from src.modules.gift_spend.service import GiftSpendService

TENANT_ID = "031c4871-26ff-4b7c-845d-7ce2efd9e745"
OCCASION_ID = "7e2493b0-2a36-44be-a4e9-9913e0894a28"
GROUP_PER_RECIPIENT = "11111111-1111-4111-8111-111111111111"
GROUP_SHARED = "22222222-2222-4222-8222-222222222222"
RECIPIENTS = [
    "14d36f4c-ec6a-4211-9f32-79e39c5d54d1",
    "11770456-747a-458e-9bbf-f5b6a3bbb785",
    "33333333-3333-4333-8333-333333333333",
    "44444444-4444-4444-8444-444444444444",
]
EVENT_ID = "55555555-5555-4555-8555-555555555555"


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.count = None
        self.not_ = self

    def select(self, *_args, **kwargs):
        self.count = 0 if kwargs.get("count") else None
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def in_(self, *_args):
        return self

    def or_(self, *_args):
        return self

    def is_(self, *_args):
        return self

    def not_is(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args):
        return self

    def limit(self, *_args):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows, count=len(self.rows) if self.count is not None else None)


class SummaryDatabase:
    def __init__(self):
        self.tables = {
            "credit_accounts": [{"available_credits": 500}],
            "occasion_budget_groups": [
                {"id": GROUP_PER_RECIPIENT, "tenant_id": TENANT_ID, "occasion_id": OCCASION_ID,
                 "source_group_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "group_name_snapshot": "Standard",
                 "budget_mode": "PER_RECIPIENT", "budget_credits": 100},
                {"id": GROUP_SHARED, "tenant_id": TENANT_ID, "occasion_id": OCCASION_ID,
                 "source_group_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "group_name_snapshot": "Executives",
                 "budget_mode": "SHARED_POOL", "budget_credits": 200},
            ],
            "occasion_budget_members": [
                {"occasion_id": OCCASION_ID, "recipient_id": RECIPIENTS[0], "group_allocation_id": GROUP_PER_RECIPIENT,
                 "individual_budget_credits": 80, "spent_credits": 20},
                {"occasion_id": OCCASION_ID, "recipient_id": RECIPIENTS[1], "group_allocation_id": GROUP_PER_RECIPIENT,
                 "individual_budget_credits": None, "spent_credits": 30},
                {"occasion_id": OCCASION_ID, "recipient_id": RECIPIENTS[2], "group_allocation_id": GROUP_SHARED,
                 "individual_budget_credits": 50, "spent_credits": 25},
                {"occasion_id": OCCASION_ID, "recipient_id": RECIPIENTS[3], "group_allocation_id": GROUP_SHARED,
                 "individual_budget_credits": None, "spent_credits": 15},
            ],
            "event_spend_budgets": [
                {"event_id": EVENT_ID, "tenant_id": TENANT_ID, "recipient_id": RECIPIENTS[0],
                 "budget_credits": 90, "spent_credits": 40},
            ],
            "occasions": [{"id": OCCASION_ID, "occasion_name": "Diwali"}],
            "recipients": [{"id": recipient_id, "name": f"Recipient {index}"} for index, recipient_id in enumerate(RECIPIENTS)],
            "events": [{"id": EVENT_ID, "event_name": "Birthday", "event_date": "2026-12-01"}],
        }

    def table(self, name):
        return FakeQuery(self.tables.get(name, []))


def test_summary_calculates_allocated_spent_reserved_and_unallocated(monkeypatch):
    service = GiftSpendService(database=SummaryDatabase())
    monkeypatch.setattr(service, "_require_tenant", lambda *_args: None)
    actor = UserProfileResponse(id="u1", email="client@example.com", role="CLIENT")

    result = service.summary(TENANT_ID, actor)

    assert result.available_credits == 500
    assert result.reserved_credits == 340
    assert result.unallocated_credits == 160
    assert result.total_allocated_credits == 470
    assert result.total_spent_credits == 130
    occasion = result.occasions[0]
    assert (occasion.allocated_credits, occasion.spent_credits, occasion.reserved_credits) == (380, 90, 290)
    shared = next(group for group in occasion.groups if group.budget_mode == "SHARED_POOL")
    assert (shared.allocated_credits, shared.spent_credits, shared.reserved_credits) == (200, 40, 160)
    assert all(member.reserved_credits == 0 for member in shared.members)
    assert (result.events[0].budget_credits, result.events[0].spent_credits, result.events[0].reserved_credits) == (90, 40, 50)


def test_event_budget_rpc_receives_event_recipient_and_budget(monkeypatch):
    calls = {}

    class RpcDatabase:
        def rpc(self, name, params):
            calls["name"] = name
            calls["params"] = params
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={"event_id": EVENT_ID}))

    service = GiftSpendService(database=RpcDatabase())
    monkeypatch.setattr(service, "_require_tenant", lambda *_args: None)
    monkeypatch.setattr(service, "_require_event", lambda *_args: {"recipient_id": RECIPIENTS[0]})
    actor = UserProfileResponse(id="u1", email="client@example.com", role="CLIENT")

    service.set_event_budget(TENANT_ID, EVENT_ID, EventBudgetUpdate(budgetCredits=75), actor)

    assert calls["name"] == "set_event_spend_budget"
    assert calls["params"]["p_tenant_id"] == TENANT_ID
    assert calls["params"]["p_event_id"] == EVENT_ID
    assert calls["params"]["p_recipient_id"] == RECIPIENTS[0]
    assert calls["params"]["p_budget_credits"] == 75


def test_group_import_passes_occasion_snapshot_inputs_to_database(monkeypatch):
    calls = {}
    group_id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    allocation_id = "66666666-6666-4666-8666-666666666666"

    class RpcDatabase:
        def rpc(self, name, params):
            calls["name"] = name
            calls["params"] = params
            row = {
                "id": allocation_id,
                "source_group_id": group_id,
                "group_name_snapshot": "Executives",
                "budget_mode": "SHARED_POOL",
                "budget_credits": 120,
            }
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=[row]))

    service = GiftSpendService(database=RpcDatabase())
    monkeypatch.setattr(service, "_require_tenant", lambda *_args: None)
    monkeypatch.setattr(service, "_require_visible_occasion", lambda *_args: None)
    actor = UserProfileResponse(id="u1", email="client@example.com", role="CLIENT")

    result = service.import_group(
        TENANT_ID,
        OCCASION_ID,
        OccasionGroupImport(recipientGroupId=group_id, budgetMode="SHARED_POOL", budgetCredits=120),
        actor,
    )

    assert calls["name"] == "import_spend_group_for_occasion"
    assert calls["params"]["p_tenant_id"] == TENANT_ID
    assert calls["params"]["p_occasion_id"] == OCCASION_ID
    assert calls["params"]["p_group_id"] == group_id
    assert calls["params"]["p_budget_mode"] == "SHARED_POOL"
    assert calls["params"]["p_budget_credits"] == 120
    assert result.group_name == "Executives"


def test_notification_inbox_query_is_scoped_to_tenant_and_actor(monkeypatch):
    class InboxDatabase:
        query = None

        def table(self, name):
            assert name == "gift_spend_notifications"
            self.query = FakeQuery([])
            return self.query

    database = InboxDatabase()
    service = GiftSpendService(database=database)
    monkeypatch.setattr(service, "_require_tenant", lambda *_args: None)
    actor = UserProfileResponse(id="u1", email="client@example.com", role="CLIENT")

    result = service.list_notifications(TENANT_ID, actor, page=1, limit=20, unread_only=True)

    assert result.items == []
    assert ("tenant_id", TENANT_ID) in database.query.filters
    assert ("user_id", actor.id) in database.query.filters
