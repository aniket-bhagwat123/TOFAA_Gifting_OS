/** What the Add Recipient wizard collects, how it is checked, and how a half-finished draft is kept. */

export type RecipientType = "INDIVIDUAL" | "BUSINESS";
export type LinkType = "SPOUSE" | "SON" | "DAUGHTER" | "PARENT" | "SIBLING" | "BUSINESS_ASSOCIATE" | "COLLEAGUE" | "OTHER";
export type AddressLabel = "OFFICE" | "RESIDENTIAL" | "OTHER";
export type PersonRef = { id: string; name: string };

export interface DetailsData {
  name: string; mobile: string; email: string; city: string; company: string; designation: string; recipientType: RecipientType;
}
export interface RelationshipData {
  relationship: string; isPrimary: boolean; groupIds: string[]; newGroupName: string; links: Array<{ key: string; person: PersonRef | null; type: LinkType }>;
}
export interface OccasionItem {
  key: string; type: string; name: string; date: string; repeatAnnually: boolean; notes: string; participants: PersonRef[];
}
export interface PreferencesData {
  interests: string[]; brands: string[]; giftPreferences: string; dietary: string; avoid: string; instructions: string;
}
export interface AddressItem {
  key: string; label: AddressLabel; line1: string; line2: string; city: string; postalCode: string; isDefault: boolean;
}
export interface WizardData {
  details: DetailsData; relationship: RelationshipData; occasions: OccasionItem[]; preferences: PreferencesData; addresses: AddressItem[];
  /** The user has seen the possible matches and says this is a different person. */
  allowDuplicate: boolean;
}

export const EMPTY: WizardData = {
  details: { name: "", mobile: "", email: "", city: "", company: "", designation: "", recipientType: "INDIVIDUAL" },
  relationship: { relationship: "", isPrimary: false, groupIds: [], newGroupName: "", links: [] },
  occasions: [],
  preferences: { interests: [], brands: [], giftPreferences: "", dietary: "", avoid: "", instructions: "" },
  addresses: [],
  allowDuplicate: false,
};

export const STEPS = [
  { key: "details", label: "Recipient Details" },
  { key: "relationship", label: "Relationship & Group" },
  { key: "occasions", label: "Occasions" },
  { key: "preferences", label: "Preferences & Delivery" },
  { key: "review", label: "Review & Save" },
] as const;

export const LINK_TYPES: Array<{ value: LinkType; label: string }> = [
  { value: "SPOUSE", label: "Spouse" }, { value: "SON", label: "Son" }, { value: "DAUGHTER", label: "Daughter" }, { value: "PARENT", label: "Parent" },
  { value: "SIBLING", label: "Sibling" }, { value: "BUSINESS_ASSOCIATE", label: "Business associate" }, { value: "COLLEAGUE", label: "Colleague" }, { value: "OTHER", label: "Other" },
];
export const OCCASION_TYPES = ["Birthday", "Anniversary", "Work anniversary", "Custom"] as const;
export const ADDRESS_LABELS: Array<{ value: AddressLabel; label: string }> = [{ value: "OFFICE", label: "Office" }, { value: "RESIDENTIAL", label: "Residential" }, { value: "OTHER", label: "Other" }];

let counter = 0;
export const newKey = () => `k${Date.now().toString(36)}${(counter++).toString(36)}`;

// ---------------------------------------------------------------------------------------------- checks
/** "+91 98765-43210", "9876543210" → "+919876543210". Anything that isn't a plausible number comes back as typed. */
export function normaliseMobile(value: string): string {
  const compact = value.replace(/[\s()-]/g, "");
  return /^[6-9]\d{9}$/.test(compact) ? `+91${compact}` : compact;
}
export const MOBILE_OK = /^\+?[1-9][0-9]{7,14}$/;
export const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type Errors = Record<string, string>;

export function validateDetails(data: DetailsData): Errors {
  const errors: Errors = {};
  if (!data.name.trim()) errors.name = "Please enter the full name.";
  else if (data.name.trim().length > 200) errors.name = "That name is too long.";
  if (data.mobile.trim() && !MOBILE_OK.test(normaliseMobile(data.mobile))) errors.mobile = "Enter a mobile number like 98765 43210.";
  if (data.email.trim() && !EMAIL_OK.test(data.email.trim())) errors.email = "Enter an email like name@company.com.";
  if (data.designation.length > 120) errors.designation = "Keep this under 120 characters.";
  return errors;
}

export function validateOccasion(item: OccasionItem, existing: OccasionItem[]): Errors {
  const errors: Errors = {};
  if (!item.date) errors.date = "Please pick a date.";
  if (item.type === "Custom" && !item.name.trim()) errors.name = "Give this occasion a name.";
  if (item.type === "Birthday" && existing.some((o) => o.type === "Birthday" && o.key !== item.key)) errors.type = "A birthday is already added.";
  const label = occasionLabel(item).toLowerCase();
  if (item.date && existing.some((o) => o.key !== item.key && o.date === item.date && occasionLabel(o).toLowerCase() === label)) errors.date = "This occasion is already added.";
  return errors;
}
export const occasionLabel = (item: Pick<OccasionItem, "type" | "name">) => (item.type === "Custom" ? item.name.trim() || "Custom occasion" : item.type);

export function validateAddress(item: AddressItem): Errors {
  const errors: Errors = {};
  if (item.line1.trim().length < 3) errors.line1 = "Please enter the address.";
  if (!item.city.trim()) errors.city = "Please enter the city.";
  if (!/^[0-9]{6}$/.test(item.postalCode.trim())) errors.postalCode = "PIN code should be 6 digits.";
  return errors;
}

// ------------------------------------------------------------------------------------------------ draft
export const draftKey = (userId?: string, tenantId?: string) => `tofaa-recipient-draft:${userId ?? "me"}:${tenantId ?? "none"}`;
export interface SavedDraft { data: WizardData; step: number; savedAt: string }

export function loadDraft(key: string): SavedDraft | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null") as SavedDraft | null;
    return parsed?.data ? { ...parsed, data: { ...EMPTY, ...parsed.data } } : null;
  } catch { return null; }
}
export function storeDraft(key: string, data: WizardData, step: number) {
  try { window.localStorage.setItem(key, JSON.stringify({ data, step, savedAt: new Date().toISOString() } satisfies SavedDraft)); } catch { /* private mode: the wizard still works */ }
}
export function clearDraft(key: string) { try { window.localStorage.removeItem(key); } catch { /* nothing to clear */ } }
/** Has the person typed anything worth keeping? */
export const hasContent = (data: WizardData) => JSON.stringify({ ...data, allowDuplicate: false }) !== JSON.stringify(EMPTY);
