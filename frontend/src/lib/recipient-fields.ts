/** The recipient fields an import file can hold, the many names people give those columns, and how a row becomes a recipient. */

export type FieldKey = "name" | "mobileNumber" | "address" | "giftingOccasion" | "dateOfBirth" | "anniversaryDate" | "birthdayBudget" | "anniversaryBudget" | "city" | "pincode" | "group";

export interface FieldDef { key: FieldKey; label: string; required?: boolean; aliases: string[]; sample: [string, string]; /** Headers containing these words never match this field. */ never?: RegExp }

export const FIELDS: FieldDef[] = [
  { key: "name", label: "Name", required: true, sample: ["Rohan Mehta", "Priya Sharma"],
    aliases: ["name", "names", "full name", "fullname", "person name", "person", "recipient", "recipient name", "contact name", "customer name", "client name", "employee name", "member name", "guest name", "beneficiary", "beneficiary name"], never: /company|business|organi[sz]ation|occasion|event|brand|father|mother|spouse/ },
  { key: "mobileNumber", label: "Mobile Number", required: true, sample: ["+919876543210", "9812345678"],
    aliases: ["mobile", "mobile number", "mobile no", "mobile no.", "mobile phone", "mob", "mob no", "phone", "phone number", "phone no", "phone no.", "ph no", "contact", "contact number", "contact no", "contact no.", "cell", "cell number", "cell phone", "cellphone", "whatsapp", "whatsapp number", "whatsapp no", "telephone", "tel", "tel no", "msisdn", "primary phone", "primary mobile"] },
  { key: "address", label: "Address", sample: ["12 Marine Drive", "45 MG Road"],
    aliases: ["address", "address line 1", "address line1", "address1", "addr", "street", "street address", "full address", "delivery address", "residential address", "home address", "shipping address", "postal address", "mailing address", "current address", "permanent address"], never: /e-?mail|web|url|\bip\b/ },
  { key: "giftingOccasion", label: "Gifting Occasion", sample: ["Diwali", "Birthday"],
    aliases: ["gifting occasion", "gift occasion", "occasion", "occasions", "occasion name", "occasion type", "gifting event", "event", "event name", "festival", "celebration", "gift for"] },
  { key: "dateOfBirth", label: "Date of Birth", sample: ["1990-11-09", "1985-03-21"],
    aliases: ["date of birth", "dob", "d.o.b", "d o b", "birth date", "birthdate", "birthday", "birthday date", "born on", "date of birthday", "bday", "b day"], never: /budget|amount|gift|price|cost/ },
  { key: "anniversaryDate", label: "Date of Anniversary", sample: ["2015-02-14", ""],
    aliases: ["date of anniversary", "anniversary", "anniversary date", "wedding anniversary", "marriage anniversary", "wedding date", "marriage date", "doa", "d.o.a", "anniv", "anniversary day"], never: /budget|amount|gift|price|cost/ },
  { key: "birthdayBudget", label: "Birthday Budget", sample: ["3000", "2500"],
    aliases: ["birthday budget", "bday budget", "b day budget", "birthday gift budget", "birthday gift amount", "birthday amount", "birthday price", "budget for birthday", "budget birthday", "dob budget", "birthday spend", "birthday gift value"] },
  { key: "anniversaryBudget", label: "Anniversary Budget", sample: ["5000", ""],
    aliases: ["anniversary budget", "anniv budget", "anniversary gift budget", "anniversary gift amount", "anniversary amount", "anniversary price", "budget for anniversary", "budget anniversary", "wedding anniversary budget", "marriage anniversary budget", "anniversary spend", "anniversary gift value"] },
  { key: "city", label: "City", sample: ["Mumbai", "Pune"],
    aliases: ["city", "city name", "town", "town city", "city town", "location city", "district city"] },
  { key: "pincode", label: "Pincode", sample: ["400020", "411001"],
    aliases: ["pincode", "pin code", "pin", "pin no", "postal code", "postalcode", "postcode", "post code", "zip", "zip code", "zipcode", "postal", "area code", "pin number"] },
  { key: "group", label: "Group", sample: ["Key Clients", "Family; Key Clients"],
    aliases: ["group", "groups", "group name", "group names", "recipient group", "recipient groups", "add to group", "add to the group", "add to groups", "team", "teams", "list", "segment", "audience"], never: /age|budget|id\b/ },
];

