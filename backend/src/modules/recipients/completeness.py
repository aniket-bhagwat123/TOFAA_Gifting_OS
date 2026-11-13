"""How complete a recipient's profile is. One formula, used by every portal, so the EA and the KAM see the same number.

Only fields that apply to the person count: optional extras never lower the score, and a field marked
"not applicable" by the client or KAM is left out of the maths.
"""

from dataclasses import dataclass
from typing import Any

# (section key, label, weight in the overall score)
SECTIONS: tuple[tuple[str, str, int], ...] = (
    ("basic", "Basic details", 30),
    ("relationships", "Family & relationships", 15),
    ("occasions", "Birthday & occasions", 20),
    ("preferences", "Gifting preferences", 15),
    ("addresses", "Delivery addresses", 20),
)
# Share of the profile's attention that needs a person: below this a profile "needs attention".
ATTENTION_BELOW = 50


@dataclass(frozen=True)
class Extras:
    """What the person has in the tables next to the recipient row."""

    related_people: int = 0
    group_count: int = 0
    occasion_count: int = 0
    has_preferences: bool = False
    address_count: int = 0


def _filled(value: Any) -> bool:
    return bool(str(value).strip()) if value is not None else False


def _checks(row: dict[str, Any], extras: Extras) -> dict[str, list[tuple[str, str, bool]]]:
    """Per section: (field key, label shown when missing, is it filled?)."""
    business = row.get("recipient_type") == "BUSINESS"
    address = row.get("address") or {}
    basic = [
        ("name", "Full name", _filled(row.get("name"))),
        ("contact", "Mobile number or email", _filled(row.get("mobile_number")) or _filled(row.get("email"))),
        ("city", "City", _filled(row.get("city")) or _filled(address.get("city")) or extras.address_count > 0),
    ]
    if business:
        basic += [("company", "Company", _filled(row.get("company"))), ("designation", "Designation", _filled(row.get("designation")))]
    return {
        "basic": basic,
        "relationships": [("relationship", "Relationship", _filled(row.get("relationship")) or extras.related_people > 0 or extras.group_count > 0)],
        "occasions": [("birthday", "Birthday", _filled(row.get("date_of_birth")) or extras.occasion_count > 0)],
        "preferences": [("preferences", "Gifting preferences", extras.has_preferences)],
        "addresses": [("address", "Delivery address", _filled(address.get("address_line1")) or extras.address_count > 0)],
    }


def compute(row: dict[str, Any], extras: Extras | None = None, not_applicable: frozenset[str] = frozenset()) -> dict[str, Any]:
    """{'percent': 0-100, 'sections': [{key, label, percent, missing: [labels]}], 'needsAttention': bool}."""
    extras = extras or Extras()
    checks = _checks(row, extras)
    sections, weighted, total_weight = [], 0.0, 0
    for key, label, weight in SECTIONS:
        applicable = [item for item in checks[key] if item[0] not in not_applicable]
        if not applicable:
            sections.append({"key": key, "label": label, "percent": 100, "missing": [], "applicable": False})
            continue
        done = sum(1 for _, _, ok in applicable if ok)
        percent = round(100 * done / len(applicable))
        sections.append({"key": key, "label": label, "percent": percent, "missing": [name for _, name, ok in applicable if not ok], "applicable": True})
        weighted += weight * done / len(applicable)
        total_weight += weight
    overall = round(100 * weighted / total_weight) if total_weight else 100
    return {"percent": overall, "sections": sections, "needsAttention": overall < ATTENTION_BELOW}
