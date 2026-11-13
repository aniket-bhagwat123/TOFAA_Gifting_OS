"""Collaborative onboarding: completeness, duplicate check, edit conflicts, history and profile sections."""

from types import SimpleNamespace

import pytest

from src.core.errors import ApiError
from src.modules.auth.schemas import UserProfileResponse
from src.modules.recipients import completeness, trail
from src.modules.recipients.profile import InfoStatusBody, ProfileService, RelationshipItem, RelationshipsBody
from src.modules.recipients.schemas import RecipientCreate, RecipientUpdate
from src.modules.recipients.service import RecipientService

TENANT = "tenant-1"


def person(**extra):
    return {
        "id": "r1", "tenant_id": TENANT, "name": "Sachin Tendulkar", "mobile_number": "+919876543210", "email": None, "date_of_birth": "1990-04-24",
        "anniversary_date": None, "address": {"address_line1": "1 Marine Drive", "city": "Mumbai", "postal_code": "400001", "country": "IN"},
        "budget": None, "remark": None, "avatar_url": None, "relationship": "CLIENT", "designation": None, "status": "ACTIVE",
        "is_primary": False, "company": None, "recipient_type": "INDIVIDUAL", "version": 3, **extra,
    }


def actor(role="CLIENT"):
    return UserProfileResponse(id="u1", email="priya@acme.com", full_name="Priya Sharma", role=role, tenant_id=TENANT)


class TableFake:
    """Per-table results; records every call so tests can see what was written."""

    def __init__(self, tables):
        self.tables, self._name, self.writes = tables, "", []

    def table(self, name):
        self._name = name
        return self

    def __getattr__(self, name):
        def call(*args, **kwargs):
            if name in ("insert", "update", "upsert", "delete"):
                self.writes.append((self._name, name, args[0] if args else None))
            if name == "execute":
                data = self.tables.get(self._name, [])
                return SimpleNamespace(data=data, count=len(data))
            return self
        return call


# ------------------------------------------------------------------------------------------ completeness
def test_only_the_name_is_needed_to_start_and_extras_never_lower_the_score():
    bare = completeness.compute({"name": "A", "recipient_type": "INDIVIDUAL"})
    full = completeness.compute(person(), completeness.Extras(related_people=1, occasion_count=1, has_preferences=True, address_count=1))
    assert bare["percent"] < 40 and bare["needsAttention"]
    assert full["percent"] == 100 and all(section["missing"] == [] for section in full["sections"])


def test_business_contacts_also_need_company_and_designation_but_individuals_do_not():
    individual = completeness.compute(person())["sections"][0]
    business = completeness.compute(person(recipient_type="BUSINESS"))["sections"][0]
    assert individual["missing"] == [] and set(business["missing"]) == {"Company", "Designation"}


def test_not_applicable_information_is_left_out_of_the_score():
    with_gap = completeness.compute(person(date_of_birth=None))
    skipped = completeness.compute(person(date_of_birth=None), not_applicable=frozenset({"birthday"}))
    assert skipped["percent"] > with_gap["percent"]
    assert next(s for s in skipped["sections"] if s["key"] == "occasions")["applicable"] is False


def test_a_legacy_single_address_counts_as_a_delivery_address():
    result = completeness.compute(person())
    assert next(s for s in result["sections"] if s["key"] == "addresses")["percent"] == 100


# ------------------------------------------------------------------------------------------------ history
def test_history_lists_only_real_changes_and_ignores_blank_to_blank():
    changes = trail.diff(person(), {"name": "Sachin T", "mobile_number": "+919876543210", "email": "", "version": 4, "remark": None})
    assert changes == [("name", "Sachin Tendulkar", "Sachin T")]


def test_each_change_is_one_row_with_the_actor_role_and_source():
    db = TableFake({})
    trail.record(db, TENANT, "r1", actor("KAM"), "EDIT", [("mobile_number", "+911", "+912")], "CALL")
    table, method, rows = db.writes[0]
    assert (table, method) == ("recipient_audit", "insert")
    assert rows[0]["actor_role"] == "KAM" and rows[0]["source"] == "CALL" and rows[0]["actor_name"] == "Priya Sharma"
    assert trail.source_of("whatsapp") == "WHATSAPP" and trail.source_of("nonsense") == "MANUAL" and trail.source_of(None) == "MANUAL"


def test_a_failed_history_write_never_breaks_the_change():
    class Broken:
        def table(self, _):
            raise RuntimeError("down")

    trail.record(Broken(), TENANT, "r1", actor(), "EDIT", [("name", "a", "b")])


# ----------------------------------------------------------------------------------------------- duplicates
def create_payload(**extra):
    return RecipientCreate.model_validate({"name": "Rohan Mehta", **extra})


def test_a_recipient_needs_only_a_name():
    created = create_payload()
    assert created.mobile_number is None and created.address is None and created.date_of_birth is None and created.recipient_type == "INDIVIDUAL"
    with pytest.raises(ValueError):
        RecipientCreate.model_validate({"mobileNumber": "+919876543210"})
    for bad in ({"email": "not-an-email"}, {"mobileNumber": "12"}, {"recipientType": "ROBOT"}):
        with pytest.raises(ValueError):
            create_payload(**bad)


def test_a_possible_duplicate_stops_the_save_and_lists_the_matches():
    db = TableFake({"recipients": [person(id="existing", name="Rohan Mehta")]})
    with pytest.raises(ApiError) as caught:
        RecipientService(database=db).create_recipient(TENANT, create_payload(mobileNumber="+919876543210"), actor("SUPER_ADMIN"))
    assert caught.value.status_code == 409
    match = caught.value.data["duplicates"][0]
    assert match["id"] == "existing" and "SAME_MOBILE" in match["reasons"]
    assert not any(method == "insert" and table == "recipients" for table, method, _ in db.writes)


