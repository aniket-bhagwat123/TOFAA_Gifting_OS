"""Recipient groups copied from the CRM: what a sync changes, and that copied groups are read-only here."""
import pytest
from fastapi import HTTPException

from src.modules.crm_people.groups import plan
from src.modules.gift_spend.service import gift_spend_service

T = "11111111-1111-1111-1111-111111111111"


def crm(gid, name, members):
    return {"id": gid, "tenantId": T, "name": name, "recipientIds": members, "updatedAt": "2026-11-26T00:00:00+00:00"}


def local(gid, name, crm_id=None):
    return {"id": gid, "tenant_id": T, "name": name, "crm_group_id": crm_id}


def test_new_group_is_created_with_only_people_who_exist_here():
    [c] = plan({"items": [crm("g1", "Diwali", ["a", "b", "ghost"])]}, [], {}, {"a", "b"})
    assert (c.action, c.id, c.add, c.remove) == ("create", "g1", ["a", "b"], [])


def test_same_name_group_is_taken_over_and_keeps_its_id():
    [c] = plan({"items": [crm("g1", "Diwali", ["a"])]}, [local("os-1", " diwali ")], {"os-1": {"b"}}, {"a", "b"})
    assert (c.action, c.id, c.crm_group_id, c.add, c.remove) == ("adopt", "os-1", "g1", ["a"], ["b"])


def test_unchanged_group_is_left_alone_and_own_groups_are_never_touched():
    existing = [local("g1", "Diwali", "g1"), local("os-2", "My own")]
    assert plan({"items": [crm("g1", "Diwali", ["a"])]}, existing, {"g1": {"a"}, "os-2": {"a"}}, {"a"}) == []


def test_rename_and_member_change_update_the_group():
    [c] = plan({"items": [crm("g1", "Holi", ["b"])]}, [local("g1", "Diwali", "g1")], {"g1": {"a"}}, {"a", "b"})
    assert (c.action, c.name, c.add, c.remove) == ("update", "Holi", ["b"], ["a"])


def test_group_deleted_in_the_crm_is_deleted_first():
    changes = plan({"items": [crm("g2", "Diwali", [])]}, [local("g1", "Diwali", "g1")], {}, set())
    assert [c.action for c in changes] == ["delete", "create"]


class _Query:
    def __init__(self, rows):
        self.rows = rows

    def __getattr__(self, name):
        return lambda *a, **k: self

    def execute(self):
        return type("R", (), {"data": self.rows})()


class _Db:
    def __init__(self, rows):
        self.rows = rows

    def table(self, name):
        return _Query(self.rows)


def test_editing_or_deleting_a_crm_group_is_refused(monkeypatch):
    db = _Db([{"id": "g1", "name": "Diwali", "crm_group_id": "g1"}])
    monkeypatch.setattr(gift_spend_service, "database", db)
    monkeypatch.setattr(gift_spend_service, "_require_tenant", lambda *a: None)
    for call in (lambda: gift_spend_service.delete_group(T, "g1", None), lambda: gift_spend_service.bulk_delete_groups(T, ["g1"], None)):
        with pytest.raises(HTTPException) as err:
            call()
        assert err.value.status_code == 409 and "Diwali" in err.value.detail


def test_a_group_left_under_an_earlier_client_is_made_again_for_the_new_one(monkeypatch):
    """The CRM account was linked to another client: the old copy is detached (not deleted), the new one gets its own id."""
    from postgrest.exceptions import APIError

    from src.modules.crm_people.groups import Change, GroupMirror

    rows = [{"id": "g1", "tenant_id": "old", "name": "Diwali", "crm_group_id": "g1"}]
    done = []

    class Table:
        def __init__(self):
            self.filters, self.op, self.values = {}, "select", None

        def select(self, *a):
            return self

        def insert(self, values):
            self.op, self.values = "insert", values
            return self

        def update(self, values):
            self.op, self.values = "update", values
            return self

        def eq(self, key, value):
            self.filters[key] = value
            return self

        def execute(self):
            if self.op == "insert":
                if any(r["id"] == self.values["id"] for r in rows):
                    raise APIError({"code": "23505", "message": "duplicate key"})
                rows.append(dict(self.values))
            found = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
            if self.op == "update":
                for r in found:
                    r.update(self.values)
            done.append(self.op)
            return type("R", (), {"data": [dict(r) for r in found]})()

    class Database:
        def table(self, name):
            return Table()

    monkeypatch.setattr(GroupMirror, "db", property(lambda self: Database()))
    change = Change("create", "g1", "new", "Diwali", "g1")
    GroupMirror()._apply(change)
    assert rows[0] == {"id": "g1", "tenant_id": "old", "name": "Diwali", "crm_group_id": None}
    assert rows[1]["tenant_id"] == "new" and rows[1]["crm_group_id"] == "g1" and rows[1]["id"] == change.id != "g1"

