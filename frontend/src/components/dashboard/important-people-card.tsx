import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { PersonCard } from "@/features/dashboard/dashboard.service";
import { cn } from "@/lib/utils";

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const daysChip = (days: number) => days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`;

/** A tinted card listing the people with the nearest dates. `tone` picks the header colour (green for both people lists). */
export function ImportantPeopleCard({ title, subtitle, icon, tone = "green", people, loading, empty, href = "/recipients" }: {
  title: string; subtitle: string; icon: React.ReactNode; tone?: "green"; people: PersonCard[]; loading: boolean; empty: string; href?: string;
}) {
  return <section aria-label={title} className="overflow-hidden rounded-xl border border-line bg-white">
    <header className={cn("flex items-start justify-between gap-3 px-4 py-3", tone === "green" && "bg-gradient-to-r from-emerald-50 to-emerald-50/30")}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-amber-500 shadow-sm">{icon}</span>
        <div><h2 className="text-sm font-semibold text-ink">{title}</h2><p className="text-xs text-muted">{subtitle}</p></div>
      </div>
      <Link href={href} className="inline-flex items-center gap-1 whitespace-nowrap pt-1 text-xs font-semibold text-brand hover:underline">View all <ArrowRight size={12} /></Link>
    </header>
    {loading ? <div className="space-y-3 p-4">{[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />)}</div>
      : !people.length ? <p className="px-4 py-8 text-center text-xs text-muted">{empty}</p>
      : <ul className="divide-y divide-line/70">{people.slice(0, 3).map((person) => <li key={`${person.recipientId}-${person.kind}`}>
        <Link href={`/recipients?open=${person.recipientId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#F5F8F7]">
          <Avatar name={person.name} src={person.avatarUrl ?? undefined} className="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold capitalize text-ink">{person.name}</p><p className="truncate text-xs text-muted">{person.label} · {dayLabel(person.date)}</p></div>
          <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium tabular-nums text-amber-900">{daysChip(person.daysAway)}</span>
        </Link>
      </li>)}</ul>}
  </section>;
}
