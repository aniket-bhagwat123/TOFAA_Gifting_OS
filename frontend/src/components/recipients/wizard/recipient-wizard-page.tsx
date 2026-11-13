"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CheckCircle2, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAppSelector } from "@/store/hooks";
import { moduleConfig } from "@/features/modules/module-config";
import { getModuleRecords } from "@/features/modules/module.service";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { RecipientGroup } from "../group-sheet";
import { RelationshipStep } from "./steps-basic";
import { OccasionsStep, PreferencesStep } from "./steps-more";
import { DetailsStepPage } from "./step-details-page";
import { ReviewStep } from "./step-review";
import { WizardStepper } from "./wizard-stepper";
import { QuickPreview } from "./wizard-preview";
import { DuplicateFound, findDuplicates, saveWizard, type SaveResult } from "./wizard-save";
import { EMPTY, type Errors, STEPS, type WizardData, clearDraft, draftKey, hasContent, loadDraft, storeDraft, validateDetails } from "./wizard-types";

const LAST = STEPS.length - 1;
const HEADINGS = [
  "Add the basic information about the recipient.",
  "Optional. Link this recipient to a family or group. Not every recipient needs one.",
  "Optional. Birthdays, anniversaries or any date worth gifting for.",
  "Optional. Add gifting preferences and delivery addresses. Fill in the rest later.",
  "Check everything, then save the recipient. You can edit any section first.",
];
const pillButton = "press inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const secondary = `${pillButton} border border-line bg-white text-ink shadow-sm hover:bg-slate-50`;
const primary = `${pillButton} bg-brand text-white shadow-sm hover:bg-brand-dark`;

/**
 * The five-step Add Recipient page: details, relationship & group, occasions, preferences & delivery, review.
 * Only the name is required; optional steps can be skipped; a draft is kept on this device so nothing typed is lost.
 */
