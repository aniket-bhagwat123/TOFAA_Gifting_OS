from datetime import date
from types import SimpleNamespace

from src.modules.occasions.overview import OccasionOverviewService, occurrences, sort_items, tab_counts

TODAY = date(2026, 11, 11)


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, _name):
        return lambda *a, **k: self

    @property
    def not_(self):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


class FakeDb:
    def __init__(self, **tables):
        self.tables = tables

    def table(self, name):
        return FakeQuery(self.tables.get(name, []))


def test_occurrences_repeat_and_leap_day():
    assert occurrences(date(2020, 2, 29), True, date(2027, 1, 1), date(2027, 12, 31)) == [date(2027, 2, 28)]
    assert occurrences(date(2026, 11, 20), False, date(2026, 11, 1), date(2026, 11, 30)) == [date(2026, 11, 20)]
    assert occurrences(date(2026, 11, 20), False, date(2027, 1, 1), date(2027, 2, 1)) == []
    assert occurrences(date(1990, 4, 24), True, date(2026, 11, 11), date(2027, 5, 1)) == [date(2027, 4, 24)]
    assert occurrences(date(2030, 4, 24), True, date(2026, 11, 11), date(2027, 5, 1)) == []  # not before its first year


def _items():
    db = FakeDb(
        recipients=[
            {"id": "r1", "name": "Sachin", "date_of_birth": "1973-11-20", "anniversary_date": None, "avatar_url": None},
            {"id": "r2", "name": "Asha", "date_of_birth": "1990-11-15", "anniversary_date": None, "avatar_url": None},
        ],
        events=[{"id": "e2", "recipient_id": "r2", "event_name": "Birthday", "event_date": "2026-11-15", "priority": "VIP"}],
        occasions=[
            {"id": "o1", "tenant_id": None, "occasion_name": "Diwali", "occasion_date": "2026-11-12", "is_active": True},
            {"id": "o2", "tenant_id": "t", "occasion_name": "Annual Day", "occasion_date": "2026-12-15", "category": "Annual Event", "repeat_annually": True},
        ],
        gift_requests=[{"id": "g1", "request_code": "TG-0001", "event_id": "e2", "recipient_id": "r2", "status": "CONFIRMED", "requested_budget": 2500, "relationship": "Client"}],
        gifts=[{"request_id": "g1", "status": "DELIVERED"}],
    )
    return OccasionOverviewService(db)._build("t", date(2026, 11, 11), date(2027, 1, 31), TODAY)


def test_build_merges_birthday_event_and_derives_status():
    items = {i.name: i for i in _items()}
    assert len(_items()) == 4  # Asha's birthday is the event, not a second DOB row
    asha = items["Asha"]
    assert (asha.status.value, asha.tab, asha.budget, asha.request_id, asha.relationship, asha.priority) == ("DELIVERED", "DELIVERED", 2500.0, "g1", "Client", "VIP")
    assert items["Sachin"].tab == "NOT_PLANNED" and items["Sachin"].days_away == 9
    assert items["Diwali"].source_type == "COMPANY" and items["Diwali"].is_global
    assert items["Annual Day"].label == "Annual Event"


def test_counts_and_sorting():
    items = _items()
    counts = tab_counts(items)
    assert counts["ALL"] == 4 and counts["NOT_PLANNED"] == 3 and counts["DELIVERED"] == 1
    assert [i.name for i in sort_items(items, "soonest")] == ["Diwali", "Asha", "Sachin", "Annual Day"]
    assert [i.name for i in sort_items(items, "name")] == ["Annual Day", "Asha", "Diwali", "Sachin"]
    assert sort_items(items, "priority")[0].name == "Asha"  # VIP first
