"use client";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { KIND_META, STATUS_META, type OverviewItem } from "./types";

export function StatusPill({ status }: { status: OverviewItem["status"] }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold", meta.chip)}><Icon size={14} aria-hidden />{meta.label}</span>;
}

/** The face of a row: the person's photo, or an icon for a company occasion. */
export function Subject({ item, size = "h-11 w-11" }: { item: OverviewItem; size?: string }) {
  if (item.sourceType === "RECIPIENT") return <Avatar name={item.name} src={item.recipientAvatarUrl} className={size} />;
  const { icon: Icon, tint } = KIND_META[item.kind];
  return <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-full", size, tint)}><Icon size={20} /></span>;
}
