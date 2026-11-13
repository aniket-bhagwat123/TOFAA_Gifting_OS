"""Plain-language descriptions of audited changes, for the Activity screen.

The audit log stores what was called (method + route) and a few *facts* about the change, taken from the
successful response (names, amounts, the occasion). This module turns those into a headline a person can
understand without opening the record, e.g. "Birthday gift request for Rohan Mehta submitted".
"""

import logging
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any, Callable

logger = logging.getLogger("tofaa.activity")

_SKIPPED = frozenset({"api", "v1", "tenants", "admin"})

# Facts worth keeping from a response (camelCase). Nothing else is ever stored.
DETAIL_KEYS = frozenset({
    "name", "requestCode", "recipientName", "occasionName", "eventName", "groupName", "title", "status", "statusNote",
    "requestedBudget", "budgetMin", "budgetMax", "budgetMode", "deliveryDate", "requestedCredits", "amountDueMinor",
    "paidAmountMinor", "reviewNote", "ledgerEntryId", "creditsDelta", "balanceAfter", "reason", "description",
    "budgetCredits", "targetType", "targetId", "groupId",
})
# Which path parameter holds which kind of id (kept so names can be looked up when the feed is read).
PATH_IDS = {"recipient_id": "recipientId", "group_id": "groupId", "occasion_id": "occasionId", "event_id": "eventId", "request_id": "requestId"}
_MAX_TEXT = 200


def _camel(key: str) -> str:
    head, *rest = key.split("_")
    return head + "".join(part.title() for part in rest)


def pick_details(payload: Any) -> dict[str, Any]:
    """The whitelisted facts in a response body (``data`` of an ApiResponse, or the body itself)."""
    data = payload.get("data", payload) if isinstance(payload, dict) else None
    if not isinstance(data, dict):
        return {}
    found: dict[str, Any] = {}
    for key, value in data.items():
        name = _camel(key)
        if name in DETAIL_KEYS and isinstance(value, (str, int, float, bool)) and value != "":
            found[name] = value[:_MAX_TEXT] if isinstance(value, str) else value
    return found


# ---------------------------------------------------------------------------------------------- formatting

def _group_indian(number: int) -> str:
    digits = str(abs(number))
    if len(digits) > 3:
        head, tail = digits[:-3], digits[-3:]
        digits = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", head) + "," + tail
    return ("-" if number < 0 else "") + digits


def _number(value: Any) -> int | None:
    try:
        return int(Decimal(str(value)))
    except (InvalidOperation, ValueError, TypeError):
        return None


def inr(value: Any) -> str:
    n = _number(value)
    return f"₹{_group_indian(n)}" if n is not None else ""


def credits(value: Any) -> str:
    n = _number(value)
    return f"{_group_indian(n)} gifting credit{'' if n == 1 else 's'}" if n is not None else "gifting credits"


def _date(value: Any) -> str:
    try:
        d = date.fromisoformat(str(value)[:10])
        return f"{d.day} {d.strftime('%b %Y')}"
    except ValueError:
        return ""


# ------------------------------------------------------------------------------------------ gift requests

def _who(d: dict[str, Any]) -> str:
    return str(d.get("recipientName") or "")


def _subject(d: dict[str, Any]) -> str:
    """"Birthday gift request for Rohan Mehta" - as much as is known."""
    occasion, who = d.get("occasionName") or d.get("eventName"), _who(d)
    if occasion and who:
        return f"{occasion} gift request for {who}"
    if who:
        return f"Gift request for {who}"
    if occasion:
        return f"{occasion} gift request"
    return f"Gift request {d['requestCode']}" if d.get("requestCode") else "A gift request"


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:]


def _request_context(d: dict[str, Any]) -> str:
    parts = []
    if d.get("requestCode"):
        parts.append(f"Request #{str(d['requestCode']).lstrip('#')}")
    if d.get("budgetMode") == "TOFAA_RECOMMEND":
        parts.append("Budget: TOFAA to recommend")
    else:
        low, high = _number(d.get("budgetMin")), _number(d.get("budgetMax") or d.get("requestedBudget"))
        if high:
            parts.append(f"Budget {inr(low)} – {inr(high)}" if low and low != high else f"Budget {inr(high)}")
    if d.get("deliveryDate"):
        parts.append(f"Deliver by {_date(d['deliveryDate'])}")
    if d.get("statusNote"):
        parts.append(str(d["statusNote"]))
    return " · ".join(parts)


