"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { getApiErrorMessage } from "@/services/api-client";
import { getModuleRecords, mutateModule } from "@/features/modules/module.service";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Sheet } from "@/components/ui/sheet";
import { titleCase } from "@/lib/utils";
import { DatePickerField } from "@/components/ui/date-picker-field";

/** "YYYY-MM-DD" to a local Date, or nothing when empty. */
const asDate = (value: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : undefined; };

type Balance = { availableCredits: number; totalCredits?: number; reservedCredits?: number; asOf: string };
type UsageGroup = { sourceType: string; creditsUsed: number; entryCount: number };
type Usage = { totalCreditsUsed: number; groups: UsageGroup[] };
type Pricing = { currency: string; unitPriceMinor: number };
type CreditRequest = { id: string; requestedCredits: number; amountDueMinor: number; status: string; note?: string | null; reviewNote?: string | null; createdAt: string; updatedAt: string };
type LedgerEntry = { id: string; entryType: string; creditsDelta: number; balanceAfter: number; sourceType: string; description: string; createdAt: string };
type Page<T> = { items: T[]; pagination?: { page?: number; pages?: number; totalRecords?: number; total_records?: number } };

const QUICK_AMOUNTS = [5000, 10000, 25000, 50000];
const num = (value: number) => value.toLocaleString("en-IN");
const rupees = (minor: number, decimals = 0) => `₹${(minor / 100).toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
const day = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const inputClass = "min-h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[0.9375rem] outline-none focus:border-brand focus:ring-4 focus:ring-brand/15";

const sourceLabel: Record<string, string> = { gift_request: "Gift request", contract_gift: "Contract gift", credit_request: "Credit request", adjustment: "Adjustment", gift: "Gift" };
const usageLabel: Record<string, string> = { gift_request: "Gift requests", contract_gift: "Contract gifts", adjustment: "Adjustments", gift: "Gifts" };
const label = (map: Record<string, string>, key: string) => map[key] ?? titleCase(key.replace(/_/g, " "));

function typeChip(entry: LedgerEntry) {
  if (entry.entryType === "usage") return { text: "Usage", cls: "bg-slate-100 text-slate-700" };
  if (entry.entryType === "adjustment") return { text: "Adjustment", cls: "bg-violet-50 text-violet-700" };
  if (entry.sourceType === "credit_request") return { text: "Credits added", cls: "bg-emerald-50 text-emerald-700" };
  return { text: "Credit", cls: "bg-emerald-50 text-emerald-700" };
}
const requestStatus: Record<string, { text: string; cls: string }> = {
  pending_review: { text: "Awaiting approval", cls: "bg-amber-50 text-amber-800" },
  awaiting_payment: { text: "Awaiting approval", cls: "bg-amber-50 text-amber-800" },
  payment_submitted: { text: "Awaiting approval", cls: "bg-amber-50 text-amber-800" },
  credited: { text: "Approved", cls: "bg-emerald-50 text-emerald-700" },
  rejected: { text: "Rejected", cls: "bg-rose-50 text-rose-700" },
};

export function CreditsView() {
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);
  const isClient = user?.platformRole === "CLIENT";
  const tenantId = isClient ? user?.tenant?.id : selectedTenantId;
  const base = `/tenants/${tenantId}`;

  const [balance, setBalance] = useState<Balance | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [ledger, setLedger] = useState<Page<LedgerEntry> | null>(null);
  const [tab, setTab] = useState<"ledger" | "requests">("ledger");
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [credits, setCredits] = useState("10000");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [review, setReview] = useState<{ request: CreditRequest; action: "approve" | "reject" } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const loadSummary = useCallback(async () => {
    if (!tenantId) return;
    const today = new Date();
    const since = new Date(); since.setDate(today.getDate() - 29);
    const results = await Promise.allSettled([
      getModuleRecords(`${base}/credits/balance`, {}),
      getModuleRecords(`${base}/credits/usage`, { from: isoDay(since), to: isoDay(today) }),
      getModuleRecords(`${base}/credits/pricing`, {}, { ttl: 60_000 }),
      getModuleRecords(`${base}/credit-requests`, { page: 1, limit: 100 }),
    ]);
    if (results[0].status === "fulfilled") setBalance(results[0].value as Balance); else setError(getApiErrorMessage(results[0].reason));
    if (results[1].status === "fulfilled") setUsage(results[1].value as Usage);
    if (results[2].status === "fulfilled") setPricing(results[2].value as Pricing);
    if (results[3].status === "fulfilled") setRequests(((results[3].value as Page<CreditRequest>).items) ?? []);
  }, [base, tenantId]);

  const loadLedger = useCallback(async () => {
    if (!tenantId) return;
    try { setLedger(await getModuleRecords(`${base}/credits/ledger`, { page, limit: 10, from: from || undefined, to: to || undefined }) as Page<LedgerEntry>); }
    catch (err) { setError(getApiErrorMessage(err)); }
  }, [base, tenantId, page, from, to]);

  useEffect(() => { setLoading(true); setError(null); void loadSummary().finally(() => setLoading(false)); }, [loadSummary]);
  useEffect(() => { void loadLedger(); }, [loadLedger]);

  const requestedCredits = Number(credits);
  const validCredits = Number.isInteger(requestedCredits) && requestedCredits > 0;
  const amountDue = useMemo(() => (validCredits && pricing ? requestedCredits * pricing.unitPriceMinor : 0), [validCredits, requestedCredits, pricing]);
  const usageMax = Math.max(1, ...(usage?.groups.map((group) => group.creditsUsed) ?? [1]));
  const totalPages = Math.max(1, Number(ledger?.pagination?.pages ?? 1));

  const refreshAll = async () => { await Promise.all([loadSummary(), loadLedger()]); };

  const openReview = (request: CreditRequest, action: "approve" | "reject") => { setReview({ request, action }); setReviewNote(""); setReviewError(null); };
  const submitReview = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!review) return;
    if (review.action === "reject" && !reviewNote.trim()) { setReviewError("Please tell the client why."); return; }
    const body = review.action === "approve" ? { reviewNote: reviewNote.trim() || undefined } : { reason: reviewNote.trim() };
    setReviewing(true); setReviewError(null);
    try {
      await mutateModule("post", `/admin/credit-requests/${review.request.id}/${review.action}`, body);
      toast.success(review.action === "approve" ? `Approved. ${num(review.request.requestedCredits)} credits added to the client’s balance.` : "Request rejected.");
      setReview(null);
      await refreshAll();
    } catch (err) { setReviewError(getApiErrorMessage(err)); }
    finally { setReviewing(false); }
  };

  const sendRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validCredits) { setFormError("Enter the number of credits you need, as a whole number."); return; }
    setSending(true); setFormError(null);
    try {
      await mutateModule("post", `${base}/credit-requests`, { requestedCredits, ...(note.trim() ? { note: note.trim() } : {}) }, undefined, { "Idempotency-Key": crypto.randomUUID() });
      toast.success("Request sent. The credits are added to your balance as soon as TOFAA approves it.");
      setNote("");
      await refreshAll();
    } catch (err) { setFormError(getApiErrorMessage(err)); }
    finally { setSending(false); }
  };

  if (!tenantId) return <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base text-amber-900">{isClient ? "Your account isn't linked to an organisation yet. Please contact TOFAA." : "Choose a client from the “Viewing” menu at the top first."}</div>;
  if (loading && !balance) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (error && !balance) return <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-base text-rose-800">{error}</div>;

  const updated = balance ? new Date(balance.asOf) : null;
  const updatedText = updated ? `${updated.toDateString() === new Date().toDateString() ? "today" : day(balance!.asOf)}, ${updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "";

  return <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-6">
        <p className="text-sm text-muted">Available balance</p>
        <p className="mt-2 flex items-baseline gap-2"><span className="text-5xl font-bold tracking-tight text-ink">{num(balance?.availableCredits ?? 0)}</span><span className="text-lg text-muted">credits</span></p>
        {pricing && <p className="mt-1 text-sm text-muted">Worth <strong className="text-ink">{rupees((balance?.availableCredits ?? 0) * pricing.unitPriceMinor)}</strong> at {rupees(pricing.unitPriceMinor, 2)} per credit</p>}
        {(balance?.reservedCredits ?? 0) > 0 && <p className="mt-1 text-sm text-muted">{num(balance?.totalCredits ?? 0)} total · <strong className="text-ink">{num(balance?.reservedCredits ?? 0)}</strong> set aside in Occasion budgets</p>}
        <p className="mt-2 text-xs text-muted">Updated {updatedText}</p>
        <div className="mt-5 border-t border-line/70 pt-5">
          <p className="flex items-baseline justify-between font-semibold text-ink"><span>Used · last 30 days</span><span>{num(usage?.totalCreditsUsed ?? 0)}</span></p>
          {!usage?.groups.length ? <p className="mt-3 text-sm text-muted">No credits used in the last 30 days.</p> : <ul className="mt-3 space-y-3.5">
            {usage.groups.map((group) => <li key={group.sourceType}>
              <p className="flex items-baseline justify-between text-sm text-muted"><span>{label(usageLabel, group.sourceType)} · {group.entryCount} {group.entryCount === 1 ? "entry" : "entries"}</span><span className="tabular-nums">{num(group.creditsUsed)}</span></p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(4, (group.creditsUsed / usageMax) * 100)}%` }} /></div>
            </li>)}
          </ul>}
        </div>
      </Card>

      {isClient ? <Card className="p-6">
        <form noValidate onSubmit={sendRequest} className="space-y-4">
          <div><h2 className="text-lg font-semibold text-ink">Request credits</h2><p className="text-sm text-muted">TOFAA reviews your request and adds the credits once it is approved.</p></div>
          <label className="block space-y-1.5 text-sm font-medium text-ink">Credits
            <input type="number" min={1} step={1} inputMode="numeric" value={credits} onChange={(event) => { setCredits(event.target.value); setFormError(null); }} className={inputClass} />
          </label>
          <div className="flex flex-wrap gap-2">{QUICK_AMOUNTS.map((amount) => <button key={amount} type="button" onClick={() => { setCredits(String(amount)); setFormError(null); }} className={`min-h-9 rounded-lg border px-3.5 text-sm font-medium ${requestedCredits === amount ? "border-brand bg-brand-soft text-brand" : "border-line text-ink hover:bg-slate-50"}`}>{num(amount)}</button>)}</div>
          <label className="block space-y-1.5 text-sm font-medium text-ink">Note <span className="font-normal text-muted">(optional)</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} maxLength={1000} placeholder="PO number or anything finance should know" className={`${inputClass} py-2.5`} />
          </label>
          <div className="space-y-1.5 rounded-xl border border-line/70 bg-slate-50 px-4 py-3">
            <p className="flex justify-between text-sm text-muted"><span>Price per credit</span><span>{pricing ? rupees(pricing.unitPriceMinor, 2) : "—"}</span></p>
            <p className="flex justify-between font-semibold text-ink"><span>Total value</span><span className="text-lg">{pricing && validCredits ? rupees(amountDue) : "—"}</span></p>
          </div>
          {formError && <p role="alert" className="text-sm text-rose-600">{formError}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={sending || !pricing}>{sending ? "Sending…" : "Send request"}</Button>
        </form>
      </Card> : <Card className="flex items-center p-6"><p className="text-sm text-muted">Credit requests are made by the client. Approve or reject them from the “Credit requests” tab below.</p></Card>}
    </div>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/70 px-5 pt-2">
        <div role="tablist" className="flex gap-6">
          {([["ledger", "Ledger"], ["requests", "Credit requests"]] as const).map(([key, text]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`-mb-px min-h-12 border-b-2 text-sm font-semibold ${tab === key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}>{text}</button>)}
        </div>
        {tab === "ledger" && <div className="flex flex-wrap items-center gap-2 pb-2">
          <DatePickerField id="ledger-from" label="From date" placeholder="From date" compact value={from} maxDate={asDate(to)} onChange={(value) => { setFrom(value); setPage(1); }} />
          <DatePickerField id="ledger-to" label="To date" placeholder="To date" compact value={to} minDate={asDate(from)} onChange={(value) => { setTo(value); setPage(1); }} />
          {(from || to) && <button type="button" onClick={() => { setFrom(""); setTo(""); setPage(1); }} className="inline-flex min-h-10 items-center gap-1 px-2 text-sm font-medium text-brand"><X size={14} /> Clear</button>}
        </div>}
      </div>

      {tab === "ledger" ? <>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="bg-slate-50/80 text-muted"><tr><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Description</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Source</th><th className="px-5 py-3 text-right font-medium">Change</th><th className="px-5 py-3 text-right font-medium">Balance</th></tr></thead>
          <tbody className="divide-y divide-line/70">
            {!ledger ? <tr><td colSpan={6} className="py-12 text-center"><Spinner /></td></tr> : !ledger.items.length ? <tr><td colSpan={6} className="px-5 py-12 text-center text-muted">{from || to ? "No entries in these dates." : "No credit activity yet."}</td></tr> : ledger.items.map((entry) => {
              const chip = typeChip(entry);
              return <tr key={entry.id} className="hover:bg-slate-50/60">
                <td className="whitespace-nowrap px-5 py-3.5 text-muted">{day(entry.createdAt)}</td>
                <td className="px-5 py-3.5 font-medium text-ink">{entry.description}</td>
                <td className="px-5 py-3.5"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${chip.cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />{chip.text}</span></td>
                <td className="px-5 py-3.5 text-muted">{label(sourceLabel, entry.sourceType)}</td>
                <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${entry.creditsDelta < 0 ? "text-rose-700" : "text-emerald-700"}`}>{entry.creditsDelta < 0 ? "−" : "+"}{num(Math.abs(entry.creditsDelta))}</td>
                <td className="px-5 py-3.5 text-right tabular-nums text-ink">{num(entry.balanceAfter)}</td>
              </tr>;
            })}
          </tbody>
        </table></div>
        {totalPages > 1 && <div className="flex items-center justify-between gap-3 border-t border-line/70 px-5 py-3">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /> Previous</Button>
          <span className="text-sm text-muted">Page {page} of {totalPages}</span>
          <Button size="sm" variant="secondary" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={16} /></Button>
        </div>}
      </> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <thead className="bg-slate-50/80 text-muted"><tr><th className="px-5 py-3 font-medium">Requested</th><th className="px-5 py-3 text-right font-medium">Credits</th><th className="px-5 py-3 text-right font-medium">Value</th><th className="px-5 py-3 font-medium">Status</th><th className="px-5 py-3 font-medium">Note</th>{!isClient && <th className="px-5 py-3 text-right font-medium">Actions</th>}</tr></thead>
        <tbody className="divide-y divide-line/70">
          {!requests.length ? <tr><td colSpan={6} className="px-5 py-12 text-center text-muted">No credit requests yet.</td></tr> : requests.map((request) => {
            const status = requestStatus[request.status] ?? { text: titleCase(request.status.replace(/_/g, " ")), cls: "bg-slate-100 text-slate-700" };
            return <tr key={request.id}>
              <td className="whitespace-nowrap px-5 py-3.5 text-muted">{day(request.createdAt)}</td>
              <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-ink">{num(request.requestedCredits)}</td>
              <td className="px-5 py-3.5 text-right tabular-nums">{rupees(request.amountDueMinor)}</td>
              <td className="px-5 py-3.5"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.cls}`}>{status.text}</span></td>
              <td className="max-w-xs truncate px-5 py-3.5 text-muted">{request.status === "rejected" && request.reviewNote ? `Reason: ${request.reviewNote}` : request.note || "—"}</td>
              {!isClient && <td className="px-5 py-3.5"><div className="flex flex-wrap justify-end gap-2">
                {["pending_review", "awaiting_payment", "payment_submitted"].includes(request.status) && <Button size="sm" onClick={() => openReview(request, "approve")}>Approve</Button>}
                {request.status === "pending_review" && <Button size="sm" variant="secondary" className="text-rose-700" onClick={() => openReview(request, "reject")}>Reject</Button>}
              </div></td>}
            </tr>;
          })}
        </tbody>
      </table></div>}
    </Card>
    <Sheet open={!!review} locked={reviewing} labelledBy="credit-review-title" className="max-w-md" onClose={() => setReview(null)}>
      {review && <form noValidate onSubmit={submitReview} className="space-y-5">
        <div>
          <h2 id="credit-review-title" className="text-2xl font-semibold text-ink">{review.action === "approve" ? "Approve request" : "Reject request"}</h2>
          <p className="mt-1 text-sm text-muted">{num(review.request.requestedCredits)} credits requested</p>
        </div>
        {review.action === "approve" && <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-muted">Approving adds {num(review.request.requestedCredits)} credits to the client’s balance straight away.</p>}
        <label className="block space-y-1.5 text-sm font-medium text-ink">{review.action === "reject" ? "Reason" : "Note (optional)"}
          <textarea value={reviewNote} onChange={(event) => { setReviewNote(event.target.value); setReviewError(null); }} rows={3} maxLength={1000} autoFocus className={`${inputClass} py-2.5`} />
        </label>
        {reviewError && <p role="alert" className="text-sm text-rose-600">{reviewError}</p>}
        <div className="flex flex-col-reverse gap-3 border-t border-line/70 pt-5 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" disabled={reviewing} onClick={() => setReview(null)}>Cancel</Button>
          <Button type="submit" variant={review.action === "reject" ? "danger" : "primary"} disabled={reviewing}>{reviewing ? "Saving…" : review.action === "approve" ? "Approve and add credits" : "Reject"}</Button>
        </div>
      </form>}
    </Sheet>
  </div>;
}

