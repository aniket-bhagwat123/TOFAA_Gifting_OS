"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { RecipientMultiSelect } from "@/components/modules/recipient-multi-select";
import { MOBILE_OK, normaliseMobile } from "./wizard/wizard-types";
import { Sheet } from "@/components/ui/sheet";
import { DateTimePickerField } from "@/components/ui/date-time-picker-field";
import { creditsFor, inputClass, inr, num, useTenantId } from "@/components/gift-requests/shared";
import { useBudgetInfo } from "@/components/occasions/shared";

/** `pickRecipients` lets the user choose the groups and people inside the dialog (used for a gift idea); `budget` and `note` pre-fill the form. */
export type SendGiftTarget = {
  title: string; people: Array<{ id: string; name: string }>; wholeGroup: boolean; pickRecipients?: boolean; budget?: number | null; note?: string;
  /** Send for an occasion that already exists (a festival or company occasion), instead of making a new one from the title. */
  occasionId?: string | null;
  /** Send for one person's birthday, anniversary or event. If it has no event record yet, one is made first. */
  event?: { eventId?: string | null; recipientId: string; name: string };
  /** The occasion's date. It is the starting delivery date when it is today or later. */
  date?: string;
};
type PickGroup = { id: string; name: string; recipientIds: string[] };
type Occasion = { id: string; occasionName: string; occasionDate?: string };
type Result = { createdCount: number; skippedCount: number };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());
type Saved = { key: string; label: string; text: string; isDefault: boolean };
const ANOTHER = "__another__";
const SAVED = "__saved__";
const joinAddress = (parts: unknown[]) => parts.map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
const LABELS: Record<string, string> = { PERMANENT: "Permanent address", RESIDENTIAL: "Permanent address", CURRENT: "Current address", OTHER: "Current address", OFFICE: "Office address" };