def _request_line(verb: str) -> Callable[[dict[str, Any]], tuple[str, str] | None]:
    def build(d: dict[str, Any]) -> tuple[str, str] | None:
        if not (d.get("recipientName") or d.get("requestCode")):
            return None
        return f"{_subject(d)} {verb}", _request_context(d)
    return build


def _proposal_line(headline: str) -> Callable[[dict[str, Any]], tuple[str, str] | None]:
    def build(d: dict[str, Any]) -> tuple[str, str] | None:
        if not _who(d):
            return None
        return headline.format(who=_who(d), subject=_lower_first(_subject(d))), _request_context(d)
    return build


# ------------------------------------------------------------------------------------------------ credits

def _topup_added(d: dict[str, Any]) -> tuple[str, str] | None:
    n = d.get("requestedCredits")
    if _number(n) is None:
        return None
    after, delta = _number(d.get("balanceAfter")), _number(d.get("creditsDelta"))
    text = f"Gifting budget increased from {inr(after - delta)} to {inr(after)}." if after is not None and delta else "Your top-up request was approved."
    return f"{credits(n)} added to your account", text


def _adjusted(d: dict[str, Any]) -> tuple[str, str] | None:
    after, delta = _number(d.get("balanceAfter")), _number(d.get("creditsDelta"))
    if after is None or not delta:
        return None
    word = "increased" if delta > 0 else "decreased"
    return f"Gifting budget {word} from {inr(after - delta)} to {inr(after)}", str(d.get("reason") or d.get("description") or "Adjusted by TOFAA.")


def _requested(d: dict[str, Any]) -> tuple[str, str] | None:
    if _number(d.get("requestedCredits")) is None:
        return None
    due = _number(d.get("amountDueMinor"))
    return f"Top-up of {credits(d['requestedCredits'])} requested", f"{inr(due / 100)} to pay once approved." if due else "Waiting for TOFAA to review."


def _paid(d: dict[str, Any]) -> tuple[str, str] | None:
    paid = _number(d.get("paidAmountMinor"))
    if not paid:
        return None
    return f"Payment of {inr(paid / 100)} submitted", f"For the {credits(d['requestedCredits'])} top-up. TOFAA will verify it." if d.get("requestedCredits") else "TOFAA will verify it."


def _declined(label: str) -> Callable[[dict[str, Any]], tuple[str, str] | None]:
    def build(d: dict[str, Any]) -> tuple[str, str] | None:
        if _number(d.get("requestedCredits")) is None:
            return None
        return f"{label} for {credits(d['requestedCredits'])} declined", str(d.get("reviewNote") or "See the credit request for the reason.")
    return build


# ---------------------------------------------------------------------------------------------- gift spend

def _where(d: dict[str, Any]) -> str:
    return str(d.get("occasionName") or d.get("eventName") or "an occasion")


def _group_on_occasion(verb: str, with_budget: bool = True) -> Callable[[dict[str, Any]], tuple[str, str] | None]:
    def build(d: dict[str, Any]) -> tuple[str, str] | None:
        group = d.get("groupName")
        if not group:
            return None
        budget = _number(d.get("budgetCredits"))
        tail = f" with a {inr(budget)} budget" if with_budget and budget else ""
        return f"{group} {verb} {_where(d)}{tail}", "Budget mode: " + ("shared pool" if d.get("budgetMode") == "SHARED_POOL" else "per person") if budget and d.get("budgetMode") else ""
    return build


def _recipient_budget(d: dict[str, Any]) -> tuple[str, str] | None:
    budget, who = _number(d.get("budgetCredits")), _who(d)
    if not who or budget is None:
        return None
    return (f"{who} given a {inr(budget)} budget for {_where(d)}" if budget else f"{who} added to {_where(d)}, budget not set yet"), ""


def _event_budget(d: dict[str, Any]) -> tuple[str, str] | None:
    budget = _number(d.get("budgetCredits"))
    return (f"{inr(budget)} budget set for {_where(d)}", "") if budget and (d.get("eventName")) else None


