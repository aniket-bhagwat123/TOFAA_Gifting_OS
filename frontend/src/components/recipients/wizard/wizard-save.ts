import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { sendImage } from "@/components/ui/image-upload";
import { getApiErrorMessage } from "@/services/api-client";
import { type WizardData, normaliseMobile, occasionLabel } from "./wizard-types";
import type { DirectoryRow } from "../recipient-utils";
import type { RecipientGroup } from "../group-sheet";

export interface SaveEndpoints { recipients: string; groups: string }
export interface SaveResult {
  recipientId: string; name: string; profile: DirectoryRow | null;
  /** Parts that could not be saved. The person exists; the user can finish these later from the profile. */
  warnings: Array<{ section: string; message: string }>;
}
/** The API says "this person may already exist" with the possible matches. */
export class DuplicateFound extends Error {
  constructor(public matches: Array<{ id: string; name?: string; mobileNumber?: string; email?: string; city?: string; reasons: string[] }>) { super("duplicate"); }
}

const SOURCE = { "X-Change-Source": "MANUAL" };
const clean = (value: string) => value.trim() || null;

/** Looks for people who may already be in the client's recipients, before anything is saved. */
export async function findDuplicates(recipientsEndpoint: string, data: WizardData) {
  const { name, mobile, email } = data.details;
  const found = await getModuleRecords(`${recipientsEndpoint}/duplicates`, { name: name.trim() || undefined, mobileNumber: mobile.trim() ? normaliseMobile(mobile) : undefined, email: email.trim() || undefined });
  return (Array.isArray(found) ? found : []) as DuplicateFound["matches"];
}

/**
 * Creates the person first, then each optional part on its own, so one failing part never loses the others.
 * Everything is added to the one recipient record; nothing is copied per occasion, group or address.
 */
export async function saveWizard(data: WizardData, endpoints: SaveEndpoints, photo: File | null, groups: RecipientGroup[]): Promise<SaveResult> {
  const d = data.details;
  const birthday = data.occasions.find((o) => o.type === "Birthday");
  // A plain anniversary lives on the recipient; one shared with other people becomes its own occasion with participants.
  const anniversary = data.occasions.find((o) => o.type === "Anniversary" && !o.participants.length);
  const home = data.addresses.find((a) => a.isDefault) ?? data.addresses[0];

  const body: Record<string, unknown> = {
    name: d.name.trim(), recipientType: d.recipientType, allowDuplicate: data.allowDuplicate, isPrimary: data.relationship.isPrimary,
    mobileNumber: d.mobile.trim() ? normaliseMobile(d.mobile) : undefined, email: clean(d.email) ?? undefined, company: clean(d.company) ?? undefined,
    designation: clean(d.designation) ?? undefined, city: clean(d.city) ?? home?.city.trim() ?? undefined, relationship: data.relationship.relationship || undefined,
    dateOfBirth: birthday?.date || undefined, anniversaryDate: anniversary?.date || undefined,
    address: home ? { addressLine1: home.line1.trim(), addressLine2: clean(home.line2) ?? undefined, city: home.city.trim(), postalCode: home.postalCode.trim(), country: "IN" } : undefined,
  };
  let created: DirectoryRow;
  try {
    created = await mutateModule("post", endpoints.recipients, body, undefined, SOURCE) as DirectoryRow;
  } catch (error) {
    const reply = (error as { response?: { status?: number; data?: { data?: { duplicates?: DuplicateFound["matches"] } } } }).response;
    if (reply?.status === 409 && reply.data?.data?.duplicates?.length) throw new DuplicateFound(reply.data.data.duplicates);
    throw error;
  }
  const id = String(created.id);
  const base = `${endpoints.recipients}/${id}`;
  const tenantBase = endpoints.recipients.replace(/\/recipients$/, "");
  const warnings: SaveResult["warnings"] = [];
  const attempt = async (section: string, work: () => Promise<unknown>) => { try { await work(); } catch (error) { warnings.push({ section, message: getApiErrorMessage(error) }); } };

  if (photo) await attempt("Photo", () => sendImage("put", `${base}/avatar`, photo));

  for (const address of [...data.addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault))) {
    await attempt("Delivery address", () => mutateModule("post", `${base}/addresses`, {
      label: address.label, addressLine1: address.line1.trim(), addressLine2: clean(address.line2) ?? undefined, city: address.city.trim(), postalCode: address.postalCode.trim(), country: "IN", isDefault: address.isDefault,
    }, undefined, SOURCE));
  }

  const p = data.preferences;
  if (p.interests.length || p.brands.length || p.giftPreferences.trim() || p.dietary.trim() || p.avoid.trim() || p.instructions.trim()) {
    await attempt("Preferences", () => mutateModule("put", `${base}/preferences`, {
      interests: p.interests, preferredBrands: p.brands, giftPreferences: clean(p.giftPreferences), dietaryPreferences: clean(p.dietary), giftsToAvoid: clean(p.avoid), specialInstructions: clean(p.instructions),
    }, undefined, SOURCE));
  }

  const links = data.relationship.links.filter((link) => link.person);
  if (links.length) {
    await attempt("Relationships", () => mutateModule("put", `${base}/relationships`, { items: links.map((link) => ({ relatedRecipientId: link.person!.id, relationshipType: link.type })) }, undefined, SOURCE));
  }

  for (const occasion of data.occasions) {
    if (occasion === birthday || occasion === anniversary) continue; // already stored on the person
    await attempt(`Occasion: ${occasionLabel(occasion)}`, async () => {
      const event = await mutateModule("post", `${base}/events`, {
        eventName: occasionLabel(occasion), eventDate: occasion.date, occasionType: occasion.type, repeatAnnually: occasion.repeatAnnually, notes: clean(occasion.notes) ?? undefined,
      }, undefined, SOURCE) as { id: string };
      if (occasion.participants.length) await mutateModule("put", `${tenantBase}/events/${event.id}/participants`, { recipientIds: [id, ...occasion.participants.map((person) => person.id)] }, undefined, SOURCE);
    });
  }

  for (const groupId of data.relationship.groupIds) {
    const group = groups.find((g) => g.id === groupId);
    if (group) await attempt(`Group: ${group.name}`, () => mutateModule("put", `${endpoints.groups}/${group.id}`, { name: group.name, recipientIds: [...new Set([...group.recipientIds, id])] }));
  }
  if (data.relationship.newGroupName.trim()) {
    await attempt(`Group: ${data.relationship.newGroupName.trim()}`, () => mutateModule("post", endpoints.groups, { name: data.relationship.newGroupName.trim(), recipientIds: [id] }));
  }

  let profile: DirectoryRow | null = null;
  try { profile = await getModuleRecords(base, {}) as DirectoryRow; } catch { /* the success screen works without the score */ }
  return { recipientId: id, name: d.name.trim(), profile, warnings };
}
