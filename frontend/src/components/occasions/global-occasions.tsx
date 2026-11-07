"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { day } from "@/components/gift-requests/shared";
import { DatePickerField } from "@/components/ui/date-picker-field";

type Occasion = { id: string; tenantId?: string | null; occasionName: string; occasionDate?: string | null; description?: string | null };

const input = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base text-ink";

/** Super admin: the festivals and special days every client can plan gifts for. */
export function GlobalOccasions() {
  const [items, setItems] = useState<Occasion[] | null>(null);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getModuleRecords("/occasions", { limit: 100 }) as { items?: Occasion[] };
      setItems((data.items ?? []).filter((item) => !item.tenantId).sort((a, b) => (a.occasionDate ?? "").localeCompare(b.occasionDate ?? "")));
    } catch { setError("Could not load occasions."); setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const add = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError(null);
    try {
      await mutateModule("post", "/occasions", { occasionName: name.trim(), occasionDate: date, description: description.trim() || undefined });
      setName(""); setDate(""); setDescription("");
      await load();
    } catch { setError("Could not add the occasion. An occasion with this name may already exist."); }
    finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this occasion for every client?")) return;
    try { await mutateModule("delete", `/occasions/${id}`); await load(); } catch { setError("Could not delete the occasion."); }
  };

  return <section className="mb-8 space-y-4" aria-labelledby="global-occasions-title">
    <div>
      <h2 id="global-occasions-title" className="text-lg font-semibold text-ink">Occasions for all clients</h2>
      <p className="text-sm text-muted">Add festivals and special days here. Every client sees them on their Occasions page as the date gets close.</p>
    </div>
    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
    <Card className="p-5">
      <form onSubmit={add} className="grid items-end gap-4 sm:grid-cols-[1fr_12rem] lg:grid-cols-[1fr_12rem_1.5fr_auto]">
        <div className="space-y-1.5"><label htmlFor="occasion-name" className="block text-sm font-medium text-ink">Name</label><input id="occasion-name" className={input} placeholder="e.g. Diwali" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} required /></div>
        <DatePickerField id="occasion-date" label="Date" placeholder="Pick a date" value={date} onChange={setDate} minDate={new Date(new Date().getFullYear() - 1, 0, 1)} required />
        <div className="space-y-1.5"><label htmlFor="occasion-desc" className="block text-sm font-medium text-ink">Description <span className="font-normal text-muted">(optional)</span></label><input id="occasion-desc" className={input} placeholder="A short note for clients" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></div>
        <Button type="submit" disabled={saving || !name.trim() || !date}><Plus size={16} /> Add occasion</Button>
      </form>
    </Card>
    {items === null ? <Card className="flex h-24 items-center justify-center"><Spinner /></Card> : !items.length ? <Card className="px-6 py-8 text-center text-sm text-muted">No occasions yet. Add the first one above.</Card> : <Card>
      <ul className="divide-y divide-line/70">{items.map((item) => <li key={item.id} className="flex items-center gap-4 px-5 py-3.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white"><CalendarDays size={18} /></span>
        <div className="min-w-0 flex-1"><p className="truncate font-semibold capitalize text-ink">{item.occasionName}</p><p className="truncate text-sm text-muted">{day(item.occasionDate)}{item.description ? ` · ${item.description}` : ""}</p></div>
        <Button variant="ghost" size="sm" aria-label={`Delete ${item.occasionName}`} onClick={() => void remove(item.id)}><Trash2 size={16} /></Button>
      </li>)}</ul>
    </Card>}
  </section>;
}