def _default_budget(d: dict[str, Any]) -> tuple[str, str] | None:
    budget = _number(d.get("budgetCredits"))
    target = d.get("groupName") if d.get("targetType") == "GROUP" else _who(d)
    if not budget or not target:
        return None
    return f"Default budget for {target} set to {inr(budget)}", "Used whenever they are added to an occasion."


def _recipient_line(headline: str, tail: str) -> Callable[[dict[str, Any]], tuple[str, str] | None]:
    def build(d: dict[str, Any]) -> tuple[str, str] | None:
        who = d.get("recipientName") or d.get("name")
        return (headline.format(who=who), tail) if who else None
    return build


# (route segments, method) -> builder returning (headline, supporting line), or None when the facts are missing.
SPECIFIC: dict[tuple[tuple[str, ...], str], Callable[[dict[str, Any]], tuple[str, str] | None]] = {
    (("gift-requests",), "POST"): _request_line("created"),
    (("gift-requests",), "PATCH"): _request_line("updated"),
    (("gift-requests", "submit"), "POST"): _request_line("submitted"),
    (("gift-requests", "cancel"), "POST"): _request_line("cancelled"),
    (("gift-requests", "approve"), "POST"): _proposal_line("Gift proposal for {who} approved"),
    (("gift-requests", "request-changes"), "POST"): _proposal_line("Changes requested on the gift proposal for {who}"),
    (("gift-requests", "start-review"), "POST"): _proposal_line("TOFAA started reviewing the {subject}"),
    (("gift-requests", "request-info"), "POST"): _proposal_line("TOFAA needs more information for the {subject}"),
    (("gift-requests", "proposal"), "PUT"): _proposal_line("Gift proposal ready for {who}"),
    (("gift-requests", "reject"), "POST"): _proposal_line("The {subject} could not be taken forward"),
    (("gift-requests", "start-fulfilment"), "POST"): _proposal_line("Gift for {who} is being prepared"),
    (("gift-requests", "dispatch"), "POST"): _proposal_line("Gift for {who} dispatched"),
    (("gift-requests", "deliver"), "POST"): _proposal_line("Gift for {who} delivered"),
    (("credit-requests",), "POST"): _requested,
    (("credit-requests", "approve"), "POST"): _topup_added,
    (("credit-requests", "verify-payment"), "POST"): _topup_added,
    (("credit-requests", "payment-submission"), "POST"): _paid,
    (("credit-requests", "reject"), "POST"): _declined("Top-up"),
    (("credit-requests", "reject-payment"), "POST"): _declined("Payment"),
    (("credits", "adjustments"), "POST"): _adjusted,
    (("gift-spend", "occasions", "groups", "import"), "POST"): _group_on_occasion("added to"),
    (("gift-spend", "occasions", "groups"), "POST"): _group_on_occasion("group created for", with_budget=False),
    (("gift-spend", "occasions", "groups"), "PUT"): _group_on_occasion("updated on"),
    (("gift-spend", "occasions", "recipients", "budget"), "PUT"): _recipient_budget,
    (("gift-spend", "events", "budget"), "PUT"): _event_budget,
    (("gift-spend", "default-budgets"), "PUT"): _default_budget,
    (("recipients",), "POST"): _recipient_line("{who} added to your recipients", "A new person was added."),
    (("recipients",), "PATCH"): _recipient_line("{who}'s details updated", "Contact or profile details were changed."),
    (("recipients",), "DELETE"): _recipient_line("{who} removed from your recipients", ""),
}
# The same builders handle admin credit routes (the "admin" path segment is skipped).