export const norm = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");

function distance(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) { const keep = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1)); last = keep; }
  }
  return prev[b.length];
}

/** How well a file column matches a field: 100 for a known name, 60 when it contains one, 50 for a one-letter typo, 0 for none. */
function score(header: string, field: FieldDef): number {
  const raw = header.toLowerCase();
  if (field.never?.test(raw)) return 0;
  const h = norm(header);
  if (!h) return 0;
  const aliases = [...field.aliases.map(norm), norm(field.label)];
  if (aliases.includes(h)) return 100;
  let best = 0;
  for (const a of aliases) {
    if (a.length >= 6 && h.includes(a)) best = Math.max(best, 60 + Math.min(a.length, 20) / 10);
    else if (a.length >= 5 && h.length >= 5 && distance(h, a) <= 1) best = Math.max(best, 50);
  }
  return best;
}

/** Picks the file column for each field, best matches first, never using one column twice. */
export function autoMap(headers: string[]): Record<FieldKey, string | null> {
  const pairs = FIELDS.flatMap((field) => headers.map((header) => ({ field: field.key, header, score: score(header, field) }))).filter((p) => p.score > 0).sort((a, b) => b.score - a.score);
  const map = Object.fromEntries(FIELDS.map((f) => [f.key, null])) as Record<FieldKey, string | null>;
  const used = new Set<string>();
  for (const p of pairs) { if (map[p.field] === null && !used.has(p.header)) { map[p.field] = p.header; used.add(p.header); } }
  return map;
}

// ---------------------------------------------------------------------------------------------- values
const text = (value: unknown) => (typeof value === "number" ? (Number.isInteger(value) ? String(value) : String(value)) : String(value ?? "").trim());

/** "9876543210", "+91 98765-43210", "09876543210" or a number from Excel -> "+919876543210". Returns null when it isn't a phone number. */
export function parseMobile(value: unknown): string | null {
  let raw = typeof value === "number" ? value.toLocaleString("fullwide", { useGrouping: false }) : text(value);
  raw = raw.replace(/\.0+$/, "");
  const plus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  let out: string;
  if (plus) out = `+${digits}`;
  else if (digits.length === 10) out = `+91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) out = `+91${digits.slice(1)}`;
  else if (digits.length === 12 && digits.startsWith("91")) out = `+${digits}`;
  else out = `+${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(out) ? out : null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
const validYmd = (y: number, m: number, d: number) => { const date = new Date(y, m - 1, d); return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d; };
const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Understands 2025-11-09, 09/11/2025, 9-Nov-2025, "9 November 1990", an Excel date number, or a date already read from Excel. Returns yyyy-mm-dd or null. */
export function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (value > 59 && value < 80000) { const d = new Date(Math.round((value - 25569) * 86400 * 1000)); return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } // Excel serial date
    return null;
  }
  const s = text(value);
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(s);
  if (m) return validYmd(+m[1], +m[2], +m[3]) ? ymd(+m[1], +m[2], +m[3]) : null;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s); // day first, as is usual in India
  if (m) { const y = m[3].length === 2 ? (+m[3] > 30 ? 1900 + +m[3] : 2000 + +m[3]) : +m[3]; return validYmd(y, +m[2], +m[1]) ? ymd(y, +m[2], +m[1]) : null; }
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s,.-]+(\d{2,4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) { const y = m[3].length === 2 ? (+m[3] > 30 ? 1900 + +m[3] : 2000 + +m[3]) : +m[3]; return validYmd(y, MONTHS[m[2].toLowerCase()], +m[1]) ? ymd(y, MONTHS[m[2].toLowerCase()], +m[1]) : null; }
  m = /^([A-Za-z]{3,9})[\s-](\d{1,2})(?:st|nd|rd|th)?[\s,.-]+(\d{4})$/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) return validYmd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) ? ymd(+m[3], MONTHS[m[1].toLowerCase()], +m[2]) : null;
  return null;
}

/** "₹3,000", "Rs. 2500", "3000.50" or a number -> 3000. Returns null when it isn't an amount. */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  const s = text(value).replace(/(rs\.?|inr|₹|\/-)/gi, "").replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export interface BuiltRow { name: string; mobile: string; payload?: Record<string, unknown>; /** Groups this person goes into; a cell can hold several, separated by ; | or a comma. */ groups: string[]; errors: string[]; warnings: string[] }

