"""The People mirror: Gifting OS's recipients tables kept equal to the CRM (the master copy).

Gift requests, occasions, events, budgets and the dashboard read people from the local tables, so they keep working
unchanged. Only this module writes them, from CRM data:
  * right after every People change made in Gifting OS (sync_ids), so the next screen shows it, and
  * whenever the CRM says People changed (a KAM edit, an import...) and once at start-up (catch_up), from the
    "changed after" mark stored in crm_people_sync.
Columns that exist only here (who imported a person, local photo copy, Gifting OS author ids) are left alone.
"""

import logging
import threading
from datetime import datetime, timezone
from typing import Any

import httpx

from src.core import images
from src.core.supabase import get_supabase_admin_client
from src.core.ttl_cache import lookups
from src.modules.crm_people.client import crm_people

log = logging.getLogger(__name__)
CHUNK = 150
MAX_PAGES = 100  # 30,000 changed people in one catch-up

# CRM field (camelCase) -> mirror column
PERSON_FIELDS = {
    "id": "id", "name": "name", "mobileNumber": "mobile_number", "email": "email", "companyName": "company",
    "designation": "designation", "city": "city", "dateOfBirth": "date_of_birth", "anniversaryDate": "anniversary_date",
    "budget": "budget", "birthdayBudget": "birthday_budget", "anniversaryBudget": "anniversary_budget",
    "giftingOccasion": "gifting_occasion", "remark": "remark", "relationship": "relationship",
    "recipientType": "recipient_type", "status": "status", "isPrimary": "is_primary", "version": "version",
    "deletedAt": "deleted_at", "createdAt": "created_at", "updatedAt": "updated_at",
}
ADDRESS_FIELDS = ("id", "label", "address_line1", "address_line2", "city", "state", "postal_code", "country", "is_default", "created_at", "updated_at")
PREFERENCE_FIELDS = ("interests", "preferred_brands", "gift_preferences", "dietary_preferences", "gifts_to_avoid", "special_instructions", "updated_at")


def _snake(key: str) -> str:
    return "".join("_" + c.lower() if c.isupper() else c for c in key).replace("address_line_1", "address_line1").replace("address_line_2", "address_line2")


def _snake_dict(row: dict[str, Any]) -> dict[str, Any]:
    return {_snake(k): v for k, v in row.items()}


def person_row(item: dict[str, Any]) -> dict[str, Any]:
    """The mirror row for one CRM person (the default address also fills the old per-person address field)."""
    row = {column: item.get(field) for field, column in PERSON_FIELDS.items()}
    row["tenant_id"] = item["giftingTenantId"]
    row["source"] = item.get("addedBy") or "TOFAA"
    addresses = [_snake_dict(a) for a in item.get("addresses") or []]
    default = next((a for a in addresses if a.get("is_default")), addresses[0] if addresses else None)
    row["address"] = {k: default.get(k) for k in ("address_line1", "address_line2", "city", "state", "postal_code", "country")} if default else None
    if not row.get("city") and default:
        row["city"] = default.get("city")
    return row


