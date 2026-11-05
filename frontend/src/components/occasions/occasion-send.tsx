"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, Send } from "lucide-react";
import { toast } from "sonner";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { RecipientMultiSelect } from "@/components/modules/recipient-multi-select";
import { creditsFor, day, inputClass, inr, num, useTenantId } from "@/components/gift-requests/shared";
import { EventSendSheet } from "./event-send-sheet";
import { EventList, type UpcomingEvent, countdown, useBudgetInfo } from "./shared";

type Occasion = { id: string; occasionName: string; occasionDate?: string; description?: string | null };
type Group = { id: string; name: string; recipientIds: string[] };
type Result = { createdCount: number; skippedCount: number; creditsPerRecipient: number; totalCredits: number };

/** Plan gifts for one occasion: a budget, who it is for (groups and/or people), then Send. */
export function OccasionSend({ occasionId }: { occasionId: string }) {
  const { tenantId } = useTenantId();
  const { unitPriceMinor, available } = useBudgetInfo(tenantId);
  const [occasion, setOccasion] = useState<Occasion | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [recipients, setRecipients] = useState<Record<string, unknown>[]>([]);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const [budget, setBudget] = useState("");
  const [mode, setMode] = useState<"groups" | "people">("groups");
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [peopleIds, setPeopleIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sendingEvent, setSendingEvent] = useState<UpcomingEvent | null>(null);

  const loadEvents = () => tenantId ? getModuleRecords(`/tenants/${tenantId}/gift-requests/upcoming`, { days: 60 }).then((rows) => setEvents((rows as UpcomingEvent[]) ?? [])).catch(() => undefined) : undefined;

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    Promise.all([
      getModuleRecords(`/tenants/${tenantId}/occasions/${occasionId}`, {}),
      getModuleRecords(`/tenants/${tenantId}/gift-spend/groups`, {}, { ttl: 30_000 }).catch(() => []),
      loadAllModuleRecords(`/tenants/${tenantId}/recipients`),
    ]).then(([occasionRow, groupRows, recipientRows]) => {
      if (cancelled) return;
      setOccasion(occasionRow as Occasion);
      setGroups(Array.isArray(groupRows) ? groupRows as Group[] : []);
      setRecipients(recipientRows);
      if (!(Array.isArray(groupRows) && groupRows.length)) setMode("people");
      setReady(true);
    }).catch((err) => { if (!cancelled) setLoadError(getApiErrorMessage(err)); });
    void loadEvents();
    return () => { cancelled = true; };
  }, [tenantId, occasionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everyone chosen, once each, even if a person is in a chosen group and picked by name too.
  const chosen = useMemo(() => {
    const ids = new Set(peopleIds);
    for (const group of groups) if (groupIds.includes(group.id)) group.recipientIds.forEach((id) => ids.add(id));
    return ids;
  }, [groups, groupIds, peopleIds]);

  const amount = Number(budget);
  const validBudget = Number.isFinite(amount) && amount > 0;
  const creditsEach = validBudget ? creditsFor(amount, unitPriceMinor) : null;
  const totalCredits = creditsEach !== null ? creditsEach * chosen.size : null;
  const short = totalCredits !== null && available !== null && totalCredits > available;
  const daysAway = occasion?.occasionDate ? Math.round((new Date(`${occasion.occasionDate}T00:00:00`).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000) : null;
  const nearbyEvents = events.filter((event) => !occasion?.occasionDate || event.date <= new Date(new Date(`${occasion.occasionDate}T00:00:00`).getTime() + 7 * 86_400_000).toISOString().slice(0, 10));

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validBudget) { setError("Enter a budget greater than 0."); return; }
    if (!chosen.size) { setError("Pick at least one group or person."); return; }
    setSending(true); setError(null);
    try {
      const data = await mutateModule("post", `/tenants/${tenantId}/occasions/${occasionId}/send`, { recipientIds: peopleIds, groupIds, budgetPerRecipient: amount, note: note.trim() || undefined }) as Result;
      setResult(data);
      toast.success(data.createdCount ? "Sent to TOFAA." : "Nothing new to send.");
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setSending(false); }
  };

  const toggleGroup = (id: string) => { setGroupIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); setError(null); };

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">Choose a client from the “Viewing” menu at the top first.</div>;
  if (loadError) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-800">{loadError} <Link href="/occasions" className="font-semibold underline">Back to occasions</Link></div>;
  if (!ready || !occasion) return <div className="flex justify-center py-20"><Spinner /></div>;

  return <div className="mx-auto max-w-3xl space-y-6">
    <div>
      <Link href="/occasions" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink"><ChevronLeft size={16} /> Occasions</Link>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h2 className="text-3xl font-bold capitalize text-ink">{occasion.occasionName}</h2>
        {daysAway !== null && daysAway >= 0 && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${daysAway <= 7 ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{countdown(daysAway)}</span>}
      </div>
      <p className="mt-1 text-base text-muted">{occasion.occasionDate ? day(occasion.occasionDate) : ""}{occasion.description ? ` · ${occasion.description}` : ""}</p>
    </div>

    {result ? <Card className="space-y-4 p-8 text-center">
      <CheckCircle2 size={44} className="mx-auto text-brand" />
      <h3 className="text-2xl font-semibold text-ink">{result.createdCount ? `Sent ${result.createdCount} gift request${result.createdCount === 1 ? "" : "s"} to TOFAA` : "Nothing new to send"}</h3>
      <p className="mx-auto max-w-md text-sm text-muted">
        {result.createdCount ? `Each person has a budget of ${num(result.creditsPerRecipient)} credits (${num(result.totalCredits)} in total). TOFAA will come back with options for you to approve.` : "Everyone you picked already has a request for this occasion."}
        {result.skippedCount > 0 && result.createdCount > 0 ? ` ${result.skippedCount} ${result.skippedCount === 1 ? "person was" : "people were"} skipped because they already had a request.` : ""}
      </p>
      <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
        <Link href="/requests"><Button>View gift requests</Button></Link>
        <Button variant="secondary" onClick={() => { setResult(null); setBudget(""); setGroupIds([]); setPeopleIds([]); setNote(""); }}>Send more</Button>
      </div>
    </Card> : <form noValidate onSubmit={send} className="space-y-6">
      <Card className="space-y-7 p-6 sm:p-8">
        <label className="block space-y-1.5 text-sm font-medium text-ink"><span className="text-base font-semibold">1. Budget for each person (₹)</span>
          <input type="number" min={1} step="any" inputMode="decimal" value={budget} onChange={(event) => { setBudget(event.target.value); setError(null); }} placeholder="e.g. 2500" className={inputClass} />
          <span className="block text-xs font-normal text-muted">{creditsEach !== null ? `About ${num(creditsEach)} credits each.` : "The same amount for everyone you pick."}</span>
        </label>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-base font-semibold text-ink">2. Who is it for?</span>
            <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
              {(["groups", "people"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)} className={`min-h-9 rounded-lg px-4 ${mode === value ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{value === "groups" ? `Groups${groupIds.length ? ` · ${groupIds.length}` : ""}` : `People${peopleIds.length ? ` · ${peopleIds.length}` : ""}`}</button>)}
            </div>
          </div>
          {mode === "groups" ? (groups.length ? <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((group) => {
              const on = groupIds.includes(group.id);
              return <label key={group.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 ${on ? "border-brand bg-brand-soft" : "border-line hover:bg-slate-50"}`}>
                <input type="checkbox" checked={on} onChange={() => toggleGroup(group.id)} className="h-5 w-5 accent-brand" />
                <span className="min-w-0"><span className="block truncate font-medium capitalize text-ink">{group.name}</span><span className="block text-sm text-muted">{group.recipientIds.length} {group.recipientIds.length === 1 ? "person" : "people"}</span></span>
              </label>;
            })}
          </div> : <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-muted">You have no groups yet. Pick people one by one, or <Link href="/recipient-groups" className="font-semibold text-brand hover:underline">create a group</Link>.</p>)
            : <div className="space-y-1.5"><span id="occ-people" className="sr-only">People</span>
              <RecipientMultiSelect options={recipients} selectedIds={peopleIds} loading={false} loadError={null} labelId="occ-people" onChange={(id, selected) => { setPeopleIds((current) => selected ? [...current, id] : current.filter((value) => value !== id)); setError(null); }} /></div>}
        </div>

        <label className="block space-y-1.5 text-sm font-medium text-ink">Note for TOFAA <span className="font-normal text-muted">(optional)</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2000} placeholder="Preferences, message, anything to know" className={inputClass} />
        </label>
      </Card>

      <Card className="space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted"><strong className="text-base text-ink">{chosen.size}</strong> {chosen.size === 1 ? "person" : "people"}{validBudget && chosen.size > 0 ? <> · <strong className="text-base text-ink">{inr(amount * chosen.size)}</strong>{totalCredits !== null ? ` · ${num(totalCredits)} credits` : ""}</> : ""}</p>
          <Button type="submit" size="lg" disabled={sending || short}><Send size={17} /> {sending ? "Sending…" : "Send"}</Button>
        </div>
        {short && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">This needs {num(totalCredits ?? 0)} credits, but you have {num(available ?? 0)} free. <Link href="/credits" className="font-semibold underline">Request credits</Link> or lower the budget.</p>}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <p className="text-xs text-muted">People who already have a request for this occasion are skipped, so sending twice never creates duplicates.</p>
      </Card>
    </form>}

    {nearbyEvents.length > 0 && <section className="space-y-3">
      <div><h3 className="text-lg font-semibold text-ink">Events around this time</h3><p className="text-sm text-muted">Birthdays and anniversaries coming up. Send these separately if you like.</p></div>
      <Card className="overflow-hidden"><EventList items={nearbyEvents} onSend={setSendingEvent} /></Card>
    </section>}

    <EventSendSheet item={sendingEvent} onClose={() => setSendingEvent(null)} onSent={() => { setSendingEvent(null); void loadEvents(); }} />
  </div>;
}
