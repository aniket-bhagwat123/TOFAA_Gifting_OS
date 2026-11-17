"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Gift, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { EmptyState } from "@/components/ui/empty-state";
import { FormPanel } from "@/components/ui/form-panel";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { inputClass } from "@/components/gift-requests/shared";
import { SendGiftDialog, type SendGiftTarget } from "@/components/recipients/send-gift-dialog";

type Idea = { id: string; occasion: string; giftIdea: string; category?: string | null; giftTo: string[]; startDate?: string | null; endDate?: string | null; dateLabel?: string | null; isActive: boolean };
type Form = { occasion: string; giftIdea: string; category: string; giftTo: string; fixedDate: boolean; startDate: string; endDate: string; isActive: boolean };
const blank: Form = { occasion: "", giftIdea: "", category: "", giftTo: "", fixedDate: true, startDate: "", endDate: "", isActive: true };
const CATEGORIES = ["Festive", "Social & Family", "National & Wellness", "Corporate", "Professional Days", "Police & Armed Forces", "Seasonal Gifting", "Corporate Milestones", "Employee Life Events", "Client & Partner Moments", "Social & Personal", "PR & Brand Gifting"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const groupOf = (idea: Idea) => idea.startDate ? `${MONTH_NAMES[Number(idea.startDate.slice(5, 7)) - 1]} ${idea.startDate.slice(0, 4)}` : idea.category || "No fixed date";

/** The gifting calendar: an occasion, what to gift, and who to gift it to. Super admins manage it; clients can send a gift for any idea. */
export function GiftIdeasView() {
  const user = useAppSelector((state) => state.auth.user);
  const isAdmin = user?.platformRole === "SUPER_ADMIN";
  const clientTenantId = user?.platformRole === "CLIENT" ? user.tenant?.id ?? null : null;

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [upcomingOnly, setUpcomingOnly] = useState(!isAdmin);
  const [editing, setEditing] = useState<Idea | "new" | null>(null);
  const [deleting, setDeleting] = useState<Idea | null>(null);
  const [removing, setRemoving] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendGiftTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setIdeas(await loadAllModuleRecords("/gift-ideas") as unknown as Idea[]); }
    catch (err) { setError(getApiErrorMessage(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayIso();
    const shown = ideas.filter((i) =>
      (!category || i.category === category)
      && (!upcomingOnly || !i.startDate || (i.endDate ?? i.startDate) >= today)
      && (!q || `${i.occasion} ${i.giftIdea} ${i.category ?? ""} ${i.giftTo.join(" ")}`.toLowerCase().includes(q)));
    const groups = new Map<string, Idea[]>();
    for (const idea of shown) groups.set(groupOf(idea), [...(groups.get(groupOf(idea)) ?? []), idea]);
    return { total: shown.length, groups: [...groups.entries()] };
  }, [ideas, search, category, upcomingOnly]);

  const remove = async () => {
    if (!deleting) return;
    setRemoving(true);
    try { await mutateModule("delete", `/admin/gift-ideas/${deleting.id}`); toast.success("Gift idea deleted."); setDeleting(null); await load(); }
    catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setRemoving(false); }
  };

  const sendIdea = (idea: Idea) => setSendTarget({ title: idea.occasion, people: [], wholeGroup: false, pickRecipients: true, budget: null, note: `Gift idea: ${idea.giftIdea}` });

  return <>
    <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search gift ideas" placeholder="Search gift ideas" className={`${inputClass} pl-9`} />
        </div>
        <select aria-label="Category" value={category} onChange={(event) => setCategory(event.target.value)} className={`${inputClass} sm:!w-56`}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-ink"><input type="checkbox" checked={upcomingOnly} onChange={(event) => setUpcomingOnly(event.target.checked)} className="h-4 w-4 accent-brand" />Upcoming only</label>
      </div>
      {isAdmin && <Button onClick={() => setEditing("new")}><Plus size={16} /> Add gift idea</Button>}
    </div>

    {error && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><span>We couldn&apos;t load the gift ideas. {error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>Try again</Button></div>}

    {loading ? <div className="flex justify-center py-20"><Spinner /></div>
      : !sections.total ? <EmptyState title="No gift ideas found" description={ideas.length ? "Try a different search or filter." : isAdmin ? "Add the first gift idea for your clients." : "TOFAA will add gift ideas here soon."} action={isAdmin && !ideas.length ? <Button onClick={() => setEditing("new")}><Plus size={16} /> Add gift idea</Button> : undefined} />
        : <div className="space-y-8">
          {sections.groups.map(([heading, list]) => <section key={heading} aria-label={heading}>
            <h2 className="mb-3 flex items-baseline gap-2 text-lg font-semibold text-ink">{heading}<span className="text-sm font-normal text-muted">{list.length} {list.length === 1 ? "idea" : "ideas"}</span></h2>
            <ul className="space-y-3">
              {list.map((idea) => <li key={idea.id} className={`flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:flex-row sm:items-start ${idea.isActive ? "" : "opacity-70"}`}>
                <span className="w-28 shrink-0 text-base font-semibold text-brand sm:pt-0.5">{idea.dateLabel || (idea.startDate ? "" : "No fixed date")}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{idea.occasion}</h3>
                    {idea.category && <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">{idea.category}</span>}
                    {!idea.isActive && <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-white">Hidden from clients</span>}
                  </div>
                  <p className="mt-0.5 text-sm italic text-muted">{idea.giftIdea}</p>
                  {idea.giftTo.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted">Gift to</span>
                    {idea.giftTo.map((who) => <span key={who} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-ink">{who}</span>)}
                  </div>}
                </div>
                <div className="flex shrink-0 gap-2">
                  {clientTenantId && <Button size="sm" onClick={() => sendIdea(idea)}><Gift size={14} /> Send gift</Button>}
                  {isAdmin && <>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(idea)}><Pencil size={14} /> Edit</Button>
                    <Button size="sm" variant="secondary" className="text-rose-700" aria-label={`Delete ${idea.occasion}`} onClick={() => setDeleting(idea)}><Trash2 size={14} /></Button>
                  </>}
                </div>
              </li>)}
            </ul>
          </section>)}
        </div>}

    {isAdmin && <IdeaForm idea={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} />}

    <Sheet open={!!deleting} locked={removing} labelledBy="delete-idea-title" className="max-w-md" onClose={() => setDeleting(null)}>
      <h2 id="delete-idea-title" className="text-[17px] font-semibold text-ink">Delete this gift idea?</h2>
      <p className="mt-2 text-sm text-muted">&ldquo;{deleting?.occasion}&rdquo; will be removed for every client. This can&apos;t be undone.</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" disabled={removing} onClick={() => setDeleting(null)}>Cancel</Button>
        <Button className="bg-rose-600 hover:bg-rose-700" disabled={removing} onClick={() => void remove()}>{removing ? "Deleting…" : "Delete"}</Button>
      </div>
    </Sheet>

    {clientTenantId && <SendGiftDialog target={sendTarget} tenantId={clientTenantId} onClose={() => setSendTarget(null)} onSent={() => setSendTarget(null)} />}
  </>;
}

/** Add or edit one gift idea. */
function IdeaForm({ idea, onClose, onSaved }: { idea: Idea | "new" | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(blank);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [busy, setBusy] = useState(false);
  const editing = idea && idea !== "new" ? idea : null;

  useEffect(() => {
    if (!idea) return;
    setErrors({});
    setForm(idea === "new" ? blank : { occasion: idea.occasion, giftIdea: idea.giftIdea, category: idea.category ?? "", giftTo: idea.giftTo.join(", "), fixedDate: !!idea.startDate, startDate: idea.startDate ?? "", endDate: idea.endDate ?? "", isActive: idea.isActive });
  }, [idea]);
  const set = (patch: Partial<Form>) => { setForm((c) => ({ ...c, ...patch })); setErrors({}); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (!form.occasion.trim()) found.occasion = "Enter the occasion.";
    if (!form.giftIdea.trim()) found.giftIdea = "Enter what to gift.";
    if (form.fixedDate && !form.startDate) found.startDate = "Pick the date.";
    if (form.fixedDate && form.endDate && form.endDate < form.startDate) found.endDate = "The end date is before the start date.";
    if (Object.keys(found).length) { setErrors(found); return; }
    setBusy(true);
    try {
      const body = {
        occasion: form.occasion.trim(), giftIdea: form.giftIdea.trim(), category: form.category || null,
        giftTo: form.giftTo.split(",").map((x) => x.trim()).filter(Boolean),
        startDate: form.fixedDate ? form.startDate : null, endDate: form.fixedDate && form.endDate ? form.endDate : null, isActive: form.isActive,
      };
      if (editing) await mutateModule("patch", `/admin/gift-ideas/${editing.id}`, body); else await mutateModule("post", "/admin/gift-ideas", body);
      toast.success(editing ? "Gift idea updated." : "Gift idea added.");
      onSaved();
    } catch (err) { toast.error(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  };

  return <FormPanel open={!!idea} onClose={onClose} locked={busy} onSubmit={(e) => void submit(e)} icon={<Gift size={26} />} title={editing ? "Edit gift idea" : "Add gift idea"}
    description="Clients see active gift ideas and can send a gift for any of them." submitLabel={editing ? "Save changes" : "Add gift idea"}>
    <div className="space-y-5">
      <label className="block space-y-1.5 text-sm font-medium text-ink">Occasion <span className="text-rose-600">*</span>
        <input value={form.occasion} maxLength={150} onChange={(event) => set({ occasion: event.target.value })} placeholder="Enter occasion" autoFocus className={inputClass} />
        {errors.occasion && <span role="alert" className="block text-xs font-normal text-rose-600">{errors.occasion}</span>}
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-ink">Gift idea <span className="text-rose-600">*</span>
        <input value={form.giftIdea} maxLength={300} onChange={(event) => set({ giftIdea: event.target.value })} placeholder="Enter what to gift" className={inputClass} />
        {errors.giftIdea && <span role="alert" className="block text-xs font-normal text-rose-600">{errors.giftIdea}</span>}
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-ink">Gift to <span className="font-normal text-muted">(optional)</span>
        <input value={form.giftTo} onChange={(event) => set({ giftTo: event.target.value })} placeholder="Enter who to gift, separated by commas" className={inputClass} />
      </label>
      <label className="block space-y-1.5 text-sm font-medium text-ink">Category <span className="font-normal text-muted">(optional)</span>
        <select value={form.category} onChange={(event) => set({ category: event.target.value })} className={inputClass}>
          <option value="">No category</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-ink"><input type="checkbox" checked={form.fixedDate} onChange={(event) => set({ fixedDate: event.target.checked })} className="h-4 w-4 accent-brand" />This idea has a date</label>
        {form.fixedDate && <div className="grid gap-4 sm:grid-cols-2">
          <div><DatePickerField id="gi-start" label="Date" required value={form.startDate} onChange={(value) => set({ startDate: value })} placeholder="Select date" />{errors.startDate && <span role="alert" className="mt-1 block text-xs text-rose-600">{errors.startDate}</span>}</div>
          <div><DatePickerField id="gi-end" label="End date (optional)" value={form.endDate} onChange={(value) => set({ endDate: value })} minDate={form.startDate ? new Date(`${form.startDate}T00:00:00`) : undefined} placeholder="Select end date" />{errors.endDate && <span role="alert" className="mt-1 block text-xs text-rose-600">{errors.endDate}</span>}</div>
        </div>}
      </div>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3">
        <input type="checkbox" checked={form.isActive} onChange={(event) => set({ isActive: event.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
        <span><span className="block text-sm font-medium text-ink">Show to clients</span><span className="block text-xs text-muted">Turn this off to keep the idea hidden while you work on it.</span></span>
      </label>
    </div>
  </FormPanel>;
}
