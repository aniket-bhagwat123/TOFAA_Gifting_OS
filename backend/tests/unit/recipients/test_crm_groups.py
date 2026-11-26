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