/** Turns one row of the file into a recipient to create, with what is wrong (errors stop the row) or only worth noting (warnings). */
export function buildRecipient(get: (key: FieldKey) => unknown, today = new Date()): BuiltRow {
  const errors: string[] = []; const warnings: string[] = [];
  const name = text(get("name"));
  const mobileRaw = get("mobileNumber");
  const mobile = parseMobile(mobileRaw);
  if (!name) errors.push("Name is missing.");
  if (!text(mobileRaw)) errors.push("Mobile number is missing."); else if (!mobile) errors.push("Mobile number is not valid.");
  const payload: Record<string, unknown> = { name, mobileNumber: mobile ?? undefined };

  const addressText = text(get("address"));
  const city = text(get("city"));
  let pin = text(get("pincode")).replace(/\.0+$/, "").replace(/\s/g, "");
  if (!pin && addressText) pin = /(?<!\d)([1-9]\d{5})(?!\d)/.exec(addressText)?.[1] ?? "";
  if (city) payload.city = city.slice(0, 100);
  if (addressText || pin) {
    if (addressText.length >= 3 && city && /^[1-9]\d{5}$/.test(pin)) payload.address = { addressLine1: addressText.slice(0, 300), city: city.slice(0, 100), postalCode: pin, country: "IN" };
    else {
      payload.remark = `Address: ${[addressText, city, pin].filter(Boolean).join(", ")}`.slice(0, 2000);
      warnings.push("Address saved as a note. It needs the address, city and a 6-digit pincode together.");
    }
  }

  const todayIso = ymd(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const dobRaw = get("dateOfBirth");
  if (text(dobRaw)) {
    const dob = parseDate(dobRaw);
    if (!dob) warnings.push("Date of birth ignored: not a valid date."); else if (dob > todayIso) warnings.push("Date of birth ignored: it is in the future."); else payload.dateOfBirth = dob;
  }
  const annRaw = get("anniversaryDate");
  if (text(annRaw)) { const ann = parseDate(annRaw); if (!ann) warnings.push("Anniversary date ignored: not a valid date."); else payload.anniversaryDate = ann; }

  for (const [key, field, label] of [["birthdayBudget", "birthdayBudget", "Birthday budget"], ["anniversaryBudget", "anniversaryBudget", "Anniversary budget"]] as const) {
    const raw = get(key);
    if (!text(raw)) continue;
    const amount = parseAmount(raw);
    if (amount === null) warnings.push(`${label} ignored: not an amount.`); else payload[field] = amount;
  }
  const occasion = text(get("giftingOccasion"));
  if (occasion) payload.giftingOccasion = occasion.slice(0, 200);
  const groups: string[] = [];
  for (const part of text(get("group")).split(/[;|,\n]/)) {
    const g = part.trim().slice(0, 100);
    if (g && !groups.some((x) => x.toLowerCase() === g.toLowerCase())) groups.push(g);
  }
  return { name, mobile: mobile ?? text(mobileRaw), payload: errors.length ? undefined : payload, groups, errors, warnings };
}

// ---------------------------------------------------------------------------------------------- export
export const FIELD_HEADERS = FIELDS.map((f) => f.label);

/** One recipient as the cells of an export row, in the same order and names as the import template. */
export function recipientToCells(r: Record<string, unknown>): unknown[] {
  const a = (r.address ?? {}) as Record<string, unknown>;
  const line = [a.addressLine1, a.addressLine2].filter(Boolean).join(", ");
  const by: Record<FieldKey, unknown> = {
    name: r.name ?? "", mobileNumber: r.mobileNumber ?? "", address: line, giftingOccasion: r.giftingOccasion ?? "",
    dateOfBirth: r.dateOfBirth ?? "", anniversaryDate: r.anniversaryDate ?? "", birthdayBudget: r.birthdayBudget ?? "", anniversaryBudget: r.anniversaryBudget ?? "",
    city: r.city ?? a.city ?? "", pincode: a.postalCode ?? "",
    group: Array.isArray(r.groups) ? (r.groups as Array<{ name?: string }>).map((g) => g.name).filter(Boolean).join("; ") : "",
  };
  return FIELDS.map((f) => by[f.key]);
}

export const templateRows = () => [0, 1].map((i) => FIELDS.map((f) => f.sample[i]));