# (route segments, method) -> (category, title, sentence) used when no facts are known.
RULES: dict[tuple[tuple[str, ...], str], tuple[str, str, str]] = {
    (("recipients",), "POST"): ("people", "New recipient added", "A new person was added to your recipients."),
    (("recipients",), "PATCH"): ("people", "Recipient updated", "A recipient's details were updated."),
    (("recipients",), "DELETE"): ("people", "Recipient deleted", "A recipient was removed from your recipients."),
    (("recipients", "restore"), "POST"): ("people", "Recipient restored", "A recipient was added back to your recipients."),
    (("recipients", "avatar"), "PUT"): ("people", "Recipient photo updated", "A new photo was saved for a recipient."),
    (("recipients", "avatar"), "DELETE"): ("people", "Recipient photo removed", "A recipient's photo was removed."),
    (("gift-spend", "groups"), "POST"): ("people", "Recipient group created", "A new group of recipients was created."),
    (("gift-spend", "groups"), "PUT"): ("people", "Recipient group updated", "A recipient group was changed."),
    (("gift-spend", "groups"), "DELETE"): ("people", "Recipient group deleted", "A recipient group was removed."),
    (("gift-spend", "default-budgets"), "PUT"): ("budget", "Default budget updated", "A default gifting budget was changed."),
    (("gift-spend", "default-budgets"), "DELETE"): ("budget", "Default budget removed", "A default gifting budget was removed."),
    (("gift-spend", "settings"), "PUT"): ("budget", "Budget settings updated", "Your gifting budget settings were changed."),
    (("gift-spend", "occasions", "groups", "import"), "POST"): ("budget", "Group added to an occasion", "A recipient group was added to an occasion with a budget."),
    (("gift-spend", "occasions", "groups"), "POST"): ("budget", "Group created for an occasion", "A group was created inside an occasion."),
    (("gift-spend", "occasions", "groups"), "PUT"): ("budget", "Group updated on an occasion", "A group's details or budget on an occasion were changed."),
    (("gift-spend", "occasions", "groups"), "DELETE"): ("budget", "Group removed from an occasion", "A group was taken off an occasion."),
    (("gift-spend", "occasions", "recipients", "budget"), "PUT"): ("budget", "Recipient budget set", "A budget was set for one recipient on an occasion."),
    (("gift-spend", "occasions", "recipients", "budget"), "DELETE"): ("budget", "Recipient removed from an occasion", "A recipient's budget on an occasion was removed."),
    (("gift-spend", "events", "budget"), "PUT"): ("budget", "Event budget set", "A budget was set for an event."),
    (("gift-requests",), "POST"): ("requests", "Gift request created", "A new gift request was started."),
    (("gift-requests",), "PATCH"): ("requests", "Gift request updated", "A gift request was updated."),
    (("gift-requests",), "DELETE"): ("requests", "Gift request deleted", "A gift request was deleted."),
    (("gift-requests", "submit"), "POST"): ("requests", "Gift request submitted", "A gift request was submitted to TOFAA."),
    (("gift-requests", "cancel"), "POST"): ("requests", "Gift request cancelled", "A gift request was cancelled."),
    (("gift-requests", "approve"), "POST"): ("requests", "Gift proposal approved", "A gift proposal was approved."),
    (("gift-requests", "request-changes"), "POST"): ("requests", "Changes requested", "Changes were requested on a gift proposal."),
    (("gift-requests", "start-review"), "POST"): ("requests", "Gift request in review", "TOFAA started reviewing a gift request."),
    (("gift-requests", "request-info"), "POST"): ("requests", "More information needed", "TOFAA asked for more details on a gift request."),
    (("gift-requests", "proposal"), "PUT"): ("requests", "Gift proposal ready", "TOFAA shared gift options for a request."),
    (("gift-requests", "reject"), "POST"): ("requests", "Gift request declined", "A gift request could not be taken forward."),
    (("gift-requests", "start-fulfilment"), "POST"): ("requests", "Gift being prepared", "TOFAA started preparing a gift."),
    (("gift-requests", "dispatch"), "POST"): ("requests", "Gift dispatched", "A gift is on its way."),
    (("gift-requests", "deliver"), "POST"): ("requests", "Gift delivered", "A gift was delivered."),
    (("gift-requests", "reference"), "POST"): ("requests", "Reference file added", "A reference file was added to a gift request."),
    (("gift-requests", "reference"), "PUT"): ("requests", "Reference file updated", "A reference file was changed on a gift request."),
    (("gift-requests", "reference"), "DELETE"): ("requests", "Reference file removed", "A reference file was removed from a gift request."),
    (("gift-requests", "proposal-image"), "POST"): ("requests", "Proposal image added", "An image was added to a gift proposal."),
    (("occasions", "send"), "POST"): ("requests", "Gifts sent for an occasion", "Gifts were sent for an occasion."),
    (("events", "send"), "POST"): ("requests", "Gifts sent for an event", "Gifts were sent for an event."),
    (("credit-requests",), "POST"): ("budget", "Budget top-up requested", "A request to add credits to your gifting budget was made."),
    (("credit-requests", "payment-submission"), "POST"): ("budget", "Payment submitted", "Payment details were sent for a budget top-up."),
    (("credit-requests", "payment-proof"), "POST"): ("budget", "Payment proof uploaded", "Proof of payment was uploaded for a budget top-up."),
    (("credit-requests", "approve"), "POST"): ("budget", "Budget top-up approved", "A budget top-up was approved and credits were added."),
    (("credit-requests", "reject"), "POST"): ("budget", "Budget top-up declined", "A budget top-up request was declined."),
    (("credit-requests", "verify-payment"), "POST"): ("budget", "Payment verified", "A payment was verified and credits were added."),
    (("credit-requests", "reject-payment"), "POST"): ("budget", "Payment declined", "A payment could not be verified."),
    (("credits", "adjustments"), "POST"): ("budget", "Gifting budget adjusted", "TOFAA adjusted your gifting budget."),
    (("occasions",), "POST"): ("occasions", "Occasion added", "A new occasion was added."),
    (("occasions",), "PATCH"): ("occasions", "Occasion updated", "An occasion was changed."),
    (("occasions",), "DELETE"): ("occasions", "Occasion removed", "An occasion was removed."),
    (("events",), "POST"): ("occasions", "Event added", "A new event was added."),
    (("events",), "PATCH"): ("occasions", "Event updated", "An event was changed."),
    (("events",), "DELETE"): ("occasions", "Event removed", "An event was removed."),
    (("gifts",), "POST"): ("requests", "Gift added", "A gift was added."),
    (("gifts",), "PATCH"): ("requests", "Gift updated", "A gift was changed."),
    (("gifts", "cancel"), "POST"): ("requests", "Gift cancelled", "A gift was cancelled."),
    (("users",), "POST"): ("account", "User invited", "A new user was added to your team."),
    (("users",), "PATCH"): ("account", "User updated", "A team member's details were changed."),
    (("users", "activate"), "POST"): ("account", "User activated", "A team member's access was turned on."),
    (("users", "deactivate"), "POST"): ("account", "User deactivated", "A team member's access was turned off."),
    (("users", "resend-invite"), "POST"): ("account", "Invitation resent", "An invitation email was sent again."),
}
# Changes that are bookkeeping, not something a person did on purpose.
HIDDEN = frozenset({("gift-spend", "notifications", "read")})
_CATEGORY_BY_RESOURCE = {
    "recipients": "people", "recipient-groups": "people", "gift-requests": "requests", "gifts": "requests", "gift-spend": "budget",
    "credit-requests": "budget", "credits": "budget", "occasions": "occasions", "events": "occasions",
}
_VERBS = {"POST": "added", "PUT": "updated", "PATCH": "updated", "DELETE": "removed"}


