import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { type AddressItem, type LinkType, type OccasionItem, type WizardData, OCCASION_TYPES, isDateOfBirth, newKey, occasionLabel } from "./wizard-types";
import type { DirectoryRow } from "../recipient-utils";
import type { RecipientGroup } from "../group-sheet";
import type { SaveEndpoints } from "./wizard-save";

/** Edit mode: everything the recipient already has is loaded into the same form the Add flow uses. */

type Raw = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value : "");
const SOURCE = { "X-Change-Source": "MANUAL" };
const clean = (value: string) => value.trim() || null;

// Keys tell the save step where an item came from: "dob" and "anniv" live on the person, "event:<id>" and "address:<id>" are their own records.
const isEventKey = (key: string) => key.startsWith("event:");
const isAddressKey = (key: string) => key.startsWith("address:");
const eventId = (key: string) => key.slice("event:".length);
const addressId = (key: string) => key.slice("address:".length);

const safe = async <T,>(work: () => Promise<T>, fallback: T): Promise<T> => { try { return await work(); } catch { return fallback; } };

export async function loadEditData(endpoints: SaveEndpoints, row: DirectoryRow, groups: RecipientGroup[], base: WizardData): Promise<WizardData> {
  const id = String(row.id);
  const url = `${endpoints.recipients}/${id}`;
  const [full, prefs, addresses, relationships, events] = await Promise.all([
    safe(() => getModuleRecords(url, {}) as Promise<Raw>, row as Raw),
    safe(() => getModuleRecords(`${url}/preferences`, {}) as Promise<Raw>, {}),
    safe(() => getModuleRecords(`${url}/addresses`, {}) as Promise<Raw[]>, []),
    safe(() => getModuleRecords(`${url}/relationships`, {}) as Promise<Raw[]>, []),
    safe(() => getModuleRecords(`${url}/events`, { limit: 100 }) as Promise<{ items?: Raw[] }>, { items: [] }),
  ]);

  const occasions: OccasionItem[] = [];
  const dob = text(full.dateOfBirth); if (dob) occasions.push({ key: "dob", type: "Birthday", name: "", date: dob, repeatAnnually: true, notes: "", participants: [] });
  const anniversary = text(full.anniversaryDate); if (anniversary) occasions.push({ key: "anniv", type: "Anniversary", name: "", date: anniversary, repeatAnnually: true, notes: "", participants: [] });
  for (const event of events.items ?? []) {
    const kind = text(event.occasionType);
    const known = (OCCASION_TYPES as readonly string[]).includes(kind) && kind !== "Custom";
    const date = text(event.eventDate).slice(0, 10);
    if (known && kind === "Birthday" && dob) continue;
    occasions.push({ key: `event:${text(event.id)}`, type: known ? kind : "Custom", name: known ? "" : text(event.eventName), date, repeatAnnually: event.repeatAnnually === true, notes: text(event.notes), participants: [] });
  }

  let addressItems: AddressItem[] = (Array.isArray(addresses) ? addresses : []).map((a) => ({
    key: `address:${text(a.id)}`, label: (text(a.label) as AddressItem["label"]) || "PERMANENT", line1: text(a.addressLine1), line2: text(a.addressLine2),
    city: text(a.city), postalCode: text(a.postalCode), isDefault: a.isDefault === true,
  }));
  const single = full.address as Raw | null | undefined;
  if (!addressItems.length && single && text(single.addressLine1)) {
    addressItems = [{ key: newKey(), label: "PERMANENT", line1: text(single.addressLine1), line2: text(single.addressLine2), city: text(single.city), postalCode: text(single.postalCode), isDefault: true }];
  }

  const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);
  return {
    ...base,
    details: {
      ...base.details,
      name: text(full.name) || base.details.name, mobile: text(full.mobileNumber), email: text(full.email), city: text(full.city) || text(single?.city),
      company: text(full.company), designation: text(full.designation),
    },
    relationship: {
      ...base.relationship, relationship: text(full.relationship), isPrimary: full.isPrimary === true,
      groupIds: groups.filter((g) => g.recipientIds.includes(id)).map((g) => g.id),
      links: (Array.isArray(relationships) ? relationships : []).map((r) => ({ key: newKey(), person: { id: text(r.relatedRecipientId), name: text(r.relatedName) || "Recipient" }, type: (text(r.relationshipType) as LinkType) || "OTHER" })),
    },
    occasions,
    preferences: {
      interests: list(prefs.interests), brands: list(prefs.preferredBrands), giftPreferences: text(prefs.giftPreferences), dietary: text(prefs.dietaryPreferences),
      avoid: text(prefs.giftsToAvoid), instructions: text(prefs.specialInstructions),
    },
    addresses: addressItems,
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Fields that live on the recipient record itself (birthday, anniversary and the main address). */
export function personFields(current: WizardData, original: WizardData) {
  const pick = (data: WizardData, type: string) => data.occasions.find((o) => o.type === type && !isEventKey(o.key) && (type !== "Anniversary" || !o.participants.length) && (type !== "Birthday" || isDateOfBirth(o)));
  const fields: Record<string, unknown> = {};
  const [birthday, was] = [pick(current, "Birthday"), pick(original, "Birthday")];
  if (birthday?.date !== was?.date) fields.dateOfBirth = birthday?.date || null;
  const [anniversary, wasAnniversary] = [pick(current, "Anniversary"), pick(original, "Anniversary")];
  if (anniversary?.date !== wasAnniversary?.date) fields.anniversaryDate = anniversary?.date || null;
  const home = current.addresses.find((a) => a.isDefault) ?? current.addresses[0];
  const wasHome = original.addresses.find((a) => a.isDefault) ?? original.addresses[0];
  if (home && !same(home, wasHome)) fields.address = { addressLine1: home.line1.trim(), addressLine2: clean(home.line2) ?? undefined, city: home.city.trim(), postalCode: home.postalCode.trim(), country: "IN" };
  return fields;
}

/** Saves only what changed in the parts that are their own records. Returns what could not be saved. */
export async function saveEditParts(current: WizardData, original: WizardData, endpoints: SaveEndpoints, recipientId: string, groups: RecipientGroup[]): Promise<string[]> {
  const base = `${endpoints.recipients}/${recipientId}`;
  const tenantBase = endpoints.recipients.replace(/\/recipients$/, "");
  const failed: string[] = [];
  const attempt = async (section: string, work: () => Promise<unknown>) => { try { await work(); } catch { failed.push(section); } };

  // Delivery addresses
  const addressBody = (a: AddressItem) => ({ label: a.label, addressLine1: a.line1.trim(), addressLine2: clean(a.line2) ?? undefined, city: a.city.trim(), postalCode: a.postalCode.trim(), country: "IN", isDefault: a.isDefault });
  for (const old of original.addresses.filter((a) => isAddressKey(a.key))) {
    if (!current.addresses.some((a) => a.key === old.key)) await attempt("Delivery address", () => mutateModule("delete", `${base}/addresses/${addressId(old.key)}`, undefined, undefined, SOURCE));
  }
  for (const a of [...current.addresses].sort((x, y) => Number(y.isDefault) - Number(x.isDefault))) {
    const old = original.addresses.find((o) => o.key === a.key);
    if (!old) { if (a.line1.trim()) await attempt("Delivery address", () => mutateModule("post", `${base}/addresses`, addressBody(a), undefined, SOURCE)); }
    else if (!same(old, a) && isAddressKey(a.key)) await attempt("Delivery address", () => mutateModule("patch", `${base}/addresses/${addressId(a.key)}`, addressBody(a), undefined, SOURCE));
  }

  // Preferences
  const p = current.preferences;
  if (!same(p, original.preferences)) {
    await attempt("Preferences", () => mutateModule("put", `${base}/preferences`, {
      interests: p.interests, preferredBrands: p.brands, giftPreferences: clean(p.giftPreferences), dietaryPreferences: clean(p.dietary), giftsToAvoid: clean(p.avoid), specialInstructions: clean(p.instructions),
    }, undefined, SOURCE));
  }

  // Linked people
  const links = (data: WizardData) => data.relationship.links.filter((l) => l.person).map((l) => [l.person!.id, l.type]);
  if (!same(links(current), links(original))) {
    await attempt("Relationships", () => mutateModule("put", `${base}/relationships`, { items: links(current).map(([relatedRecipientId, relationshipType]) => ({ relatedRecipientId, relationshipType })) }, undefined, SOURCE));
  }

  // Occasions that are their own events
  const eventBody = (o: OccasionItem) => ({ eventName: occasionLabel(o), eventDate: o.date, occasionType: o.type, repeatAnnually: o.repeatAnnually, notes: clean(o.notes) ?? undefined });
  const ownedByPerson = (o: OccasionItem) => !isEventKey(o.key) && ((o.type === "Birthday" && isDateOfBirth(o)) || (o.type === "Anniversary" && !o.participants.length));
  for (const old of original.occasions.filter((o) => isEventKey(o.key))) {
    if (!current.occasions.some((o) => o.key === old.key)) await attempt(`Occasion: ${occasionLabel(old)}`, () => mutateModule("delete", `${tenantBase}/events/${eventId(old.key)}`, undefined, undefined, SOURCE));
  }
  for (const o of current.occasions) {
    if (ownedByPerson(o)) continue;
    const old = original.occasions.find((x) => x.key === o.key);
    if (old && same(old, o)) continue;
    if (old && isEventKey(o.key)) await attempt(`Occasion: ${occasionLabel(o)}`, () => mutateModule("patch", `${tenantBase}/events/${eventId(o.key)}`, eventBody(o), undefined, SOURCE));
    else if (!old) {
      await attempt(`Occasion: ${occasionLabel(o)}`, async () => {
        const event = await mutateModule("post", `${base}/events`, eventBody(o), undefined, SOURCE) as { id: string };
        if (o.participants.length) await mutateModule("put", `${tenantBase}/events/${event.id}/participants`, { recipientIds: [recipientId, ...o.participants.map((x) => x.id)] }, undefined, SOURCE);
      });
    }
  }

  // Groups
  const wanted = new Set(current.relationship.groupIds);
  const had = new Set(original.relationship.groupIds);
  for (const group of groups) {
    if (wanted.has(group.id) === had.has(group.id)) continue;
    const ids = wanted.has(group.id) ? [...new Set([...group.recipientIds, recipientId])] : group.recipientIds.filter((id) => id !== recipientId);
    await attempt(`Group: ${group.name}`, () => mutateModule("put", `${endpoints.groups}/${group.id}`, { name: group.name, recipientIds: ids }));
  }
  if (current.relationship.newGroupName.trim()) {
    await attempt(`Group: ${current.relationship.newGroupName.trim()}`, () => mutateModule("post", endpoints.groups, { name: current.relationship.newGroupName.trim(), recipientIds: [recipientId] }));
  }
  return failed;
}
