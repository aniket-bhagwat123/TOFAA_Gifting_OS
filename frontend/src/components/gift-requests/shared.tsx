import { useAppSelector } from "@/store/hooks";

export type GiftStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "NEEDS_INFO" | "PROPOSAL_READY" | "CONFIRMED" | "IN_PROGRESS" | "DISPATCHED" | "DELIVERED" | "CANCELLED";

export type ProposalOption = { name: string; description?: string | null; price: number | string; imageUrl?: string | null };
export type ReferenceFile = { fileName: string; contentType: string; sizeBytes: number };
export type GiftRequest = {
  id: string; requestCode?: string | null; tenantId: string; recipientId: string; eventId?: string | null; occasionId?: string | null; createdByUserId: string;
  title: string; purpose: string; giftPreferences?: string | null; requestedBudget?: number | string | null; requestedCredits?: number | null;
  budgetMode?: "SPECIFIC" | "TOFAA_RECOMMEND"; budgetMin?: number | string | null; budgetMax?: number | string | null;
  deliveryDate?: string | null; initiatedVia?: string | null; relationship?: string | null; relationshipContext?: string | null;
  interests?: string[]; giftStyle?: "PREMIUM" | "THOUGHTFUL" | "PERSONALISED" | null; deliveryAddress?: string | null; giftPurpose?: string | null;
  message?: string | null; specialInstructions?: string | null; referenceFile?: ReferenceFile | null; status: GiftStatus;
  proposal?: { options: ProposalOption[]; note?: string | null } | null; statusNote?: string | null; selectedOptionIndex?: number | null;
  recipientName?: string | null; recipientMobile?: string | null; recipientAvatarUrl?: string | null; createdByAvatarUrl?: string | null; occasionName?: string | null; occasionDate?: string | null; eventName?: string | null; eventDate?: string | null;
  createdByName?: string | null; createdByRole?: string | null; createdAt: string; updatedAt: string;
};
export type GiftEvent = { id: string; fromStatus?: GiftStatus | null; toStatus: GiftStatus; actorName?: string | null; actorRole?: string | null; note?: string | null; createdAt: string };

