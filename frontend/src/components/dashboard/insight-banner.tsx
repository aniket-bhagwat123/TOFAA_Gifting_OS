"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Lightbulb, Sparkles } from "lucide-react";
import { dashboardService } from "@/features/dashboard/dashboard.service";
import { useAsync } from "./use-async";

const ROTATE_MS = 8000;

/** The "TOFAA Insight" strip. Every slide comes from the banners API, so super admins can add and reorder them. */
export function InsightBanner() {
  const { data } = useAsync(() => dashboardService.banners("INSIGHT"), "insight");
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = data?.length ?? 0;
  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);
  if (!count) return null;
  const banner = data![index % count];
  const go = (step: number) => setIndex((value) => (value + step + count) % count);

  return <section aria-label="TOFAA insight" aria-roledescription="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    className="relative flex flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden rounded-xl border border-amber-200/70 bg-gradient-to-r from-[#FFF3DC] via-[#FFF6E6] to-[#FFF9EE] px-5 py-3">
    <div aria-hidden className="flex h-16 w-28 shrink-0 items-center justify-center">
      {banner.imageUrl ? <img src={banner.imageUrl} alt="" className="max-h-16 w-full object-contain" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Sparkles size={22} /></span>}
    </div>
    <div className="flex min-w-0 flex-1 basis-80 items-center gap-4">
      <p className="flex shrink-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink"><Lightbulb size={16} className="text-amber-500" />{banner.eyebrow || "TOFAA INSIGHT"}</p>
      <span aria-hidden className="hidden h-10 w-px shrink-0 bg-ink/25 sm:block" />
      <div className="min-w-0" aria-live={paused ? "polite" : "off"}>
        <h2 className="truncate text-[15px] font-semibold text-ink">{banner.title}</h2>
        {banner.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink/70">{banner.body}</p>}
      </div>
    </div>
    <div className="ml-auto flex shrink-0 items-center gap-6">
      {banner.ctaUrl && banner.ctaLabel && (banner.ctaUrl.startsWith("/")
        ? <Link href={banner.ctaUrl} className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-brand hover:underline">{banner.ctaLabel} <ArrowRight size={14} /></Link>
        : <a href={banner.ctaUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-brand hover:underline">{banner.ctaLabel} <ArrowRight size={14} /></a>)}
      {count > 1 && <div className="flex items-center gap-3 text-sm text-ink">
        <button type="button" aria-label="Previous insight" onClick={() => go(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5"><ChevronLeft size={16} /></button>
        <span className="tabular-nums" aria-live="polite">{(index % count) + 1} / {count}</span>
        <button type="button" aria-label="Next insight" onClick={() => go(1)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5"><ChevronRight size={16} /></button>
      </div>}
    </div>
  </section>;
}
