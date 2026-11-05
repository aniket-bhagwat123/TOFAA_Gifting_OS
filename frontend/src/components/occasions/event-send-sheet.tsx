"use client";

import { useState } from "react";
import { toast } from "sonner";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { creditsFor, inputClass, inr, num, shortDay, useTenantId } from "@/components/gift-requests/shared";
import { type UpcomingEvent, useBudgetInfo } from "./shared";

/** One recipient's birthday, anniversary or event: set a budget and send. */
export function EventSendSheet({ item, onClose, onSent }: { item: UpcomingEvent | null; onClose: () => void; onSent: () => void }) {
  const { tenantId } = useTenantId();
  const { unitPriceMinor, available } = useBudgetInfo(tenantId);
  const [budget, setBudget] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const amount = Number(budget);
  const valid = Number.isFinite(amount) && amount > 0;
  const credits = valid ? creditsFor(amount, unitPriceMinor) : null;
  const short = credits !== null && available !== null && credits > available;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!item) return;
    if (!valid) { setError("Enter a budget greater than 0."); return; }
    setSending(true); setError(null);
    try {
      let eventId = item.eventId;
      if (!eventId) {
        // A birthday has no event record until the first time you send for it.
        const created = await mutateModule("post", `/tenants/${tenantId}/recipients/${item.recipientId}/events`, { eventName: item.title, eventDate: item.date }) as { id: string };
        eventId = created.id;
      }
      await mutateModule("post", `/tenants/${tenantId}/events/${eventId}/send`, { budgetPerRecipient: amount, note: note.trim() || undefined });
      toast.success(`Sent to TOFAA for ${item.recipientName ?? "your recipient"}.`);
      setBudget(""); setNote("");
      onSent();
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setSending(false); }
  };

  return <Sheet open={!!item} locked={sending} labelledBy="event-send-title" className="max-w-md" onClose={onClose}>
    {item && <form noValidate onSubmit={send} className="space-y-5">
      <div>
        <h2 id="event-send-title" className="text-2xl font-semibold text-ink">Send a gift</h2>
        <p className="mt-1 text-sm text-muted">{item.recipientName} · {item.title} · {shortDay(item.date)}</p>
      </div>
      <label className="block space-y-1.5 text-sm font-medium text-ink">Budget (₹)
        <input type="number" min={1} step="any" inputMode="decimal" value={budget} onChange={(event) => { setBudget(event.target.value); setError(null); }} placeholder="e.g. 2500" autoFocus className={inputClass} />
        <span className="block text-xs font-normal text-muted">{credits !== null ? `About ${num(credits)} credits${available !== null ? ` · you have ${num(available)} free` : ""}` : "Credits are worked out from this."}</span>
      </label>
      {short && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">This is more than your free credits ({num(available ?? 0)}). Request credits first, or lower the budget.</p>}
      <label className="block space-y-1.5 text-sm font-medium text-ink">Note for TOFAA <span className="font-normal text-muted">(optional)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={2000} placeholder="Preferences, message, anything to know" className={inputClass} />
      </label>
      {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
      <div className="flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" disabled={sending} onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={sending || short}>{sending ? "Sending…" : valid ? `Send · ${inr(amount)}` : "Send"}</Button>
      </div>
    </form>}
  </Sheet>;
}
