import { useAppSelector } from "@/store/hooks";

export type GiftStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "NEEDS_INFO" | "PROPOSAL_READY" | "APPROVED" | "REJECTED" | "CANCELLED";

export type ProposalOption = { name: string; description?: string | null; price: number | string; imageUrl?: string | null };
export type GiftRequest = {
  id: string; tenantId: string; recipientId: string; eventId?: string | null; occasionId?: string | null; createdByUserId: string;
  title: string; purpose: string; giftPreferences?: string | null; requestedBudget?: number | string | null; requestedCredits?: number | null;
  deliveryDate?: string | null; message?: string | null; specialInstructions?: string | null; status: GiftStatus;
  proposal?: { options: ProposalOption[]; note?: string | null } | null; statusNote?: string | null; selectedOptionIndex?: number | null;
  recipientName?: string | null; occasionName?: string | null; eventName?: string | null; eventDate?: string | null; createdByName?: string | null;
  createdAt: string; updatedAt: string;
};
export type GiftEvent = { id: string; fromStatus?: GiftStatus | null; toStatus: GiftStatus; actorName?: string | null; actorRole?: string | null; note?: string | null; createdAt: string };

export const STATUS_META: Record<GiftStatus, { label: string; chip: string; dot: string }> = {
  DRAFT: { label: "Draft", chip: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  SUBMITTED: { label: "Submitted", chip: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  IN_REVIEW: { label: "In review", chip: "bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  NEEDS_INFO: { label: "Needs info", chip: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  PROPOSAL_READY: { label: "Proposal ready", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  APPROVED: { label: "Approved", chip: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  REJECTED: { label: "Rejected", chip: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  CANCELLED: { label: "Cancelled", chip: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};

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

/** Credits needed for a price: rounded up to a whole credit. */
export const creditsFor = (price: number | string, unitPriceMinor?: number | null) => (unitPriceMinor ? Math.max(Math.ceil((Number(price) * 100) / unitPriceMinor), 1) : null);

export function useTenantId() {
  const user = useAppSelector((state) => state.auth.user);
  const selected = useAppSelector((state) => state.modules.selectedTenantId);
  return { user, tenantId: user?.platformRole === "CLIENT" ? user.tenant?.id : selected, isClient: user?.platformRole === "CLIENT" };
}

export const inputClass = "min-h-12 w-full rounded-xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";

export function StatusChip({ status }: { status: GiftStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT;
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>;
}
