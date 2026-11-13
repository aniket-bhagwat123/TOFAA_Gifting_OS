"""Recipient directory: computed next occasion, filters, sorting and summary."""

from datetime import date
from types import SimpleNamespace

from src.modules.auth.schemas import UserProfileResponse
from src.modules.recipients.schemas import RecipientCreate, RecipientUpdate
from src.modules.recipients.service import RecipientService, next_occasion

TODAY = date(2026, 11, 13)
TENANT = "tenant-1"


def admin():
    return UserProfileResponse(id="99999999-0000-4000-8000-000000000009", email="a@example.com", role="SUPER_ADMIN", is_active=True)


def row(id, name, dob, anniversary=None, city="Mumbai", **extra):
    return {
        "id": f"r{id}", "tenant_id": TENANT, "name": name, "mobile_number": f"+9198765{id:05d}", "date_of_birth": dob,
        "anniversary_date": anniversary, "address": {"address_line1": "Street 1", "city": city, "postal_code": "400001", "country": "IN"},
        "budget": None, "remark": None, "avatar_url": None, "relationship": None, "designation": None, "status": "ACTIVE", **extra,
    }


class FakeDatabase:
    """Returns the rows given and records the filters asked for."""

    def __init__(self, rows=None, members=None):
        self.rows, self.members, self.calls = rows or [], members or [], []
        self._table = ""

    def table(self, name):
        self._table = name
        return self

    def __getattr__(self, name):
        def call(*args, **kwargs):
            self.calls.append((name, args))
            if name == "execute":
                data = self.members if self._table == "spend_recipient_group_members" else self.rows
                return SimpleNamespace(data=data, count=len(data))
            return self
        return call


def test_next_occasion_picks_the_soonest_date_and_rolls_into_next_year():
    soon = next_occasion({"date_of_birth": "1990-11-24", "anniversary_date": "2015-01-10"}, TODAY)
    assert (soon.kind, soon.date, soon.days_away) == ("BIRTHDAY", date(2026, 11, 24), 11)
    rolled = next_occasion({"date_of_birth": "1990-03-02", "anniversary_date": None}, TODAY)
    assert rolled.date == date(2027, 3, 2)
    assert next_occasion({"date_of_birth": None, "anniversary_date": None}, TODAY) is None


def test_today_counts_as_zero_days_away_and_29_feb_moves_to_28_feb():
    assert next_occasion({"date_of_birth": "1990-11-13"}, TODAY).days_away == 0
    assert next_occasion({"date_of_birth": "1992-02-29"}, TODAY).date == date(2027, 2, 28)


def test_plain_list_uses_database_paging_and_the_requested_filters():
    database = FakeDatabase([row(1, "Asha", "1990-11-20")])
    result = RecipientService(database=database).list_recipients(
        TENANT, admin(), page=1, limit=7, status="ACTIVE", relationship="CLIENT", city="Pune", search="asha", sort="name", descending=False
    )
    names = [call[0] for call in database.calls]
    assert ("eq", ("status", "ACTIVE")) in database.calls and ("eq", ("relationship", "CLIENT")) in database.calls
    assert "ilike" in names and "or_" in names and "range" in names
    assert result.items[0].next_occasion.label == "Birthday"


def test_upcoming_filter_and_next_occasion_sort_run_in_memory_with_undated_people_last():
    database = FakeDatabase([
        row(1, "Far", "1990-12-30"), row(2, "Near", "1990-11-15"), row(3, "Mid", "1990-11-25"), row(4, "Undated", None),
    ])
    service = RecipientService(database=database)
    import src.modules.recipients.service as module
    real_today = module.date

    class FrozenDate(real_today):
        @classmethod
        def today(cls):
            return TODAY

    module.date = FrozenDate
    try:
        everyone = service.list_recipients(TENANT, admin(), page=1, limit=10, sort="nextOccasion", descending=False)
        within_month = service.list_recipients(TENANT, admin(), page=1, limit=10, upcoming_days=30, sort="nextOccasion", descending=False)
    finally:
        module.date = real_today
    assert [item.name for item in everyone.items] == ["Near", "Mid", "Far", "Undated"]
    assert [item.name for item in within_month.items] == ["Near", "Mid"]
    assert within_month.pagination.total_records == 2