def segments(route: str) -> tuple[str, ...]:
    return tuple(p for p in route.strip("/").split("/") if p and not p.startswith("{") and p not in _SKIPPED)


def is_hidden(route: str) -> bool:
    return segments(route) in HIDDEN


def describe(method: str, route: str, details: dict[str, Any] | None = None) -> tuple[str, str, str]:
    """(category, title, supporting sentence) for one audited change. Uses the facts when it has enough of them."""
    parts, method = segments(route), method.upper()
    category, title, text = RULES.get((parts, method)) or _generic(parts, method)
    builder = SPECIFIC.get((parts, method))
    if builder and details:
        try:
            built = builder(details)
        except Exception:  # noqa: BLE001 - a odd value must never break the feed
            logger.exception("activity_describe_failed route=%s", route)
            built = None
        if built:
            headline, support = built
            return category, headline[:1].upper() + headline[1:], support or text
    return category, title, text


def _generic(parts: tuple[str, ...], method: str) -> tuple[str, str, str]:
    resource = parts[0] if parts else "tenant"
    noun = resource.replace("-", " ").rstrip("s") or "item"
    verb = _VERBS.get(method, "changed")
    return _CATEGORY_BY_RESOURCE.get(resource, "account"), f"{noun.capitalize()} {verb}", f"A {noun} was {verb}."


# ------------------------------------------------------------------------------------------- name look-ups

