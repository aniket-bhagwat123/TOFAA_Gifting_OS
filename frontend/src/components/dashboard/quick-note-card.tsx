"use client";

import { Gift, Star } from "lucide-react";
import { dashboardService } from "@/features/dashboard/dashboard.service";
import { useAsync } from "./use-async";

/** The "A quick note…" card. The text and picture come from the banners API (placement NOTE). */
export function QuickNoteCard() {
  const { data } = useAsync(() => dashboardService.banners("NOTE"), "note");
  const note = data?.[0];
  if (!note) return null;
  return <section aria-label="A quick note" className="relative flex min-h-[10rem] items-center overflow-hidden rounded-xl border border-amber-200/70 bg-gradient-to-br from-[#FFF7E3] via-[#FFF1CC] to-[#FBE3A8] px-6 py-5">
    <div className="relative z-10 max-w-[65%]">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Star size={16} className="fill-amber-400 text-amber-500" />{note.eyebrow || "A quick note..."}</p>
      <p className="mt-3 text-base font-medium leading-snug text-ink">{note.title}</p>
      {note.body && <p className="mt-2 text-sm italic text-ink/70">{note.body}</p>}
    </div>
    <div aria-hidden className="absolute inset-y-0 right-0 flex w-2/5 items-center justify-end pr-4">
      {note.imageUrl ? <img src={note.imageUrl} alt="" className="max-h-[85%] max-w-full object-contain" /> : <Gift strokeWidth={1.1} className="h-28 w-28 text-amber-500/50" />}
    </div>
  </section>;
}