export const STATUS_META: Record<GiftStatus, { label: string; chip: string; dot: string }> = {
  DRAFT: { label: "Draft", chip: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  SUBMITTED: { label: "Submitted", chip: "bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  IN_REVIEW: { label: "In review", chip: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  NEEDS_INFO: { label: "Needs information", chip: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  PROPOSAL_READY: { label: "Proposal ready", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  CONFIRMED: { label: "Confirmed", chip: "bg-teal-50 text-teal-700", dot: "bg-teal-500" },
  IN_PROGRESS: { label: "In progress", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  DISPATCHED: { label: "Dispatched", chip: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  DELIVERED: { label: "Delivered", chip: "bg-green-50 text-green-700", dot: "bg-green-500" },
  CANCELLED: { label: "Cancelled", chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};
/** The status dropdown on the list page, in the order the product spec gives. */
export const STATUS_ORDER: GiftStatus[] = ["DRAFT", "SUBMITTED", "IN_REVIEW", "NEEDS_INFO", "PROPOSAL_READY", "CONFIRMED", "IN_PROGRESS", "DISPATCHED", "DELIVERED", "CANCELLED"];

export const INITIATED_VIA: Array<{ value: string; label: string }> = [
  { value: "DIRECTOR_WHATSAPP", label: "Director (via WhatsApp)" }, { value: "DIRECTOR_EMAIL", label: "Director (via Email)" },
  { value: "DIRECTOR_CALL", label: "Director (via Call)" }, { value: "DIRECTOR_MEETING", label: "Director (in a meeting)" },
  { value: "HR_REQUEST", label: "HR request" }, { value: "SELF", label: "Self-initiated" }, { value: "OTHER", label: "Other" },
];
export const GIFT_PURPOSES: Array<{ value: string; label: string }> = [
  { value: "BUSINESS_RELATIONSHIP", label: "Business Relationship" }, { value: "CLIENT_APPRECIATION", label: "Client Appreciation" },
  { value: "EMPLOYEE_RECOGNITION", label: "Employee Recognition" }, { value: "FESTIVE_GREETING", label: "Festive Greeting" },
  { value: "PERSONAL_CELEBRATION", label: "Personal Celebration" }, { value: "THANK_YOU", label: "Thank You" }, { value: "OTHER", label: "Other" },
];
export const RELATIONSHIPS = ["Business Partner", "Client", "Employee", "Leadership", "Vendor / Supplier", "Family", "Friend", "Other"];
export const INTERESTS = ["Sports", "Books", "Wellness", "Technology", "Luxury"];
export const GIFT_STYLES: Array<{ value: "PREMIUM" | "THOUGHTFUL" | "PERSONALISED"; label: string }> = [
  { value: "PREMIUM", label: "Premium" }, { value: "THOUGHTFUL", label: "Thoughtful" }, { value: "PERSONALISED", label: "Personalised" },
];
export const labelFrom = (options: Array<{ value: string; label: string }>, value?: string | null) => options.find((option) => option.value === value)?.label ?? value ?? "";

/** "TG-0008" for display, with the leading # the design uses. */
export const codeOf = (request: { requestCode?: string | null }) => (request.requestCode ? `#${request.requestCode}` : "—");
export const initials = (name?: string | null) => (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
export const roleShort = (role?: string | null) => (role === "CLIENT" ? "EA" : role === "KAM" ? "KAM" : role === "SUPER_ADMIN" ? "TOFAA" : role ?? "");

/** Parses "3,00,000 - 5,00,000", "₹50000" or "5 lakh" style input into a range. Returns null for empty, "invalid" for bad input. */
export function parseBudget(text: string): { min: number; max: number } | null | "invalid" {
  const cleaned = text.replace(/[₹,\s]/gi, "").replace(/(rs\.?|inr)/gi, "");
  if (!cleaned) return null;
  const parts = cleaned.split(/[-–—]|to/i).filter(Boolean);
  const numbers = parts.map(Number);
  if (!parts.length || parts.length > 2 || numbers.some((value) => !Number.isFinite(value) || value <= 0 || value > 10_000_000_000)) return "invalid";
  const [min, max = min] = numbers;
  return min > max ? "invalid" : { min, max };
}
export const budgetText = (min?: number | string | null, max?: number | string | null) => {
  if (min === null || min === undefined || max === null || max === undefined) return "";
  return Number(min) === Number(max) ? String(Number(max)) : `${Number(min)} - ${Number(max)}`;
};
/** "₹3,00,000 – ₹5,00,000", or "TOFAA to recommend" when the client asked for a suggestion. */
export function budgetLabel(request: Pick<GiftRequest, "budgetMode" | "budgetMin" | "budgetMax" | "requestedBudget">) {
  if (request.budgetMode === "TOFAA_RECOMMEND") return "TOFAA to recommend";
  const max = request.budgetMax ?? request.requestedBudget;
  if (max === null || max === undefined || max === "") return "—";
  const min = request.budgetMin ?? max;
  return Number(min) === Number(max) ? inr(max) : `${inr(min)} – ${inr(max)}`;
}

export const num = (value: number) => value.toLocaleString("en-IN");
export const inr = (value: number | string | null | undefined) => (value === null || value === undefined || value === "" ? "—" : `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`);
export const day = (value?: string | null) => (value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const shortDay = (value?: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
export const dayTime = (value: string) => `${shortDay(value)}, ${new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;

export function relativeTime(value: string) {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  return day(value);
}

/** Credits needed for a price: 1 credit = ₹1, rounded up to a whole credit. */
export const creditsFor = (price: number | string, _unitPriceMinor?: number | null) => Math.max(Math.ceil(Number(price)), 1);

export function useTenantId() {
  const user = useAppSelector((state) => state.auth.user);
  const selected = useAppSelector((state) => state.modules.selectedTenantId);
  return { user, tenantId: user?.platformRole === "CLIENT" ? user.tenant?.id : selected, isClient: user?.platformRole === "CLIENT" };
}

export const inputClass = "min-h-10 w-full rounded-[9px] border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/25";

export function StatusChip({ status }: { status: GiftStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}