export function RecipientWizardPage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const selectedTenantId = useAppSelector((state) => state.modules.selectedTenantId);

  const endpoints = useMemo(() => {
    try { return user ? { recipients: moduleConfig.recipients.endpoint(user, selectedTenantId), groups: moduleConfig["recipient-groups"].endpoint(user, selectedTenantId) } : null; }
    catch (error) { return { error: error instanceof Error ? error.message : "This account isn't linked to an organisation yet." }; }
  }, [user, selectedTenantId]);
  const ready = endpoints && !("error" in endpoints) ? endpoints : null;
  const tenantKey = ready?.recipients.split("/")[2];
  const key = draftKey(user?.id, tenantKey);

  const [data, setData] = useState<WizardData>(EMPTY);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateFound["matches"]>([]);
  const [busy, setBusy] = useState<"" | "checking" | "saving">("");
  const [result, setResult] = useState<SaveResult | null>(null);
  const [resume, setResume] = useState<{ data: WizardData; step: number; savedAt: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  // Offer a saved draft, and load the client's groups and cities.
  useEffect(() => {
    if (!ready) return;
    const draft = loadDraft(key);
    setResume(draft && hasContent(draft.data) ? draft : null);
    loadAllModuleRecords(ready.groups).then((rows) => setGroups(rows as unknown as RecipientGroup[])).catch(() => undefined);
    getModuleRecords(`${ready.recipients}/summary`, {}).then((summary) => setCities((summary as { cities?: string[] }).cities ?? [])).catch(() => undefined);
  }, [ready?.recipients]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the draft current as the user types (not while the "continue draft?" question is open).
  useEffect(() => {
    if (result || resume || !tenantKey || !hasContent(data)) return;
    const timer = setTimeout(() => storeDraft(key, data, step), 600);
    return () => clearTimeout(timer);
  }, [data, step, result, resume, key, tenantKey]);

  const patch = useCallback(<K extends keyof WizardData>(section: K, value: Partial<WizardData[K]>) => setData((current) => ({ ...current, [section]: { ...(current[section] as object), ...(value as object) } })), []);
  const changeDetails = (value: Partial<WizardData["details"]>) => {
    patch("details", value);
    setErrors({});
    // Changing who this is cancels an earlier "this is a different person" answer.
    if ("name" in value || "mobile" in value || "email" in value) { setDuplicates([]); setData((current) => ({ ...current, allowDuplicate: false })); }
  };
  const go = (target: number) => { setStep(target); setReached((current) => Math.max(current, target)); setErrors({}); setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };

  /** Returns true when the person can go on: the name is valid and no unanswered possible duplicate remains. */
  const detailsReady = async (): Promise<boolean> => {
    const found = validateDetails(data.details);
    if (Object.keys(found).length) { go(0); setErrors(found); return false; }
    if (data.allowDuplicate || !ready) return true;
    setBusy("checking");
    try {
      const matches = await findDuplicates(ready.recipients, data);
      setDuplicates(matches);
      if (matches.length) { go(0); return false; }
    } catch { /* the server checks again when saving */ }
    finally { setBusy(""); }
    return true;
  };

  const save = async () => {
    if (!ready) return;
    setBusy("saving");
    try {
      const outcome = await saveWizard(data, ready, photo, groups);
      clearDraft(key);
      setResult(outcome);
      setTimeout(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } catch (error) {
      if (error instanceof DuplicateFound) { setDuplicates(error.matches); go(0); toast.error("This person may already be in your recipients."); }
      else toast.error(getApiErrorMessage(error));
    } finally { setBusy(""); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    if (step === 0) { if (await detailsReady()) go(1); return; }
    if (step < LAST) { go(step + 1); return; }
    if (await detailsReady()) await save();
  };

  const saveAndExit = () => {
    if (hasContent(data)) { storeDraft(key, data, step); toast.success("Draft saved. Continue any time from Add Recipient."); }
    router.push("/recipients");
  };
  const cancel = () => { if (hasContent(data)) setConfirmCancel(true); else router.push("/recipients"); };
  const reset = () => { clearDraft(key); setStep(0); setReached(0); setData(EMPTY); setPhoto(null); setDuplicates([]); setErrors({}); setResult(null); };

  // ----------------------------------------------------------------------------------------------- states
  if (!user) return null;
  if (endpoints && "error" in endpoints) return <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{endpoints.error} <Link href="/recipients" className="font-semibold underline">Back to Recipients</Link></p>;

  if (result) {
    const percent = (result.profile?.completeness as { percent?: number } | null | undefined)?.percent;
    return <div ref={top} className="wizard-surface mx-auto max-w-2xl rounded-2xl border border-line/70 bg-white p-8 text-center shadow-soft">
      <span aria-hidden className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand"><CheckCircle2 size={34} /></span>
      <h2 className="mt-4 text-2xl font-semibold text-ink">Recipient added</h2>
      <p className="mt-1 text-sm text-muted"><span className="font-semibold capitalize text-ink">{result.name}</span> is saved and shared with your TOFAA team.</p>
      {percent !== undefined && <div className="mx-auto mt-6 max-w-sm text-left">
        <div className="flex justify-between text-sm"><span className="font-medium text-ink">Profile completeness</span><span className="font-semibold tabular-nums text-ink">{percent}%</span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} /></div>
        <p className="mt-2 text-xs text-muted">Add the missing details from the recipient&apos;s profile to raise it.</p>
      </div>}
      {result.warnings.length > 0 && <div role="alert" className="mx-auto mt-6 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900">
        <p className="font-semibold">Some details could not be saved</p>
        <ul className="mt-1 list-disc pl-5">{result.warnings.map((warning) => <li key={warning.section}>{warning.section}: {warning.message}</li>)}</ul>
        <p className="mt-2 text-xs">The recipient exists. Add these from the recipient&apos;s profile.</p>
      </div>}
      <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" className={primary} onClick={() => router.push(`/recipients?open=${result.recipientId}`)}>View Recipient Profile</button>
        <button type="button" className={secondary} onClick={reset}><UserPlus size={16} /> Add Another Recipient</button>
        <button type="button" className={secondary} onClick={() => router.push("/recipients")}>Back to Recipients</button>
      </div>
    </div>;
  }

  const locked = busy !== "";
  const nextLabel = step < LAST ? STEPS[step + 1].label : "";
  return <div ref={top} className="wizard-surface space-y-6">
    <WizardStepper steps={STEPS} current={step} reached={reached} onGo={go} />

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <form noValidate onSubmit={(event) => void submit(event)} className="min-w-0 rounded-2xl border border-line/70 bg-white shadow-soft">
        <div className="p-6 sm:p-8">
          {resume && step === 0 && <div role="region" aria-label="Saved draft" className="mb-6 rounded-xl border border-brand/25 bg-brand-soft/50 px-4 py-3">
            <p className="text-sm text-ink"><span className="font-semibold">You have a saved draft</span> for {resume.data.details.name.trim() || "a new recipient"} from {new Date(resume.savedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.</p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" onClick={() => { setData(resume.data); setStep(Math.min(resume.step ?? 0, LAST)); setReached(Math.min(resume.step ?? 0, LAST)); setResume(null); }}>Continue draft</Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => { clearDraft(key); setResume(null); }}>Start fresh</Button>
            </div>
          </div>}

          <h2 className="text-[1.75rem] font-semibold leading-tight text-ink">{step + 1}. {STEPS[step].label}</h2>
          <p className="mb-7 mt-1.5 text-[0.9375rem] text-muted">{HEADINGS[step]}</p>

          {step === 0 && <DetailsStepPage data={data.details} errors={errors} photoUrl={photoUrl} cities={cities} onChange={changeDetails} onPhoto={setPhoto} duplicates={duplicates} confirmedDifferent={data.allowDuplicate}
            onConfirmDifferent={() => { setData((current) => ({ ...current, allowDuplicate: true })); setDuplicates([]); go(1); }} />}
          {step === 1 && <RelationshipStep data={data.relationship} groups={groups} recipientsEndpoint={ready?.recipients ?? ""} onChange={(value) => patch("relationship", value)} />}
          {step === 2 && <OccasionsStep items={data.occasions} recipientsEndpoint={ready?.recipients ?? ""} onChange={(occasions) => setData((current) => ({ ...current, occasions }))} />}
          {step === 3 && <PreferencesStep prefs={data.preferences} addresses={data.addresses} onPrefs={(value) => patch("preferences", value)} onAddresses={(addresses) => setData((current) => ({ ...current, addresses }))} />}
          {step === 4 && <ReviewStep data={data} groups={groups} photoUrl={photoUrl} onEdit={go} />}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line/70 px-6 py-4 sm:px-8">
          {step === 0 ? <button type="button" className={secondary} disabled={locked} onClick={cancel}>Cancel</button>
            : step === LAST ? <button type="button" className={secondary} disabled={locked} onClick={cancel}>Cancel</button>
            : <button type="button" className={secondary} disabled={locked} onClick={() => go(step - 1)}><ArrowLeft size={16} /> Back</button>}
          <div className="flex flex-wrap items-center justify-end gap-3">
            {step === LAST
              ? <>
                <button type="button" className={secondary} disabled={locked} onClick={() => go(step - 1)}><ArrowLeft size={16} /> Back to Edit</button>
                <button type="submit" className={primary} disabled={locked || !ready}>{busy === "saving" ? "Saving…" : busy === "checking" ? "Checking…" : "Save Recipient"}</button>
              </>
              : <>
                <button type="button" className={cn(secondary, "bg-white")} disabled={locked} onClick={saveAndExit}><Save size={16} /> Save &amp; Exit</button>
                {step > 0 && <button type="button" className={cn(pillButton, "text-muted hover:bg-black/5")} disabled={locked} onClick={() => go(step + 1)}>Skip</button>}
                <button type="submit" className={primary} disabled={locked || !ready}>{busy === "checking" ? "Checking…" : <>Next: {nextLabel} <ArrowRight size={16} /></>}</button>
              </>}
          </div>
        </footer>
      </form>

      <div className="hidden lg:block"><QuickPreview details={data.details} relationship={data.relationship} photoUrl={photoUrl} step={step} /></div>
    </div>

    <Sheet open={confirmCancel} zIndex="z-[90]" labelledBy="discard-title" className="max-w-md" onClose={() => setConfirmCancel(false)}>
      <h2 id="discard-title" className="text-xl font-semibold text-ink">Leave without saving?</h2>
      <p className="mt-2 text-sm text-muted">Your entries can be kept as a draft on this device, so you can continue later from Add Recipient.</p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={() => setConfirmCancel(false)}>Keep editing</Button>
        <Button variant="secondary" className="text-rose-700" onClick={() => { clearDraft(key); router.push("/recipients"); }}>Discard draft</Button>
        <Button onClick={() => { storeDraft(key, data, step); router.push("/recipients"); }}>Keep draft &amp; leave</Button>
      </div>
    </Sheet>
  </div>;
}