def test_after_the_user_confirms_the_person_is_saved_and_recorded_in_history():
    db = TableFake({"recipients": [person(id="new-one", name="Rohan Mehta")]})
    saved = RecipientService(database=db).create_recipient(TENANT, create_payload(allowDuplicate=True), actor("SUPER_ADMIN"), source="CALL")
    assert saved.id == "new-one"
    inserted = next(rows for table, method, rows in db.writes if table == "recipients" and method == "insert")
    assert "allow_duplicate" not in inserted
    audit = next(rows for table, _, rows in db.writes if table == "recipient_audit")
    assert audit[0]["action"] == "CREATE" and audit[0]["source"] == "CALL"


# ---------------------------------------------------------------------------------------------- conflicts
def test_saving_from_an_old_version_is_refused_with_the_latest_copy():
    db = TableFake({"recipients": [person(version=5, name="Changed by the KAM")]})
    with pytest.raises(ApiError) as caught:
        RecipientService(database=db).update_recipient(TENANT, "r1", RecipientUpdate.model_validate({"remark": "mine", "version": 4}), actor("SUPER_ADMIN"))
    assert caught.value.status_code == 409 and caught.value.data["reason"] == "VERSION_CONFLICT"
    assert caught.value.data["current"]["name"] == "Changed by the KAM" and caught.value.data["current"]["version"] == 5
    assert not any(method == "update" for _, method, _ in db.writes)


def test_a_matching_version_saves_bumps_the_version_and_writes_history():
    db = TableFake({"recipients": [person(version=3)]})
    RecipientService(database=db).update_recipient(TENANT, "r1", RecipientUpdate.model_validate({"mobileNumber": "+919000000000", "version": 3}), actor("SUPER_ADMIN"), source="MEETING")
    values = next(rows for table, method, rows in db.writes if table == "recipients" and method == "update")
    assert values["version"] == 4 and "version" in values and values["mobile_number"] == "+919000000000"
    audit = next(rows for table, _, rows in db.writes if table == "recipient_audit")
    assert (audit[0]["field"], audit[0]["old_value"], audit[0]["new_value"], audit[0]["source"]) == ("mobile_number", "+919876543210", "+919000000000", "MEETING")


def test_archiving_is_recorded_as_an_archive_not_an_edit():
    db = TableFake({"recipients": [person()]})
    RecipientService(database=db).update_recipient(TENANT, "r1", RecipientUpdate.model_validate({"status": "ARCHIVED"}), actor("SUPER_ADMIN"))
    assert next(rows for table, _, rows in db.writes if table == "recipient_audit")[0]["action"] == "ARCHIVE"


def test_a_patch_that_only_carries_a_version_is_not_a_change():
    with pytest.raises(ValueError):
        RecipientUpdate.model_validate({"version": 2})


# ------------------------------------------------------------------------------------------ profile parts
def use(monkeypatch, db):
    monkeypatch.setattr("src.modules.recipients.profile.recipient_service", SimpleNamespace(database=db, _get_scoped_recipient=lambda *_a, **_k: person()))


def test_only_the_client_can_mark_information_verified(monkeypatch):
    use(monkeypatch, TableFake({"recipient_info_status": []}))
    service = ProfileService()
    body = InfoStatusBody.model_validate({"fieldKey": "birthday", "status": "VERIFIED"})
    with pytest.raises(ApiError) as caught:
        service.set_info_status(TENANT, "r1", body, actor("KAM"), "CALL")
    assert caught.value.status_code == 403
    service.set_info_status(TENANT, "r1", body, actor("CLIENT"), "MANUAL")  # the client's own contact may


def test_follow_up_status_only_accepts_known_fields_and_statuses():
    for bad in ({"fieldKey": "shoe_size", "status": "PENDING"}, {"fieldKey": "city", "status": "DONE"}):
        with pytest.raises(ValueError):
            InfoStatusBody.model_validate(bad)


def test_a_person_cannot_be_related_to_themselves_or_listed_twice(monkeypatch):
    use(monkeypatch, TableFake({}))
    service = ProfileService()
    same = RelationshipsBody(items=[RelationshipItem(relatedRecipientId="11111111-1111-4111-8111-111111111111", relationshipType="SPOUSE")])
    with pytest.raises(ApiError):
        service.save_relationships(TENANT, "11111111-1111-4111-8111-111111111111", same, actor(), "MANUAL")
    twice = RelationshipsBody(items=[RelationshipItem(relatedRecipientId="22222222-2222-4222-8222-222222222222", relationshipType="SON")] * 2)
    with pytest.raises(ApiError):
        service.save_relationships(TENANT, "r1", twice, actor(), "MANUAL")


def test_the_first_address_becomes_the_default(monkeypatch):
    from src.modules.recipients.profile import AddressBody

    db = TableFake({"recipient_addresses": []})
    use(monkeypatch, db)
    # The insert result comes back from the same fake table; give it a row to return.
    db.tables["recipient_addresses"] = [{"id": "a1", "label": "OFFICE", "address_line1": "1 Marine Drive", "city": "Mumbai", "postal_code": "400001", "country": "IN", "is_default": True}]
    service = ProfileService()
    service.list_addresses = lambda *_a, **_k: []  # no address yet
    service.add_address(TENANT, "r1", AddressBody.model_validate({"label": "OFFICE", "addressLine1": "1 Marine Drive", "city": "Mumbai", "postalCode": "400001"}), actor(), "MANUAL")
    inserted = next(rows for table, method, rows in db.writes if table == "recipient_addresses" and method == "insert")
    assert inserted["is_default"] is True
