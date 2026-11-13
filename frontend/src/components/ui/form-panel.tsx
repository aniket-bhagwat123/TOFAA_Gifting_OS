"use client";

import { useId, type FormEventHandler, type ReactNode } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { cn } from "@/lib/utils";

/** Panel widths: sm for one or two fields, md for a normal form, lg for long forms, xl for two-column forms. */
const WIDTHS = { sm: "max-w-[28rem]", md: "max-w-[36rem]", lg: "max-w-[44rem]", xl: "max-w-[56rem]", "2xl": "max-w-[calc(100%-14rem)]" } as const;
export type PanelWidth = keyof typeof WIDTHS;

/**
 * The one format for every add/edit form: a panel that slides in from the right with an icon, title and
 * description at the top, a scrolling body of numbered sections, and a Cancel / Save footer that stays in view.
 */
export function FormPanel({ open, onClose, title, description, icon, width = "md", locked = false, onSubmit, submitLabel, savingLabel = "Saving…", cancelLabel = "Cancel", footer, stepper, children }: {
  open: boolean; onClose: () => void; title: string; description?: string; icon?: ReactNode; width?: PanelWidth; locked?: boolean;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  /** Text of the main button. Leave out when the form supplies its own `footer`. */
  submitLabel?: string; savingLabel?: string; cancelLabel?: string;
  footer?: ReactNode;
  /** Progress shown under the header, for forms that take several steps (see PanelSteps). */
  stepper?: ReactNode; children: ReactNode;
}) {
  const titleId = useId();
  const defaultFooter = submitLabel && <div className="flex gap-3">
    <Button type="button" variant="secondary" className="flex-1" disabled={locked} onClick={onClose}>{cancelLabel}</Button>
    <Button type="submit" className="flex-1" disabled={locked}>{locked ? savingLabel : submitLabel}</Button>
  </div>;
  const body = <>
    <header className="flex items-start gap-4 px-6 pb-4 pt-6 sm:px-7">
      {icon && <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</span>}
      <div className="min-w-0 flex-1"><h2 id={titleId} className="text-xl font-bold text-ink">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted">{description}</p>}</div>
      <button type="button" aria-label="Close" disabled={locked} onClick={onClose} className="press flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-black/5 disabled:opacity-50"><X size={20} /></button>
    </header>
    {stepper && <div className="border-y border-line/70 px-6 py-4 sm:px-7">{stepper}</div>}
    <div className={cn("scroll-clean min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-5 sm:px-7", stepper && "pt-5")}>{children}</div>
    {(footer ?? defaultFooter) && <footer className="border-t border-line/70 bg-white px-6 py-4 sm:px-7">{footer ?? defaultFooter}</footer>}
  </>;
  return <SidePanel open={open} onClose={onClose} labelledBy={titleId} locked={locked} className={cn(WIDTHS[width], "flex flex-col overflow-hidden p-0 sm:p-0")}>
    {onSubmit ? <form noValidate onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">{body}</form> : <div className="flex min-h-0 flex-1 flex-col">{body}</div>}
  </SidePanel>;
}

/** A numbered group of fields inside a FormPanel ("1. Recipient Details"). The first section has no rule above it. */
export function FormSection({ number, title, hint, className, children }: { number?: number; title: string; hint?: string; className?: string; children: ReactNode }) {
  return <section className={cn("space-y-4 border-t border-line/70 pt-5 first:border-t-0 first:pt-0", className)}>
    <div><h3 className="text-base font-semibold text-ink">{number ? `${number}. ` : ""}{title}</h3>{hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}</div>
    {children}
  </section>;
}

/** Numbered steps for a multi-step FormPanel. Finished steps can be clicked to go back. */
export function PanelSteps({ steps, current, onGo }: { steps: ReadonlyArray<{ label: string; hint: string }>; current: number; onGo: (step: number) => void }) {
  return <nav aria-label="Progress"><ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
    {steps.map((step, index) => {
      const done = index < current, active = index === current;
      return <li key={step.label} className="min-w-0">
        <button type="button" disabled={!done} onClick={() => onGo(index)} aria-current={active ? "step" : undefined} className="flex w-full min-w-0 items-center gap-2.5 text-left disabled:cursor-default">
          <span aria-hidden className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold", active ? "border-brand bg-brand text-white ring-4 ring-brand/15" : done ? "border-brand bg-brand text-white" : "border-line bg-white text-muted")}>{done ? <Check size={16} strokeWidth={3} /> : index + 1}</span>
          <span className="min-w-0"><span className={cn("block truncate text-sm font-semibold", active ? "text-ink" : "text-muted")}>{step.label}</span><span className="hidden truncate text-xs text-muted sm:block">{step.hint}</span></span>
        </button>
      </li>;
    })}
  </ol></nav>;
}
