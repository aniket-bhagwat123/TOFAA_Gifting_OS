"""Gifting OS People requests -> CRM People requests (camelCase on the wire).

The fields match one to one except: "company" is "companyName" in the CRM, the old person types INDIVIDUAL / BUSINESS are
INTERNAL / EXTERNAL, and the person's single address is the CRM's default delivery address.
"""

from typing import Any

OLD_TYPES = {"INDIVIDUAL": "INTERNAL", "BUSINESS": "EXTERNAL"}
PERSON_KEYS = {
    "name": "name", "mobile_number": "mobileNumber", "email": "email", "company": "companyName", "designation": "designation",
    "city": "city", "date_of_birth": "dateOfBirth", "anniversary_date": "anniversaryDate", "budget": "budget",
    "birthday_budget": "birthdayBudget", "anniversary_budget": "anniversaryBudget", "gifting_occasion": "giftingOccasion",
    "remark": "remark", "relationship": "relationship", "recipient_type": "recipientType", "status": "status",
    "is_primary": "isPrimary", "version": "version",
}
ADDRESS_KEYS = {"label": "label", "address_line1": "addressLine1", "address_line2": "addressLine2", "city": "city", "state": "state",
                "postal_code": "postalCode", "country": "country", "is_default": "isDefault"}


def person_body(values: dict[str, Any]) -> dict[str, Any]:
    """CRM fields for the given Gifting OS fields (snake_case, JSON-ready). Unknown or local-only fields are dropped."""
    body = {PERSON_KEYS[k]: v for k, v in values.items() if k in PERSON_KEYS}
    if body.get("recipientType") in OLD_TYPES:
        body["recipientType"] = OLD_TYPES[body["recipientType"]]
    return body


def address_body(values: dict[str, Any], *, default: bool | None = None) -> dict[str, Any]:
    body = {ADDRESS_KEYS[k]: v for k, v in values.items() if k in ADDRESS_KEYS}
    if default is not None:
        body["isDefault"] = default
    return body
