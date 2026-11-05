import type { ReactNode } from "react";
// The module name lives in the topbar; the page only shows its description and the primary action (top right).
export function PageHeader({ description, action }: { title?: string; description?: string; action?: ReactNode }) {
  if (!description && !action) return null;
  return <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="max-w-2xl text-base text-muted">{description}</p>
    {action && <div className="shrink-0 sm:ml-auto">{action}</div>}
  </div>;
}
