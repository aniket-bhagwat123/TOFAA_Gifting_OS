import { cn } from "@/lib/utils";

// Plain-language labels instead of raw system codes.
const friendly: Record<string, string> = {
  ACTIVE: "Active", INACTIVE: "Paused", PENDING: "Waiting", SUBMITTED: "Received", APPROVED: "Approved", REJECTED: "Declined", CONFIRMED: "Confirmed", DISPATCHED: "Dispatched",
  CANCELLED: "Cancelled", CANCELED: "Cancelled", DELIVERED: "Delivered", PAID: "Paid", COMPLETED: "Done", COMPLETE: "Done",
  IN_PROGRESS: "In progress", OPEN: "Open", OVERDUE: "Overdue", EXPIRED: "Expired", RESOLVED: "Resolved", UNREAD: "New", READ: "Seen",
  DUE: "Due", DISCUSSION: "In discussion", VERIFIED: "Verified", DEACTIVATED: "Paused", UNKNOWN: "—"
};

export function StatusBadge({ value }: { value?: string | boolean | null }) {
  const raw = value === true ? "ACTIVE" : value === false ? "INACTIVE" : (value || "UNKNOWN").toUpperCase();
  const status = raw === "TRUE" ? "ACTIVE" : raw === "FALSE" ? "INACTIVE" : raw;
  const good = /(^|_)(ACTIVE|APPROVED|CONFIRMED|DELIVERED|PAID|RESOLVED|COMPLETE|COMPLETED|READ|VERIFIED)(_|$)/.test(status);
  const wait = /(^|_)(PENDING|SUBMITTED|DUE|OPEN|IN_PROGRESS|DISPATCHED|DISCUSSION|UNREAD)(_|$)/.test(status);
  const bad = /INACTIVE|CANCEL|REJECT|DEACTIVATED|OVERDUE|ISSUE|EXPIRED/.test(status);
  const tone = bad ? "bg-rose-50 text-rose-700" : good ? "bg-emerald-50 text-emerald-700" : wait ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600";
  const dot = bad ? "bg-rose-500" : good ? "bg-emerald-500" : wait ? "bg-amber-500" : "bg-slate-400";
  const label = friendly[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replaceAll("_", " ");
  // Colour is never the only signal: the dot + word both carry meaning.
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold", tone)}><span className={cn("h-1.5 w-1.5 rounded-full", dot)} />{label}</span>;
}
