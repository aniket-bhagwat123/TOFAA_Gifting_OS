import { Building2, CalendarDays, Cake, CheckCircle2, Clock, Coins, Gift, Heart, PartyPopper, Send, Star, Hourglass, type LucideIcon } from "lucide-react";

export type Status = "NOT_PLANNED" | "BUDGET_ALLOCATED" | "REQUEST_SUBMITTED" | "AWAITING_APPROVAL" | "IN_PROGRESS" | "DELIVERED";
export type Tab = "ALL" | "NOT_PLANNED" | "BUDGET_ALLOCATED" | "REQUEST_SUBMITTED" | "IN_PROGRESS" | "DELIVERED";
export type Kind = "BIRTHDAY" | "ANNIVERSARY" | "WORK_ANNIVERSARY" | "EVENT" | "FESTIVAL" | "COMPANY_EVENT";
export type Priority = "NORMAL" | "HIGH" | "VIP";
export type Sort = "soonest" | "priority" | "name";

export type OpenRequest = { id: string; requestCode?: string | null; status: string; recipientId?: string | null };
export type OverviewItem = {
  key: string; sourceDate?: string | null; sourceType: "RECIPIENT" | "COMPANY"; kind: Kind; label: string; name: string; date: string; daysAway: number;
  status: Status; tab: Tab; priority: Priority; repeatAnnually: boolean; notes?: string | null; description?: string | null;
  recipientId?: string | null; recipientAvatarUrl?: string | null; relationship?: string | null; eventId?: string | null; occasionId?: string | null;
  isGlobal: boolean; budget?: number | null; requestId?: string | null; requests: OpenRequest[]; needsAttention: boolean; score: number;
};
export type Overview = { items: OverviewItem[]; counts: Record<Tab, number>; pagination: { page: number; limit: number; totalRecords: number; totalPages?: number }; nextCursor?: string | null; dateFrom: string; dateTo: string };

export const TABS: Array<{ key: Tab; label: string }> = [
  { key: "ALL", label: "All" }, { key: "NOT_PLANNED", label: "Not Planned" }, { key: "BUDGET_ALLOCATED", label: "Budget Allocated" },
  { key: "REQUEST_SUBMITTED", label: "Request Submitted" }, { key: "IN_PROGRESS", label: "In Progress" }, { key: "DELIVERED", label: "Delivered" },
];
export const SORTS: Array<{ key: Sort; label: string }> = [{ key: "soonest", label: "Soonest first" }, { key: "priority", label: "Priority" }, { key: "name", label: "Recipient name" }];
export const RANGES = [{ value: "30", label: "Next 30 days" }, { value: "60", label: "Next 60 days" }, { value: "90", label: "Next 90 days" }, { value: "custom", label: "Custom" }];

export const STATUS_META: Record<Status, { label: string; chip: string; icon: LucideIcon }> = {
  NOT_PLANNED: { label: "Not planned", chip: "bg-amber-50 text-amber-800", icon: Clock },
  BUDGET_ALLOCATED: { label: "Budget allocated", chip: "bg-lime-50 text-lime-800", icon: Coins },
  REQUEST_SUBMITTED: { label: "Request submitted", chip: "bg-blue-50 text-blue-700", icon: Send },
  AWAITING_APPROVAL: { label: "Awaiting approval", chip: "bg-emerald-50 text-emerald-700", icon: Hourglass },
  IN_PROGRESS: { label: "In progress", chip: "bg-violet-50 text-violet-700", icon: Gift },
  DELIVERED: { label: "Delivered", chip: "bg-green-50 text-green-700", icon: CheckCircle2 },
};

export const KIND_META: Record<Kind, { icon: LucideIcon; tint: string }> = {
  BIRTHDAY: { icon: Cake, tint: "bg-rose-50 text-rose-600" },
  ANNIVERSARY: { icon: Heart, tint: "bg-amber-50 text-amber-600" },
  WORK_ANNIVERSARY: { icon: Star, tint: "bg-amber-50 text-amber-600" },
  EVENT: { icon: CalendarDays, tint: "bg-brand-soft text-brand" },
  FESTIVAL: { icon: PartyPopper, tint: "bg-orange-50 text-orange-600" },
  COMPANY_EVENT: { icon: Building2, tint: "bg-brand-soft text-brand" },
};

export type ActionKind = "plan" | "create" | "request" | "track" | "details";
/** What the row's button does, from where the occasion is in the gifting flow. */
export function actionFor(item: Pick<OverviewItem, "status" | "requestId">): { kind: ActionKind; label: string } {
  switch (item.status) {
    case "NOT_PLANNED": return { kind: "plan", label: "Plan Gift" };
    case "BUDGET_ALLOCATED": return { kind: "create", label: "Create Request" };
    case "REQUEST_SUBMITTED":
    case "AWAITING_APPROVAL": return item.requestId ? { kind: "request", label: "View Request" } : { kind: "details", label: "View Details" };
    case "IN_PROGRESS": return item.requestId ? { kind: "track", label: "Track Progress" } : { kind: "details", label: "View Details" };
    default: return { kind: "details", label: "View Details" };
  }
}

export const countdownText = (days: number) => days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : days > 0 ? `in ${days} days` : `${-days} days ago`;
export const isoOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export const parseIso = (value: string) => new Date(`${value}T00:00:00`);
