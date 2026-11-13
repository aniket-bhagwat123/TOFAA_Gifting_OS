"use client";

import { useState } from "react";
import { ChevronsUpDown, ChevronUp, ChevronDown, Gift, MoreVertical, Pencil, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { HoverScrollX } from "@/components/ui/hover-scroll-x";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { iconButton, table } from "@/components/ui/table-styles";
import { cn } from "@/lib/utils";
import { type DirectoryRow, OccasionIcon, longDate, prettyMobile, relationshipMeta } from "./recipient-utils";

export type SortKey = "name" | "mobile" | "city" | "nextOccasion";
export type SortState = { key: SortKey; descending: boolean };

const COLUMNS: Array<{ label: string; sort?: SortKey }> = [
  { label: "Recipient", sort: "name" }, { label: "Relationship" }, { label: "Group" }, { label: "Mobile", sort: "mobile" }, { label: "City", sort: "city" },
  { label: "Next occasion", sort: "nextOccasion" }, { label: "Status" },
];
const COLUMN_COUNT = COLUMNS.length + 2;

function SortHeader({ label, sortKey, sort, onSort }: { label: string; sortKey?: SortKey; sort: SortState; onSort: (key: SortKey) => void }) {
  if (!sortKey) return <>{label}</>;
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.descending ? ChevronDown : ChevronUp;
  return <button type="button" onClick={() => onSort(sortKey)} aria-label={`Sort by ${label.toLowerCase()}`} className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink", active && "text-ink")}>{label}<Icon size={14} /></button>;
}

function RowMenu({ row, archived, onEdit, onGift, onArchive, onDelete }: { row: DirectoryRow; archived: boolean; onEdit: () => void; onGift: () => void; onArchive: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const item = "flex min-h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-ink hover:bg-slate-50";
  const run = (action: () => void) => () => { setOpen(false); action(); };
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><button type="button" aria-label={`More actions for ${row.name ?? "recipient"}`} className={iconButton}><MoreVertical size={16} /></button></PopoverTrigger>
    <PopoverContent align="end" className="w-48 p-1.5">
      <button type="button" className={item} onClick={run(onEdit)}><Pencil size={15} className="text-muted" /> Edit</button>
      <button type="button" className={item} onClick={run(onGift)}><Gift size={15} className="text-muted" /> Create gift request</button>
      <button type="button" className={item} onClick={run(onArchive)}>{archived ? <ArchiveRestore size={15} className="text-muted" /> : <Archive size={15} className="text-muted" />}{archived ? "Restore" : "Archive"}</button>
      <button type="button" className={cn(item, "text-rose-700 hover:bg-rose-50")} onClick={run(onDelete)}><Trash2 size={15} /> Delete</button>
    </PopoverContent>
  </Popover>;
}

function StatusCell({ status }: { status?: string }) {
  const archived = status === "ARCHIVED";
  return <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-medium text-ink"><span aria-hidden className={cn("h-2 w-2 rounded-full", archived ? "bg-slate-400" : "bg-emerald-500")} />{archived ? "Archived" : "Active"}</span>;
}

export function RecipientsTable({ rows, loading, selected, onToggle, onTogglePage, sort, onSort, archivedView, filtered, canAdd, onOpen, onGift, onArchive, onDelete, onAdd }: {
  rows: DirectoryRow[]; loading: boolean; selected: Set<string>; onToggle: (id: string) => void; onTogglePage: () => void;
  sort: SortState; onSort: (key: SortKey) => void; archivedView: boolean; filtered: boolean; canAdd: boolean;
  onOpen: (row: DirectoryRow) => void; onGift: (row: DirectoryRow) => void; onArchive: (row: DirectoryRow) => void; onDelete: (row: DirectoryRow) => void; onAdd: () => void;
}) {
  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(String(row.id)));
  return <HoverScrollX>
    <table className={cn(table.root, "min-w-[62rem]")}>
      <thead className={table.head}><tr className={table.headRow}>
        <th className="w-12 px-4"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={onTogglePage} disabled={!rows.length} className="h-[18px] w-[18px] rounded accent-brand" /></th>
        {COLUMNS.map((column) => <th key={column.label} scope="col" aria-sort={column.sort && sort.key === column.sort ? (sort.descending ? "descending" : "ascending") : undefined} className={table.th}><SortHeader label={column.label} sortKey={column.sort} sort={sort} onSort={onSort} /></th>)}
        <th scope="col" className={cn(table.th, "text-right")}>Actions</th>
      </tr></thead>
      <tbody>
        {loading ? Array.from({ length: 6 }).map((_, i) => <tr key={i} className={table.row}><td colSpan={COLUMN_COUNT} className={table.td}><div className="h-4 animate-pulse rounded bg-slate-100" /></td></tr>)
          : rows.map((row) => {
            const id = String(row.id);
            const relationship = relationshipMeta(row.relationship)?.label;
            const next = row.nextOccasion;
            const groups = row.groups ?? [];
            const td = table.td;
            return <tr key={id} className={cn(table.row, selected.has(id) && "bg-brand-soft/40 hover:bg-brand-soft/50")}>
              <td className={table.td}><input type="checkbox" aria-label={`Select ${row.name}`} checked={selected.has(id)} onChange={() => onToggle(id)} className="h-[18px] w-[18px] rounded accent-brand" /></td>
              <td className={td}>
                <button type="button" onClick={() => onOpen(row)} className="press flex items-center gap-3 rounded-md text-left">
                  <Avatar name={String(row.name ?? "")} src={row.avatarUrl ?? undefined} className="h-11 w-11 text-sm" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2"><span className="block max-w-[10rem] truncate text-sm font-semibold capitalize text-ink">{String(row.name ?? "Unnamed")}</span>{row.isPrimary && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-brand">Primary</span>}</span>
                    <span className="block max-w-[12rem] truncate text-xs text-muted">{row.designation || ""}</span>
                  </span>
                </button>
              </td>
              <td className={cn(td, "whitespace-nowrap text-sm text-ink")}>{relationship ?? "—"}</td>
              <td className={td}>{groups.length
                ? <span title={groups.map((g) => g.name).join(", ")} className="inline-flex items-center gap-1"><span className="max-w-[6rem] truncate whitespace-nowrap rounded-lg bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand">{groups[0].name}</span>{groups.length > 1 && <span className="shrink-0 text-xs font-medium text-muted">+{groups.length - 1}</span>}</span>
                : <span className="text-muted">—</span>}</td>
              <td className={cn(td, "whitespace-nowrap text-sm tabular-nums text-ink")}>{prettyMobile(row.mobileNumber)}</td>
              <td className={cn(td, "whitespace-nowrap text-sm text-ink")}>{row.city || row.address?.city || "—"}</td>
              <td className={td}>{next
                ? <div className="flex items-center gap-3"><OccasionIcon kind={next.kind} /><div><p className="whitespace-nowrap text-sm font-semibold text-ink">{next.label}</p><p className="whitespace-nowrap text-xs tabular-nums text-muted">{longDate(next.date)}</p></div></div>
                : <div className="flex items-center gap-3"><span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-300">—</span><div><p className="text-sm text-muted">—</p><p className="text-xs text-muted">No upcoming</p></div></div>}</td>
              <td className={td}><StatusCell status={row.status} /></td>
              <td className={table.td}><div className="flex justify-end"><RowMenu row={row} archived={archivedView} onEdit={() => onOpen(row)} onGift={() => onGift(row)} onArchive={() => onArchive(row)} onDelete={() => onDelete(row)} /></div></td>
            </tr>;
          })}
      </tbody>
    </table>
    {!loading && !rows.length && <EmptyState title={filtered ? "No recipients match" : archivedView ? "No archived recipients" : "No recipients yet"} description={filtered ? "Try a different search or clear the filters." : archivedView ? "People you archive will be listed here." : "Add the people you gift and we'll remind you before every important date."} action={!filtered && !archivedView && canAdd ? <button type="button" onClick={onAdd} className="press inline-flex min-h-10 items-center rounded-[9px] bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">Add recipient</button> : undefined} />}
  </HoverScrollX>;
}
