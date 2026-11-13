import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center px-6 py-16 text-center">
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Inbox size={26} /></span>
    <p className="mt-4 text-base font-semibold text-ink">{title}</p>
    {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}
