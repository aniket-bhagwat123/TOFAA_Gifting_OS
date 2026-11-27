"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Banner, dashboardService } from "@/features/dashboard/dashboard.service";

const ROTATE_MS = 8000;

/**
 * The dashboard banner strip. Each slide is a 2156 × 198 picture managed in TOFAA CRM, for every client or for this one.
 * Loaded once each time the page opens (no timer). Nothing is cached on the way, so the list always matches the CRM at
 * that moment: a banner uploaded there shows on the next page change, one deleted there is gone on the next page change.
 */
export function InsightBanner({ tenantId }: { tenantId?: string | null }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBanners([]); // never show the previous client's banners while the next ones load
    dashboardService.banners(tenantId)
      .then((next) => { if (!cancelled) setBanners(Array.isArray(next) ? next : []); })
      .catch(() => { if (!cancelled) setBanners([]); });
    return () => { cancelled = true; };
  }, [tenantId]);

  // A picture that no longer loads (deleted in the CRM a moment ago, or an expired link) is skipped, never shown broken.
  const shown = banners.filter((banner) => !broken.has(banner.id));
  const count = shown.length;

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % count), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [count, paused]);

  if (!count) return null;
  const banner = shown[index % count];
  const go = (step: number) => setIndex((value) => (value + step + count) % count);
  const arrow = "absolute top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/80 text-ink shadow hover:bg-white";

  return <section aria-label="Announcements" aria-roledescription="carousel" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
    className="relative overflow-hidden rounded-xl">
    <img key={banner.id} src={banner.imageUrl} alt={banner.title ?? ""} width={2156} height={198} className="block h-auto w-full"
      onError={() => setBroken((current) => new Set(current).add(banner.id))} />
    {count > 1 && <>
      <button type="button" aria-label="Previous banner" onClick={() => go(-1)} className={`${arrow} left-2`}><ChevronLeft size={16} /></button>
      <button type="button" aria-label="Next banner" onClick={() => go(1)} className={`${arrow} right-2`}><ChevronRight size={16} /></button>
      <span className="absolute bottom-1.5 right-3 rounded-full bg-black/45 px-2 py-0.5 text-[11px] tabular-nums text-white" aria-live="polite">{(index % count) + 1} / {count}</span>
    </>}
  </section>;
}
