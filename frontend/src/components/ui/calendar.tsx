"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const navButton = "inline-flex size-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-40";

/** The shadcn/ui calendar (react-day-picker), styled with this app's colours. */
export function Calendar({ className, classNames, showOutsideDays = true, ...props }: React.ComponentProps<typeof DayPicker>) {
  return <DayPicker
    showOutsideDays={showOutsideDays}
    className={cn("p-3", className)}
    classNames={{
      months: "relative flex flex-col gap-4",
      month: "flex flex-col gap-3",
      month_caption: "flex h-9 items-center justify-center px-9",
      dropdowns: "flex items-center justify-center gap-1.5 text-sm font-medium",
      dropdown_root: "relative rounded-lg border border-line focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20",
      dropdown: "absolute inset-0 cursor-pointer opacity-0",
      caption_label: "flex h-8 select-none items-center gap-1 rounded-lg pl-2 pr-1 text-sm font-medium text-ink [&>svg]:size-3.5 [&>svg]:text-muted",
      nav: "absolute inset-x-0 top-0 flex items-center justify-between",
      button_previous: navButton,
      button_next: navButton,
      month_grid: "w-full border-collapse",
      weekdays: "flex",
      weekday: "size-9 text-[0.8rem] font-normal leading-9 text-muted",
      week: "mt-1 flex w-full",
      day: "relative size-9 p-0 text-center text-sm",
      day_button: "inline-flex size-9 items-center justify-center rounded-lg font-normal text-ink hover:bg-brand-soft",
      selected: "[&>button]:bg-brand [&>button]:text-white [&>button]:hover:bg-brand-dark",
      today: "[&>button]:font-semibold [&>button]:text-brand [&>button]:ring-1 [&>button]:ring-brand/30",
      outside: "[&>button]:text-slate-400",
      disabled: "[&>button]:pointer-events-none [&>button]:text-slate-300",
      hidden: "invisible",
      ...classNames
    }}
    components={{
      Chevron: ({ orientation, className: iconClass }: { orientation?: "up" | "down" | "left" | "right"; className?: string }) =>
        orientation === "left" ? <ChevronLeft className={cn("size-4", iconClass)} />
          : orientation === "right" ? <ChevronRight className={cn("size-4", iconClass)} />
            : <ChevronDown className={cn("size-4", iconClass)} />
    }}
    {...props}
  />;
}
