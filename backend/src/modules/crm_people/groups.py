"""Recipient groups copied from the CRM (the master copy), after the People mirror is up to date.

The CRM sends a full snapshot: every group of every linked client, with its members. Each run works out what differs
(`plan`) and applies only that. A group that carries `crm_group_id` is managed in the CRM:
  * new in the CRM            -> created here (with the CRM id)
  * same name already here    -> that group is taken over, so budgets and occasions that use it keep working;
                                 its members become the CRM's
  * deleted in the CRM        -> deleted here, or kept as a Gifting OS group when an occasion still uses it
Groups without `crm_group_id` that match nothing in the CRM are never touched.
When a CRM account is linked to a different client here, its groups are made again under that client; the earlier copies
stay with the earlier client as Gifting OS groups.

Preview without writing anything:  python -m src.modules.crm_people.groups
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any
from uuid import uuid4

from postgrest.exceptions import APIError

from src.core.supabase import get_supabase_admin_client
from src.core.ttl_cache import lookups
from src.modules.crm_people.client import crm_people

log = logging.getLogger(__name__)
CHUNK = 150
PAGE = 1000
MISSING_COLUMN = {"42703", "PGRST204"}


@dataclass
class Change:
    action: str  # create | adopt | update | delete
    id: str
    tenant_id: str
    name: str
    crm_group_id: str | None = None
    add: list[str] = field(default_factory=list)
    remove: list[str] = field(default_factory=list)
    updated_at: str | None = None


def plan(snapshot: dict[str, Any], existing: list[dict[str, Any]], members: dict[str, set[str]], live: set[str]) -> list[Change]:
    """What to change so the groups here equal the CRM's. Deletions come first, freeing their names."""
    items = snapshot.get("items") or []
    wanted_ids = {str(g["id"]) for g in items}
    managed = {str(g["crm_group_id"]): g for g in existing if g.get("crm_group_id")}
    own = {(str(g["tenant_id"]), g["name"].strip().lower()): g for g in existing if not g.get("crm_group_id")}
    changes = [Change("delete", str(g["id"]), str(g["tenant_id"]), g["name"], crm_id)
               for crm_id, g in managed.items() if crm_id not in wanted_ids]
    for item in items:
        crm_id, tenant, name = str(item["id"]), str(item["tenantId"]), item["name"].strip()
        current = managed.get(crm_id)
        action = "update"
        if current is None:
            current = own.pop((tenant, name.lower()), None)
            action = "adopt" if current else "create"
        local_id = str(current["id"]) if current else crm_id
        want = {str(i) for i in item.get("recipientIds") or []} & live
        have = members.get(local_id, set())
        add, remove = sorted(want - have), sorted(have - want)
        if action == "update" and not add and not remove and current["name"] == name:
            continue
        changes.append(Change(action, local_id, tenant, name, crm_id, add, remove, item.get("updatedAt")))
    return changes


