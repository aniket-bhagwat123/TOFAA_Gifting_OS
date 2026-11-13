"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { HoverScrollX } from "@/components/ui/hover-scroll-x";
import { cn } from "@/lib/utils";

/**
 * The one tab format used by every module: tabs sit in a white rounded bar, 36px tall, 14px semibold.
 * `soft` (pale-green active tab) is for status filters; `solid` (green active tab) is for switching views.
 */
export function TabBar({ label, className, wrapperClassName, bare, children }: { label: string; className?: string; wrapperClassName?: string; bare?: boolean; children: ReactNode }) {
  return <HoverScrollX role="tablist" aria-label={label} wrapperClassName={cn("w-fit max-w-full", wrapperClassName)} className={cn("flex gap-0.5", !bare && "rounded-xl bg-white p-1.5 ring-1 ring-line/70", className)}>{children}</HoverScrollX>;
}

export function Tab({ active, onClick, href, icon, count, variant = "soft", children }: {
  active: boolean; onClick?: () => void; href?: string; icon?: ReactNode; count?: number | string; variant?: "soft" | "solid"; children: ReactNode;
}) {
  const className = cn(
    "press flex min-h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-colors",
    active ? (variant === "solid" ? "bg-brand text-white" : "bg-brand-soft text-brand") : "text-slate-700 hover:bg-black/5",
  );
  const content = <>{icon}{children}{count !== undefined && <span className="tabular-nums">({count})</span>}</>;
  return href
    ? <Link role="tab" aria-selected={active} href={href} className={className}>{content}</Link>
    : <button type="button" role="tab" aria-selected={active} onClick={onClick} className={className}>{content}</button>;
}
