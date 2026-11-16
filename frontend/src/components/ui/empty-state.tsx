import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center px-6 py-12 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Inbox size={22} /></span>
    <p className="mt-3 text-sm font-semibold text-ink">{title}</p>
    {description && <p className="mt-1 max-w-sm text-xs text-muted">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
