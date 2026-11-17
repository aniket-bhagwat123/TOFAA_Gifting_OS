"use client";

import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FILE_FORMATS, type FileFormat } from "@/lib/data-io";

/** A button that opens the list of file formats (Excel, CSV, JSON and so on) and calls `onPick` with the chosen one. */
export function FormatMenu({ children, onPick, disabled, className, align = "end" }: { children: ReactNode; onPick: (format: FileFormat) => void; disabled?: boolean; className?: string; align?: "start" | "end" }) {
  return <Popover>
    <PopoverTrigger asChild><button type="button" disabled={disabled} className={className}>{children}</button></PopoverTrigger>
    <PopoverContent align={align} className="w-56 p-1.5">
      {FILE_FORMATS.map((format) => <button key={format.id} type="button" onClick={() => onPick(format.id)} className="flex min-h-9 w-full items-center rounded-lg px-3 text-left text-sm text-ink hover:bg-slate-50">{format.label}</button>)}
    </PopoverContent>
  </Popover>;
}
