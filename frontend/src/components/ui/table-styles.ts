/**
 * The one table + control look used by every module (see gift-request UI standards).
 * Colours come from the existing Tailwind tokens (brand / line / ink / muted) — no new palette.
 */
export const table = {
  /** The scroll area: horizontal scroll stays inside the card, never on the page. */
  scroll: "overflow-x-auto",
  root: "w-full border-collapse text-left text-sm",
  head: "border-b border-line/70 bg-slate-50/60 text-[11px] uppercase tracking-wide text-muted",
  headRow: "h-[38px]",
  th: "whitespace-nowrap px-3 text-[11px] font-semibold",
  row: "h-14 border-b border-line/70 transition-colors last:border-b-0 hover:bg-[#F5F8F7]",
  /** Denser rows for simple data (ledger, members). */
  rowCompact: "h-14 border-b border-line/70 transition-colors last:border-b-0 hover:bg-[#F5F8F7]",
  td: "px-3 py-1.5 align-middle",
  primary: "text-sm font-semibold text-ink",
  secondary: "text-xs text-muted",
  number: "whitespace-nowrap text-sm font-semibold tabular-nums text-ink",
  footer: "flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-4 py-3 sm:px-5",
} as const;

/** Inputs, selects and search boxes: 38px tall, 6px radius, 13px text. */
export const control = "h-[38px] rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-brand focus:ring-2 focus:ring-brand/25";
/** Square icon-only buttons (row menus, pagination numbers). */
export const iconButton = "flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";
export const pageButton = "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-semibold tabular-nums";