class PeopleMirror:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._again = threading.Event()
        self._running = False

    @property
    def db(self):
        return get_supabase_admin_client()

    # --- entry points ------------------------------------------------------------------------------------------------

    def sync_ids(self, ids: list[str]) -> None:
        """Bring these people in line with the CRM now (used right after a change made here)."""
        ids = sorted({str(i) for i in ids if i})
        for start in range(0, len(ids), 200):
            data = crm_people.system_get("/people-sync", {"ids": ",".join(ids[start:start + 200])}) or {}
            self.apply(data.get("items") or [])

    def catch_up(self) -> int:
        """Apply everything the CRM changed after the stored mark. One run at a time; a request during a run repeats it."""
        if not crm_people.configured():
            return 0
        with self._lock:
            if self._running:
                self._again.set()
                return 0
            self._running = True
        total = 0
        try:
            while True:
                self._again.clear()
                total += self._catch_up_once()
                if not self._again.is_set():
                    return total
        finally:
            with self._lock:
                self._running = False

    def catch_up_in_background(self) -> None:
        threading.Thread(target=self._safe_catch_up, name="crm-people-catch-up", daemon=True).start()

    def _safe_catch_up(self) -> None:
        try:
            n = self.catch_up()
            if n:
                log.info("people mirror: %s change(s) from the CRM applied", n)
        except Exception:  # noqa: BLE001 - the next notice or start-up tries again
            log.warning("people mirror catch-up failed", exc_info=True)

    def _catch_up_once(self) -> int:
        state = self.db.table("crm_people_sync").select("synced_until").eq("id", 1).limit(1).execute().data or [{}]
        since = state[0].get("synced_until")
        total = 0
        for _ in range(MAX_PAGES):
            data = crm_people.system_get("/people-sync", {"since": since} if since else None) or {}
            items = data.get("items") or []
            self.apply(items)
            total += len(items)
            since = data.get("nextSince") or since
            if since:
                self.db.table("crm_people_sync").upsert({"id": 1, "synced_until": since, "updated_at": datetime.now(timezone.utc).isoformat()}).execute()
            if not data.get("more"):
                break
        return total

    # --- writing the mirror -------------------------------------------------------------------------------------------

    def apply(self, items: list[dict[str, Any]]) -> None:
        if not items:
            return
        db = self.db
        ids = [str(i["id"]) for i in items]
        current = {str(r["id"]): r for start in range(0, len(ids), CHUNK)
                   for r in db.table("recipients").select("id,avatar_url,crm_photo_path").in_("id", ids[start:start + CHUNK]).execute().data or []}
        rows = [person_row(i) for i in items]
        self._upsert_people(rows)
        self._addresses(items)
        self._preferences(items)
        self._relationships(items)
        for item in items:
            self._photo(item, current.get(str(item["id"])) or {})
        lookups.clear()  # remembered summaries and lists are now out of date

    def _upsert_people(self, rows: list[dict[str, Any]]) -> None:
        # Deleted ones first: a mobile number freed by a deletion can then be taken by a live person in the same batch.
        rows = sorted(rows, key=lambda r: r.get("deleted_at") is None)
        try:
            for start in range(0, len(rows), 500):
                self.db.table("recipients").upsert(rows[start:start + 500], on_conflict="id").execute()
        except Exception:  # noqa: BLE001 - one bad row must not stop the rest: retry one by one
            log.warning("people mirror: batch upsert failed, retrying one by one", exc_info=True)
            for row in rows:
                try:
                    self.db.table("recipients").upsert(row, on_conflict="id").execute()
                except Exception:  # noqa: BLE001
                    log.error("people mirror: could not store person %s", row["id"], exc_info=True)

    def _addresses(self, items: list[dict[str, Any]]) -> None:
        """Make each person's mirror addresses equal to the CRM's, in a few batched calls for the whole page."""
        db = self.db
        ids = [str(i["id"]) for i in items]
        wanted = [{**{k: a.get(k) for k in ADDRESS_FIELDS}, "recipient_id": str(i["id"]), "tenant_id": i["giftingTenantId"]}
                  for i in items for a in (_snake_dict(x) for x in i.get("addresses") or [])]
        keep = {a["id"] for a in wanted}
        existing = [r for start in range(0, len(ids), CHUNK)
                    for r in db.table("recipient_addresses").select("id,recipient_id,is_default").in_("recipient_id", ids[start:start + CHUNK]).execute().data or []]
        stale = [str(r["id"]) for r in existing if str(r["id"]) not in keep]
        for start in range(0, len(stale), CHUNK):
            db.table("recipient_addresses").delete().in_("id", stale[start:start + CHUNK]).execute()
        # One default per person: clear the old defaults that stay, then write the CRM's rows (with its default).
        old_defaults = [str(r["id"]) for r in existing if r.get("is_default") and str(r["id"]) in keep]
        for start in range(0, len(old_defaults), CHUNK):
            db.table("recipient_addresses").update({"is_default": False}).in_("id", old_defaults[start:start + CHUNK]).execute()
        for start in range(0, len(wanted), 500):
            db.table("recipient_addresses").upsert(wanted[start:start + 500], on_conflict="id").execute()

    def _preferences(self, items: list[dict[str, Any]]) -> None:
        db = self.db
        empty = [str(i["id"]) for i in items if not i.get("preferences")]
        for start in range(0, len(empty), CHUNK):
            db.table("recipient_preferences").delete().in_("recipient_id", empty[start:start + CHUNK]).execute()
        rows = [{**{k: p.get(k) for k in PREFERENCE_FIELDS}, "recipient_id": str(i["id"]), "tenant_id": i["giftingTenantId"]}
                for i in items if (p := _snake_dict(i["preferences"]) if i.get("preferences") else None)]
        if rows:
            db.table("recipient_preferences").upsert(rows, on_conflict="recipient_id").execute()

    def _relationships(self, items: list[dict[str, Any]]) -> None:
        db = self.db
        ids = [str(i["id"]) for i in items]
        for start in range(0, len(ids), CHUNK):
            db.table("recipient_relationships").delete().in_("recipient_id", ids[start:start + CHUNK]).execute()
        rows = [{"id": x["id"], "tenant_id": i["giftingTenantId"], "recipient_id": str(i["id"]), "related_recipient_id": x["relatedRecipientId"],
                 "relationship_type": x["relationshipType"], "created_at": x.get("createdAt")}
                for i in items for x in i.get("relationships") or []]
        if not rows:
            return
        try:
            db.table("recipient_relationships").insert(rows).execute()
        except Exception:  # noqa: BLE001 - a link to someone not mirrored yet: retry one by one and skip only that link
            for row in rows:
                try:
                    db.table("recipient_relationships").insert(row).execute()
                except Exception:  # noqa: BLE001
                    log.warning("people mirror: skipped a link %s -> %s", row["recipient_id"], row["related_recipient_id"])

    def _photo(self, item: dict[str, Any], current: dict[str, Any]) -> None:
        """The CRM keeps photos private; the mirror shows a public copy, refreshed only when the CRM photo changes."""
        path, url = item.get("photoPath"), item.get("photoUrl")
        if path == current.get("crm_photo_path") and (path or not current.get("avatar_url")):
            return
        rid, tenant, db = str(item["id"]), item["giftingTenantId"], self.db
        new_url = None
        if path and url:
            try:
                res = httpx.get(url, timeout=20, follow_redirects=False)
                res.raise_for_status()
                new_url = images.store_image(db, f"recipients/{tenant}/{rid}", res.content, res.headers.get("content-type", "image/jpeg").split(";")[0])
            except Exception:  # noqa: BLE001 - keep the old photo; the next change tries again
                log.warning("people mirror: could not copy the photo of %s", rid, exc_info=True)
                return
        db.table("recipients").update({"avatar_url": new_url, "crm_photo_path": path}).eq("id", rid).execute()
        if current.get("avatar_url") and current.get("avatar_url") != new_url:
            images.remove_image(db, current.get("avatar_url"))


people_mirror = PeopleMirror()