/** Send a gift to one person or a whole group: pick the occasion, set a budget for everyone, and change it for individual people if needed. */
export function SendGiftDialog({ target, tenantId, onClose, onSent }: { target: SendGiftTarget | null; tenantId: string; onClose: () => void; onSent: () => void }) {
  const { unitPriceMinor, available } = useBudgetInfo(tenantId);
  // Credits are for individual clients only. An organisation, or a session that has not loaded the type yet, just sets a rupee budget.
  const creditsApply = useTenantId().user?.tenant?.type === "INDIVIDUAL";
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("");
  const [own, setOwn] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState("");
  const [poc, setPoc] = useState<{ name: string; mobile: string } | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]);
  // "saved": each person's own saved address (one chosen address for a single person). "another": one address typed here for every delivery.
  const [where, setWhere] = useState<string>(SAVED);
  const [other, setOther] = useState({ line1: "", line2: "", city: "", postalCode: "" });
  const [groups, setGroups] = useState<PickGroup[]>([]);
  const [directory, setDirectory] = useState<Record<string, unknown>[]>([]);
  const [directoryState, setDirectoryState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });
  const [pickedGroups, setPickedGroups] = useState<string[]>([]);
  const [pickedPeople, setPickedPeople] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!target) return;
    setTitle(target.pickRecipients || target.occasionId || target.event ? target.title : ""); setBudget(target.budget ? String(target.budget) : ""); setOwn({}); setSearch(""); setNote(target.note ?? ""); setError(null);
    setPoc(null); setDate(target.date && target.date >= today() ? target.date : today()); setTime(""); setOther({ line1: "", line2: "", city: "", postalCode: "" });
    setPickedGroups([]); setPickedPeople([]);
    if (!target.pickRecipients) return;
    // Choosing who gets it: load the client's groups and people.
    let cancelled = false;
    setDirectoryState({ loading: true, error: null });
    Promise.all([
      getModuleRecords(`/tenants/${tenantId}/gift-spend/groups`, {}, { ttl: 30_000 }).catch(() => []),
      loadAllModuleRecords(`/tenants/${tenantId}/recipients`),
    ]).then(([groupRows, people]) => {
      if (cancelled) return;
      setGroups(Array.isArray(groupRows) ? groupRows as PickGroup[] : []); setDirectory(people); setDirectoryState({ loading: false, error: null });
    }).catch((err) => { if (!cancelled) setDirectoryState({ loading: false, error: getApiErrorMessage(err) }); });
    return () => { cancelled = true; };
  }, [target, tenantId]);

  const nameById = useMemo(() => new Map(directory.map((r) => [String(r.id), String(r.name ?? "Recipient")])), [directory]);
  const people = useMemo(() => {
    if (!target?.pickRecipients) return target?.people ?? [];
    const ids = new Set(pickedPeople);
    for (const g of groups) if (pickedGroups.includes(g.id)) g.recipientIds.forEach((id) => ids.add(id));
    return [...ids].map((id) => ({ id, name: nameById.get(id) ?? "Recipient" }));
  }, [target, pickedPeople, pickedGroups, groups, nameById]);

  // One person: offer the addresses we have for them.
  const onlyId = people.length === 1 ? people[0].id : null;
  useEffect(() => {
    setSaved([]); setWhere(SAVED);
    if (!onlyId) return;
    let cancelled = false;
    const id = onlyId;
    Promise.all([
      getModuleRecords(`/tenants/${tenantId}/recipients/${id}/addresses`, {}).catch(() => []),
      getModuleRecords(`/tenants/${tenantId}/recipients/${id}`, {}).catch(() => null),
    ]).then(([rows, person]) => {
      if (cancelled) return;
      const list: Saved[] = (Array.isArray(rows) ? rows as Record<string, unknown>[] : []).map((a) => ({ key: String(a.id), label: LABELS[String(a.label)] ?? "Address", text: joinAddress([a.addressLine1, a.addressLine2, a.city, a.state, a.postalCode]), isDefault: a.isDefault === true })).filter((a) => a.text);
      const single = (person as { address?: Record<string, unknown> } | null)?.address;
      if (!list.length && single) { const text = joinAddress([single.addressLine1, single.addressLine2, single.city, single.state, single.postalCode]); if (text) list.push({ key: "saved", label: "Address on file", text, isDefault: true }); }
      list.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
      setSaved(list);
      setWhere(list.length ? list[0].key : ANOTHER);
    });
    return () => { cancelled = true; };
  }, [onlyId, tenantId]);

  const groupAmount = Number(budget);
  const groupValid = Number.isFinite(groupAmount) && groupAmount > 0;
  // What each person gets: their own amount if one is entered, otherwise the amount for everyone.
  const amounts = useMemo(() => people.map((p) => {
    const raw = own[p.id]?.trim();
    const mine = raw ? Number(raw) : NaN;
    return { ...p, amount: Number.isFinite(mine) && mine > 0 ? mine : groupValid ? groupAmount : null, custom: !!raw };
  }), [people, own, groupValid, groupAmount]);
  const missing = amounts.some((p) => p.amount === null);
  const total = amounts.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const credits = creditsApply && unitPriceMinor ? amounts.reduce((sum, p) => sum + (p.amount ? creditsFor(p.amount, unitPriceMinor) : 0), 0) : null;
  const short = credits !== null && available !== null && credits > available;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const fixedSource = !!(target?.occasionId || target?.event);
    if (!fixedSource && !title.trim()) { setError("Enter a title."); return; }
    if (!people.length) { setError("Choose at least one group or person."); return; }
    if (!date || date < today()) { setError("Pick a delivery date that is today or later."); return; }
    let deliveryAddress: string | undefined;
    if (where === ANOTHER) {
      if (other.line1.trim().length < 3 || !other.city.trim() || !/^[0-9]{6}$/.test(other.postalCode.trim())) { setError("Enter the address with the city and a 6-digit PIN code."); return; }
      deliveryAddress = joinAddress([other.line1, other.line2, other.city, other.postalCode]);
    } else if (single && where !== SAVED) deliveryAddress = saved.find((a) => a.key === where)?.text;
    let pocMobile: string | undefined;
    if (poc) {
      if (!poc.name.trim()) { setError("Enter the contact person's name."); return; }
      if (poc.mobile.trim()) {
        pocMobile = normaliseMobile(poc.mobile);
        if (!MOBILE_OK.test(pocMobile)) { setError("Enter the contact person's mobile number like 98765 43210."); return; }
      }
    }
    if (missing) { setError(people.length > 1 ? "Enter a budget for everyone, or a budget for each person." : "Enter a budget greater than 0."); return; }
    setSending(true); setError(null);
    try {
      // One request per distinct amount, since each send uses a single budget.
      const byAmount = new Map<number, string[]>();
      for (const p of amounts) byAmount.set(p.amount!, [...(byAmount.get(p.amount!) ?? []), p.id]);
      const details = { note: note.trim() || undefined, deliveryDate: date, deliveryTime: time || undefined, deliveryAddress, pocName: poc?.name.trim() || undefined, pocMobile };
      let created = 0, skipped = 0;
      if (target?.event) {
        // A person's birthday, anniversary or event. A birthday has no event record until the first time you send for it.
        let eventId = target.event.eventId;
        if (!eventId) eventId = (await mutateModule("post", `/tenants/${tenantId}/recipients/${target.event.recipientId}/events`, { eventName: target.event.name, eventDate: target.date ?? date }) as { id: string }).id;
        const result = await mutateModule("post", `/tenants/${tenantId}/events/${eventId}/send`, { budgetPerRecipient: amounts[0].amount, ...details }) as Result;
        created += result.createdCount; skipped += result.skippedCount;
      } else {
        // An existing occasion, or a one-off one named by the title.
        let id = target?.occasionId ?? null;
        if (!id) {
          const existing = (await getModuleRecords(`/tenants/${tenantId}/occasions`, { limit: 100 }).catch(() => null) as { items?: Occasion[] } | null)?.items ?? [];
          const found = existing.find((o) => o.occasionName.trim().toLowerCase() === title.trim().toLowerCase() && o.occasionDate === date);
          id = found?.id ?? (await mutateModule("post", `/tenants/${tenantId}/occasions`, { occasionName: title.trim(), occasionDate: date }) as { id: string }).id;
        }
        for (const [amount, ids] of byAmount) {
          const result = await mutateModule("post", `/tenants/${tenantId}/occasions/${id}/send`, { recipientIds: ids, groupIds: [], budgetPerRecipient: amount, ...details }) as Result;
          created += result.createdCount; skipped += result.skippedCount;
        }
      }
      toast.success(created ? `Sent ${created} gift request${created === 1 ? "" : "s"} to TOFAA.${skipped ? ` ${skipped} skipped: already requested.` : ""}` : "Nothing new to send. They already have a request for this occasion.");
      onSent();
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setSending(false); }
  };

  const many = people.length > 1;
  const single = people.length === 1;
  const shown = people.filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()));
  const customCount = people.filter((p) => own[p.id]?.trim() && own[p.id].trim() !== budget.trim()).length;
  return <Sheet open={!!target} locked={sending} labelledBy="send-gift-title" className="max-w-lg" onClose={onClose}>
    {target && <form noValidate onSubmit={send} className="space-y-5">
      <div>
        <h2 id="send-gift-title" className="text-2xl font-semibold text-ink">Send gift</h2>
        <p className="mt-1 text-sm text-muted">{target.pickRecipients && !target.occasionId ? "Gift idea" : target.event ? `${people[0]?.name ?? ""} · ${target.title}` : target.title}{target.pickRecipients && !target.occasionId ? ` · ${target.title}` : ""}{many && !target.pickRecipients ? ` · ${people.length} people` : ""}</p>
      </div>

      {!target.occasionId && !target.event && <label className="block space-y-1.5 text-sm font-medium text-ink">Title
        <input value={title} onChange={(event) => { setTitle(event.target.value); setError(null); }} placeholder="Enter title" maxLength={150} autoFocus className={inputClass} />
      </label>}

      {target.pickRecipients && <div className="space-y-3">
        <p className="text-sm font-medium text-ink">Send to</p>
        {groups.length > 0 && <div className="flex flex-wrap gap-2">
          {groups.map((g) => { const on = pickedGroups.includes(g.id); return <button key={g.id} type="button" aria-pressed={on} onClick={() => { setPickedGroups((c) => on ? c.filter((x) => x !== g.id) : [...c, g.id]); setError(null); }}
            className={`min-h-9 rounded-full border px-3.5 text-sm font-medium ${on ? "border-brand bg-brand-soft text-brand" : "border-line bg-white text-ink hover:bg-slate-50"}`}>{g.name} <span className="font-normal text-muted">· {g.recipientIds.length}</span></button>; })}
        </div>}
        <RecipientMultiSelect options={directory} selectedIds={pickedPeople} loading={directoryState.loading} loadError={directoryState.error} labelId="sg-people" onChange={(id, on) => { setPickedPeople((c) => on ? [...c, id] : c.filter((x) => x !== id)); setError(null); }} />
        <p className="text-xs text-muted">{people.length ? `${people.length} ${people.length === 1 ? "person" : "people"} will receive this gift.` : "Pick a group, or people one by one."}</p>
      </div>}

      <label className="block space-y-1.5 text-sm font-medium text-ink">{many ? "Budget for each person (₹)" : "Budget (₹)"}
        <input type="number" min={1} step="any" inputMode="decimal" value={budget} onChange={(event) => { setBudget(event.target.value); setError(null); }} placeholder="Enter budget" className={inputClass} />
      </label>

      {many && <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">Budget for each recipient</p>
          <span className="text-xs text-muted">{customCount ? `${customCount} adjusted` : "Change any amount below"}</span>
        </div>
        {people.length > 8 && <input type="search" aria-label="Search recipients" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search recipients" className={`${inputClass} mt-2`} />}
        <ul className="mt-2 max-h-64 divide-y divide-line/70 overflow-auto rounded-xl border border-line">
          {shown.map((p) => {
            const custom = own[p.id]?.trim() !== undefined && own[p.id]?.trim() !== "" && own[p.id].trim() !== budget.trim();
            return <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate text-sm capitalize text-ink">{p.name}{custom && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium normal-case text-amber-800">Adjusted</span>}</span>
              <input aria-label={`Budget for ${p.name}`} type="number" min={1} step="any" inputMode="decimal" value={own[p.id] ?? budget} placeholder="Budget"
                onChange={(event) => { const v = event.target.value; setOwn((c) => { const next = { ...c }; if (v === "" || v === budget) delete next[p.id]; else next[p.id] = v; return next; }); setError(null); }} className={`${inputClass} !w-32 shrink-0`} />
            </li>;
          })}
          {!shown.length && <li className="px-3 py-4 text-center text-sm text-muted">No recipients match.</li>}
        </ul>
      </div>}

      <DateTimePickerField id="sg-date" label="Delivery date & time" required date={date} time={time} onDate={setDate} onTime={setTime} minDate={new Date(new Date().setHours(0, 0, 0, 0))} placeholder="Select delivery date and time" />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Delivery address</legend>
        {single
          ? saved.map((a) => <label key={a.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${where === a.key ? "border-brand bg-brand-soft/40" : "border-line"}`}>
              <input type="radio" name="sg-where" checked={where === a.key} onChange={() => setWhere(a.key)} className="mt-1 h-4 w-4 accent-brand" />
              <span className="min-w-0 text-sm"><span className="block font-medium text-ink">{a.label}</span><span className="block text-muted">{a.text}</span></span>
            </label>)
          : <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${where === SAVED ? "border-brand bg-brand-soft/40" : "border-line"}`}>
              <input type="radio" name="sg-where" checked={where === SAVED} onChange={() => setWhere(SAVED)} className="mt-1 h-4 w-4 accent-brand" />
              <span className="text-sm"><span className="block font-medium text-ink">Each person&apos;s saved address</span><span className="block text-muted">Gifts go to the address on file for each recipient.</span></span>
            </label>}
        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 ${where === ANOTHER ? "border-brand bg-brand-soft/40" : "border-line"}`}>
          <input type="radio" name="sg-where" checked={where === ANOTHER} onChange={() => setWhere(ANOTHER)} className="mt-1 h-4 w-4 accent-brand" />
          <span className="text-sm"><span className="block font-medium text-ink">Add another address</span>{many && <span className="block text-muted">Every gift in this send is delivered here.</span>}</span>
        </label>
        {where === ANOTHER && <div className="grid gap-3 rounded-xl border border-brand/30 bg-brand-soft/20 p-3 sm:grid-cols-2">
          <input aria-label="Address" value={other.line1} onChange={(event) => setOther({ ...other, line1: event.target.value })} placeholder="Enter address" className={`${inputClass} sm:col-span-2`} />
          <input aria-label="Address line 2" value={other.line2} onChange={(event) => setOther({ ...other, line2: event.target.value })} placeholder="Enter address line 2" className={`${inputClass} sm:col-span-2`} />
          <input aria-label="City" value={other.city} onChange={(event) => setOther({ ...other, city: event.target.value })} placeholder="Enter city" className={inputClass} />
          <input aria-label="PIN code" inputMode="numeric" maxLength={6} value={other.postalCode} onChange={(event) => setOther({ ...other, postalCode: event.target.value })} placeholder="Enter PIN code" className={inputClass} />
        </div>}
      </fieldset>

      {poc
        ? <div className="space-y-3 rounded-xl border border-line p-3">
          <div className="flex items-center justify-between"><p className="text-sm font-medium text-ink">Person of contact <span className="font-normal text-muted">(optional)</span></p>
            <button type="button" aria-label="Remove person of contact" onClick={() => setPoc(null)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-ink"><X size={16} /></button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input aria-label="Contact name" value={poc.name} onChange={(event) => setPoc({ ...poc, name: event.target.value })} placeholder="Enter name" maxLength={120} autoFocus className={inputClass} />
            <input aria-label="Contact mobile number" type="tel" inputMode="tel" value={poc.mobile} onChange={(event) => setPoc({ ...poc, mobile: event.target.value })} placeholder="Enter mobile number" className={inputClass} />
          </div>
        </div>
        : <div><Button type="button" variant="secondary" size="sm" onClick={() => setPoc({ name: "", mobile: "" })}><Plus size={15} /> Add a POC</Button></div>}

      <label className="block space-y-1.5 text-sm font-medium text-ink">Note for TOFAA <span className="font-normal text-muted">(optional)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2000} placeholder="Enter note" className={inputClass} />
      </label>

      <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <div className="flex items-center justify-between"><span className="text-muted">{people.length} {people.length === 1 ? "person" : "people"}</span><span className="font-semibold tabular-nums text-ink">{missing ? "—" : inr(total)}</span></div>
        {credits !== null && !missing && <p className="mt-1 text-xs text-muted">About {num(credits)} credits{available !== null ? ` · you have ${num(available)} free` : ""}</p>}
      </div>
      {short && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">This is more than your free credits ({num(available ?? 0)}). Request credits first, or lower the budget.</p>}
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}

      <div className="flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={sending} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={sending || short}>{sending ? "Sending…" : "Send gift"}</Button>
      </div>
    </form>}
  </Sheet>;
}
