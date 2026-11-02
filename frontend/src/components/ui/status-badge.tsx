import { cn } from "@/lib/utils";
export function StatusBadge({ value }: { value?: string | boolean | null }) {
  const raw = value === true ? "ACTIVE" : value === false ? "INACTIVE" : (value || "UNKNOWN").toUpperCase();
  const status = raw === "TRUE" ? "ACTIVE" : raw === "FALSE" ? "INACTIVE" : raw;
  const tone = /(^|_)(ACTIVE|APPROVED|DELIVERED|PAID|RESOLVED|COMPLETE|COMPLETED|READ|VERIFIED)(_|$)/.test(status) ? "bg-emerald-50 text-emerald-700"
    : /(^|_)(PENDING|SUBMITTED|DUE|OPEN|IN_PROGRESS|DISCUSSION|UNREAD)(_|$)/.test(status) ? "bg-amber-50 text-amber-700"
    : /INACTIVE|CANCEL|REJECT|DEACTIVATED|OVERDUE|ISSUE|EXPIRED/.test(status) ? "bg-rose-50 text-rose-700"
    : "bg-slate-100 text-slate-600";
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", tone)}>{status.replaceAll("_", " ")}</span>;
}
