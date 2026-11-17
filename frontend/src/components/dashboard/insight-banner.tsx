"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dashboardService } from "@/features/dashboard/dashboard.service";
import { useAsync } from "./use-async";

const ROTATE_MS = 8000;

/** The dashboard banner strip. Each slide is a 1000 × 90 picture a super admin uploaded. */
export function InsightBanner() {
  const { data } = useAsync(() => dashboardService.banners(), "banners");
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
  const arrow = "absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow hover:bg-white";

  return <section aria-label="Announcements" aria-roledescription="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    className="relative overflow-hidden rounded-xl border border-line/70 bg-white">
    <img key={banner.id} src={banner.imageUrl} alt="" width={1000} height={90} className="block h-auto w-full" />
    {count > 1 && <>
      <button type="button" aria-label="Previous banner" onClick={() => go(-1)} className={`${arrow} left-2`}><ChevronLeft size={16} /></button>
      <button type="button" aria-label="Next banner" onClick={() => go(1)} className={`${arrow} right-2`}><ChevronRight size={16} /></button>
      <span className="absolute bottom-1.5 right-3 rounded-full bg-black/45 px-2 py-0.5 text-[11px] tabular-nums text-white" aria-live="polite">{(index % count) + 1} / {count}</span>
    </>}
  </section>;
}