def resolve_facts(database: Any, rows: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """Facts that can only be found when the feed is read: names for saved ids, and the credit ledger entry.

    Returns the full fact set per audit row id (saved details + looked-up facts). Never raises.
    """
    facts: dict[int, dict[str, Any]] = {}
    for row in rows:
        merged = dict(row.get("details") or {})
        if row.get("entity_id"):
            kind = segments(row.get("route", ""))[:1]
            merged.setdefault("recipientId" if kind == ("recipients",) else "requestId" if kind == ("gift-requests",) else "entityId", str(row["entity_id"]))
        facts[row["id"]] = merged
    try:
        def gather(key: str, only: Callable[[dict[str, Any], tuple[str, ...]], bool] = lambda f, s: True) -> dict[str, list[int]]:
            found: dict[str, list[int]] = {}
            for row in rows:
                f = facts[row["id"]]
                if f.get(key) and only(f, segments(row.get("route", ""))):
                    found.setdefault(str(f[key]), []).append(row["id"])
            return found

        def assign(table: str, columns: str, ids: dict[str, list[int]], target: str, label: Callable[[dict[str, Any]], Any]) -> None:
            if not ids:
                return
            for item in database.table(table).select(columns).in_("id", sorted(ids)).execute().data or []:
                value = label(item)
                for row_id in ids.get(str(item["id"]), []):
                    if value:
                        facts[row_id].setdefault(target, value)

        assign("recipients", "id,name", gather("recipientId"), "recipientName", lambda r: r.get("name"))
        # A default budget points at a recipient or a group through targetId.
        assign("recipients", "id,name", gather("targetId", lambda f, s: f.get("targetType") == "RECIPIENT"), "recipientName", lambda r: r.get("name"))
        assign("spend_recipient_groups", "id,name", gather("groupId"), "groupName", lambda r: r.get("name"))
        assign("spend_recipient_groups", "id,name", gather("targetId", lambda f, s: f.get("targetType") == "GROUP"), "groupName", lambda r: r.get("name"))
        assign("occasions", "id,occasion_name", gather("occasionId"), "occasionName", lambda r: r.get("occasion_name"))
        assign("events", "id,event_name", gather("eventId"), "eventName", lambda r: r.get("event_name"))
        assign("gift_requests", "id,request_code,recipient_id", gather("requestId", lambda f, s: s[:1] == ("gift-requests",)), "requestCode",
               lambda r: r.get("request_code"))
        # Gift request routes that did not return the recipient: find them through the request.
        missing = {rid: ids for rid, ids in gather("requestId", lambda f, s: s[:1] == ("gift-requests",)).items()
                   if any(not facts[i].get("recipientName") for i in ids)}
        if missing:
            requests = database.table("gift_requests").select("id,recipient_id").in_("id", sorted(missing)).execute().data or []
            by_recipient = {str(r["recipient_id"]): missing[str(r["id"])] for r in requests if r.get("recipient_id")}
            for person in database.table("recipients").select("id,name").in_("id", sorted(by_recipient)).execute().data or [] if by_recipient else []:
                for row_id in by_recipient.get(str(person["id"]), []):
                    if person.get("name"):
                        facts[row_id].setdefault("recipientName", person["name"])
        ledger = gather("ledgerEntryId")
        if ledger:
            for entry in database.table("credit_ledger_entries").select("id,credits_delta,balance_after").in_("id", sorted(ledger)).execute().data or []:
                for row_id in ledger.get(str(entry["id"]), []):
                    facts[row_id].setdefault("creditsDelta", entry.get("credits_delta"))
                    facts[row_id].setdefault("balanceAfter", entry.get("balance_after"))
    except Exception:  # noqa: BLE001 - a missing name must never break the feed
        logger.exception("activity_fact_lookup_failed")
    return facts


def actor_names(database: Any, user_ids: set[str]) -> dict[str, str]:
    """Full names (or the part of the email before the @) for the given users. Never raises."""
    names: dict[str, str] = {}
    if not user_ids:
        return names
    try:
        for row in database.table("profiles").select("id,full_name,email").in_("id", sorted(user_ids)).execute().data or []:
            full = (row.get("full_name") or "").strip()
            names[str(row["id"])] = full or str(row.get("email") or "").split("@")[0] or "A team member"
    except Exception:  # noqa: BLE001
        logger.exception("activity_actor_lookup_failed")
    return names
