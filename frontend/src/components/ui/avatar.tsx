"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Each person gets one fixed colour picked from their name, so they look the same on every screen.
const COLORS = [
  "bg-teal-100 text-teal-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800", "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800", "bg-emerald-100 text-emerald-800", "bg-fuchsia-100 text-fuchsia-800", "bg-orange-100 text-orange-800",
  "bg-indigo-100 text-indigo-800", "bg-lime-100 text-lime-800", "bg-cyan-100 text-cyan-800", "bg-pink-100 text-pink-800",
];

export const avatarColor = (name?: string | null) => {
  let hash = 0;
  for (const char of (name ?? "").trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
};

export const initialsOf = (name?: string | null) =>
  (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";

/** A person's photo, or their initials on a colour of their own when there is no photo. `shape="square"` is for client logos. */
export function Avatar({ name, src, shape = "circle", className }: { name?: string | null; src?: string | null; shape?: "circle" | "square"; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = !!src && failed !== src;
  return <span aria-hidden className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden text-sm font-semibold", shape === "circle" ? "rounded-full" : "rounded-xl", !showImage && avatarColor(name), className)}>
    {showImage ? <img src={src} alt="" loading="lazy" onError={() => setFailed(src)} className="h-full w-full object-cover" /> : initialsOf(name)}
  </span>;
}
