"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Five numbered steps joined by a line. A finished step shows a tick and can be clicked to go back; the current
 * step is filled green with its label underlined. On phones only the current label shows.
 */
export function WizardStepper({ steps, current, reached, onGo }: {
  steps: ReadonlyArray<{ key: string; label: string }>; current: number; reached: number; onGo: (step: number) => void;
}) {
  return <nav aria-label="Add recipient progress">
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => {
        const active = index === current, done = index < current, open = index <= reached && !active;
        return <li key={step.key} className="relative flex min-w-0 flex-col items-center">
          {index > 0 && <span aria-hidden className={cn("absolute right-1/2 top-5 h-px w-full -translate-y-1/2", index <= reached ? "bg-brand/50" : "bg-line")} />}
          <button type="button" disabled={!open} onClick={() => onGo(index)} aria-current={active ? "step" : undefined} className="group relative z-10 flex min-w-0 flex-col items-center gap-2 disabled:cursor-default">
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-full border-2 text-base font-semibold transition",
              active ? "border-brand bg-brand text-white shadow-sm" : done ? "border-brand bg-brand text-white" : open ? "border-brand/50 bg-white text-brand" : "border-slate-300 bg-white text-slate-500")}>
              {done ? <Check size={18} strokeWidth={2.5} /> : index + 1}
            </span>
            <span className={cn("max-w-full truncate px-1 pb-2 text-xs font-medium sm:text-sm", active ? "border-b-2 border-brand font-semibold text-brand" : "border-b-2 border-transparent text-slate-500", !active && "hidden sm:block")}>{step.label}</span>
          </button>
        </li>;
      })}
    </ol>
    <p className="mt-1 text-center text-sm font-semibold text-brand sm:hidden">Step {current + 1} of {steps.length} · {steps[current].label}</p>
  </nav>;
}
