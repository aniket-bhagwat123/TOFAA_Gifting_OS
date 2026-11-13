import { Cake, Gem } from "lucide-react";

export type NextOccasion = { kind: "BIRTHDAY" | "ANNIVERSARY"; label: string; date: string; daysAway: number };
export type DirectoryRow = Record<string, unknown> & {
  id?: string; name?: string; mobileNumber?: string; designation?: string | null; relationship?: string | null; status?: string;
  avatarUrl?: string | null; city?: string | null; email?: string | null; completeness?: { percent: number; needsAttention: boolean } | null; isPrimary?: boolean; groups?: Array<{ id: string; name: string }>; address?: { addressLine1?: string; city?: string; postalCode?: string }; nextOccasion?: NextOccasion | null;
};
export type Summary = { total: number; active: number; archived: number; cities: string[]; relationships: string[] };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-24" → "24 Nov 2026" without any timezone shifting. */
export function longDate(value: unknown) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : "—";
}
export const shortMonthDay = (value: unknown) => {
  const match = /^\d{4}-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  return match ? `${Number(match[2])} ${MONTHS[Number(match[1]) - 1]}` : "";
};
export const prettyMobile = (value: unknown) => { const text = String(value ?? ""); const m = /^\+91(\d{5})(\d{5})$/.exec(text); return m ? `+91 ${m[1]} ${m[2]}` : text || "—"; };
export const updatedLabel = (value?: string) => { const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? `Updated ${d.getDate()} ${MONTHS[d.getMonth()]}` : ""; };

/** Existing status-style colours, one per relationship. */
export const RELATIONSHIPS: Array<{ value: string; label: string; pill: string }> = [
  { value: "CLIENT", label: "Client", pill: "bg-emerald-50 text-emerald-700" },
  { value: "EMPLOYEE", label: "Employee", pill: "bg-blue-50 text-blue-700" },
  { value: "PARTNER", label: "Partner", pill: "bg-violet-50 text-violet-700" },
  { value: "ADVISOR", label: "Advisor", pill: "bg-amber-50 text-amber-800" },
  { value: "VENDOR", label: "Vendor", pill: "bg-sky-50 text-sky-700" },
  { value: "FAMILY", label: "Family", pill: "bg-rose-50 text-rose-700" },
  { value: "SPOUSE", label: "Spouse", pill: "bg-rose-50 text-rose-700" },
  { value: "CHILD", label: "Child", pill: "bg-rose-50 text-rose-700" },
  { value: "PARENT", label: "Parent", pill: "bg-rose-50 text-rose-700" },
  { value: "SIBLING", label: "Sibling", pill: "bg-rose-50 text-rose-700" },
  { value: "FRIEND", label: "Friend", pill: "bg-teal-50 text-teal-700" },
  { value: "OTHER", label: "Other", pill: "bg-slate-100 text-slate-700" },
];
export const relationshipMeta = (value?: string | null) => RELATIONSHIPS.find((item) => item.value === value);

export const UPCOMING_OPTIONS = [
  { value: "", label: "Any time" }, { value: "7", label: "Next 7 days" }, { value: "30", label: "Next 30 days" }, { value: "90", label: "Next 90 days" },
];

export function OccasionIcon({ kind }: { kind: NextOccasion["kind"] }) {
  const Icon = kind === "BIRTHDAY" ? Cake : Gem;
  return <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${kind === "BIRTHDAY" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><Icon size={20} /></span>;
}

/** Quotes a value for CSV, and defuses spreadsheet formulas (=, +, -, @). */
const cell = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function recipientsToCsv(rows: DirectoryRow[]) {
  const head = ["Name", "Designation", "Relationship", "Mobile", "City", "Birthday", "Anniversary", "Status"];
  const lines = rows.map((r) => [r.name, r.designation, relationshipMeta(r.relationship)?.label, r.mobileNumber, r.address?.city, r.dateOfBirth, r.anniversaryDate, r.status].map(cell).join(","));
  return [head.join(","), ...lines].join("\n");
}