def test_group_filter_keeps_only_members_and_an_empty_group_returns_nothing():
    rows = [row(1, "In", "1990-11-20"), row(2, "Out", "1990-11-21")]
    rows[0]["id"], rows[1]["id"] = "r1", "r2"
    with_member = RecipientService(database=FakeDatabase(rows, members=[{"recipient_id": "r1"}]))
    assert [i.name for i in with_member.list_recipients(TENANT, admin(), page=1, limit=10, group_id="g1").items] == ["In"]
    empty = RecipientService(database=FakeDatabase(rows, members=[]))
    assert empty.list_recipients(TENANT, admin(), page=1, limit=10, group_id="g1").items == []


def test_summary_counts_and_lists_choices():
    database = FakeDatabase([
        {"address": {"city": "Pune"}, "relationship": "CLIENT", "status": "ACTIVE"},
        {"address": {"city": "Mumbai"}, "relationship": "CLIENT", "status": "ARCHIVED"},
        {"address": {"city": "Pune"}, "relationship": None, "status": "ACTIVE"},
    ])
    summary = RecipientService(database=database).summary(TENANT, admin())
    assert (summary.total, summary.active, summary.archived) == (3, 2, 1)
    assert summary.cities == ["Mumbai", "Pune"] and summary.relationships == ["CLIENT"]


def test_new_fields_are_optional_and_validated():
    base = {"name": "A", "mobileNumber": "+919876543210", "dateOfBirth": "1990-01-01",
            "address": {"addressLine1": "street 1", "city": "Pune", "postalCode": "411001"}}
    assert RecipientCreate.model_validate(base).relationship is None
    assert RecipientCreate.model_validate({**base, "relationship": "CLIENT", "designation": "VP"}).designation == "VP"
    for bad in ({"relationship": "BOSS"}, {"designation": "x" * 121}):
        try:
            RecipientCreate.model_validate({**base, **bad})
        except ValueError:
            continue
        raise AssertionError(f"{bad} should be rejected")
    assert RecipientUpdate.model_validate({"status": "ARCHIVED"}).status == "ARCHIVED"
    try:
        RecipientUpdate.model_validate({"status": None})
    except ValueError:
        pass
    else:
        raise AssertionError("status cannot be null")


class TableFake:
    """A fake database with a separate result per table."""

    def __init__(self, tables):
        self.tables, self._name = tables, ""

    def table(self, name):
        self._name = name
        return self

    def __getattr__(self, name):
        def call(*args, **kwargs):
            if name == "execute":
                data = self.tables.get(self._name, [])
                return SimpleNamespace(data=data, count=len(data))
            return self
        return call


def test_each_person_on_the_page_lists_their_groups_sorted_by_name():
    tables = {
        "recipients": [row(1, "Asha", "1990-11-20", is_primary=True), row(2, "Bala", "1990-11-21")],
        "spend_recipient_group_members": [
            {"recipient_id": "r1", "group_id": "g2"}, {"recipient_id": "r1", "group_id": "g1"}, {"recipient_id": "r2", "group_id": "gone"},
        ],
        "spend_recipient_groups": [{"id": "g1", "name": "Key Clients"}, {"id": "g2", "name": "Family"}],
    }
    items = RecipientService(database=TableFake(tables)).list_recipients(TENANT, admin(), page=1, limit=10).items
    assert [g.name for g in items[0].groups] == ["Family", "Key Clients"] and items[0].is_primary is True
    assert items[1].groups == []


def test_a_failed_group_lookup_still_returns_the_list():
    class Broken(TableFake):
        def __getattr__(self, name):
            if name == "in_" and self._name == "spend_recipient_group_members":
                raise RuntimeError("down")
            return super().__getattr__(name)

    items = RecipientService(database=Broken({"recipients": [row(1, "Asha", "1990-11-20")]})).list_recipients(TENANT, admin(), page=1, limit=10).items
    assert [i.name for i in items] == ["Asha"] and items[0].groups == []