def _all(query: Callable[[], Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    while True:
        page = query().range(len(rows), len(rows) + PAGE - 1).execute().data or []
        if not page:
            return rows
        rows.extend(page)


class GroupMirror:
    @property
    def db(self):
        return get_supabase_admin_client()

    def pending(self) -> list[Change] | None:
        """The changes a sync would make now. None when the database update has not been applied yet."""
        db = self.db
        try:
            db.table("spend_recipient_groups").select("crm_group_id").limit(1).execute()
        except APIError as exc:
            if exc.code not in MISSING_COLUMN:
                raise
            log.warning("groups from the CRM are not synced: apply the migration 20261127100000_groups_from_crm.sql")
            return None
        snapshot = crm_people.system_get("/groups-sync") or {}
        tenants = [str(t) for t in snapshot.get("tenantIds") or []]
        if not tenants:
            return []
        # Only clients that exist here (a CRM account may point at a tenant that was removed).
        known = {str(r["id"]) for r in _all(lambda: db.table("tenants").select("id").in_("id", tenants).order("id"))}
        snapshot = {**snapshot, "items": [g for g in snapshot.get("items") or [] if str(g["tenantId"]) in known]}
        existing = _all(lambda: db.table("spend_recipient_groups").select("id,tenant_id,name,crm_group_id")
                        .in_("tenant_id", tenants).order("id"))
        members: dict[str, set[str]] = {}
        for row in _all(lambda: db.table("spend_recipient_group_members").select("group_id,recipient_id")
                        .in_("tenant_id", tenants).order("group_id").order("recipient_id")):
            members.setdefault(str(row["group_id"]), set()).add(str(row["recipient_id"]))
        live = {str(r["id"]) for r in _all(lambda: db.table("recipients").select("id")
                                           .in_("tenant_id", tenants).is_("deleted_at", "null").order("id"))}
        return plan(snapshot, existing, members, live)

    def sync(self) -> int:
        changes = self.pending()
        if not changes:
            return 0
        done = 0
        for change in changes:
            try:
                self._apply(change)
                done += 1
            except Exception:  # noqa: BLE001 - one group must not stop the rest; the next run tries again
                log.error("groups mirror: could not %s group %s", change.action, change.id, exc_info=True)
        lookups.clear()
        return done

    def _free_from_earlier_client(self, c: Change, refused: APIError) -> str:
        """The CRM group is already copied under another client (its account was linked elsewhere before). That copy
        stops following the CRM and keeps its people and budgets; returns the id to make the new copy with. Any other
        clash (for example a name) is passed on."""
        db = self.db
        table = "spend_recipient_groups"
        found = (db.table(table).select("id,tenant_id,crm_group_id").eq("crm_group_id", c.crm_group_id).execute().data or []) +                 (db.table(table).select("id,tenant_id,crm_group_id").eq("id", c.id).execute().data or [])
        earlier = [g for g in found if str(g["tenant_id"]) != c.tenant_id]
        if not earlier:
            raise refused
        for group in earlier:
            db.table(table).update({"crm_group_id": None}).eq("id", group["id"]).execute()
        return str(uuid4()) if any(str(g["id"]) == c.id for g in earlier) else c.id

    def _apply(self, c: Change) -> None:
        db = self.db
        groups = lambda: db.table("spend_recipient_groups")  # noqa: E731
        if c.action == "delete":
            try:
                groups().delete().eq("id", c.id).execute()
            except APIError as exc:
                if exc.code != "23503":
                    raise
                groups().update({"crm_group_id": None}).eq("id", c.id).execute()  # an occasion uses it: keep it here
            return
        values = {"name": c.name, "crm_group_id": c.crm_group_id}
        if c.updated_at:
            values["updated_at"] = c.updated_at
        if c.action == "create":
            try:
                groups().insert({**values, "id": c.id, "tenant_id": c.tenant_id}).execute()
            except APIError as exc:
                if exc.code != "23505":
                    raise
                c.id = self._free_from_earlier_client(c, exc)
                groups().insert({**values, "id": c.id, "tenant_id": c.tenant_id}).execute()
        else:
            groups().update(values).eq("id", c.id).execute()
        # Add before removing, so a failure part way never leaves the group emptier than both versions.
        for start in range(0, len(c.add), 500):
            db.table("spend_recipient_group_members").upsert(
                [{"tenant_id": c.tenant_id, "group_id": c.id, "recipient_id": r} for r in c.add[start:start + 500]],
                on_conflict="tenant_id,group_id,recipient_id",
            ).execute()
        for start in range(0, len(c.remove), CHUNK):
            db.table("spend_recipient_group_members").delete().eq("group_id", c.id).in_("recipient_id", c.remove[start:start + CHUNK]).execute()


group_mirror = GroupMirror()


def _preview() -> None:
    changes = group_mirror.pending()
    if changes is None:
        print("The migration 20261127100000_groups_from_crm.sql is not applied yet.")
        return
    print(f"{len(changes)} group change(s). Nothing was written.")
    for c in changes:
        print(f"  {c.action:7} {c.name!r} (client {c.tenant_id[:8]}): +{len(c.add)} / -{len(c.remove)} people")


if __name__ == "__main__":
    _preview()
