"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, UserPen, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { loadAllModuleRecords } from "@/features/modules/module-utils";
import { mutateModule } from "@/features/modules/module.service";
import { getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { FormPanel, FormSection } from "@/components/ui/form-panel";
import { Sheet } from "@/components/ui/sheet";
import { WizardStepper } from "./wizard-stepper";
import { DetailsStep } from "./steps-basic";
import { OccasionsStep, PreferencesFields, type OccasionsStepHandle } from "./steps-more";
import { AddressesSection, validateAddresses } from "./address-step";
import { ReviewStep } from "./step-review";
import { loadEditData, personFields, saveEditParts } from "./edit-profile";
import { DuplicateFound, findDuplicates, saveWizard, type SaveEndpoints, type SaveResult } from "./wizard-save";
import { EMPTY, type Errors, type RecipientType, type WizardData, clearDraft, draftKey, hasContent, loadDraft, normaliseMobile, storeDraft, validateDetails } from "./wizard-types";
import type { RecipientGroup } from "../group-sheet";
import type { DirectoryRow } from "../recipient-utils";

const STEPS = [
  { key: "details", label: "Recipient Details" },
  { key: "occasions", label: "Occasions" },
  { key: "preferences", label: "Preferences & Delivery" }, // adding a recipient asks for the address only; preferences appear when editing
  { key: "review", label: "Review & Save" },
] as const;
const LAST = STEPS.length - 1;
const SOURCE = { "X-Change-Source": "MANUAL" };
const clean = (v: string) => v.trim() || null;

function rowToInitial(row: DirectoryRow): WizardData {
  return {
    ...EMPTY,
    details: {
      name: String(row.name ?? ""),
      mobile: String(row.mobileNumber ?? ""),
      email: String(row.email ?? ""),
      city: String(row.city ?? (row.address as { city?: string } | undefined)?.city ?? ""),
      company: String((row as Record<string, unknown>).company ?? ""),
      designation: String(row.designation ?? ""),
      // Recipients saved before the rename still carry the old names.
      recipientType: ["EXTERNAL", "BUSINESS"].includes(String((row as Record<string, unknown>).recipientType)) ? "EXTERNAL" : "INTERNAL",
    },
    relationship: { ...EMPTY.relationship, relationship: String(row.relationship ?? ""), isPrimary: row.isPrimary === true },
  };
}

export function RecipientCreatePanel({ open, endpoints, userId, editTarget, onClose, onSaved, onEdited, onViewProfile }: {
  open: boolean; endpoints: SaveEndpoints | null; userId?: string;
  editTarget?: DirectoryRow | null;
  onClose: () => void; onSaved: () => void; onEdited?: () => void; onViewProfile: (id: string) => void;
}) {
  const isEdit = !!editTarget;
  const tenantKey = endpoints?.recipients.split("/")[2];
  const key = draftKey(userId, tenantKey);

  const [data, setData] = useState<WizardData>(EMPTY);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [photo, setPhoto] = useState<File | null>(null);
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateFound["matches"]>([]);
  const [addressErrors, setAddressErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<"" | "checking" | "saving">("");
  const [result, setResult] = useState<SaveResult | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [resume, setResume] = useState<{ data: WizardData; step: number; savedAt: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const bodyTop = useRef<HTMLDivElement>(null);
  const occasionsRef = useRef<OccasionsStepHandle>(null);
  const original = useRef<WizardData>(EMPTY); // what the recipient looked like when editing started
  const [loadingProfile, setLoadingProfile] = useState(false);

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const existingPhotoUrl = isEdit ? (String(editTarget?.avatarUrl ?? "") || null) : null;
  const displayPhotoUrl = photoUrl ?? existingPhotoUrl;

  useEffect(() => {
    if (!open || !endpoints) return;
    setStep(0); setReached(0); setErrors({}); setPhoto(null); setDuplicates([]); setResult(null); setSavedAt(null); setBusy("");
    if (isEdit && editTarget) {
      setData(rowToInitial(editTarget));
      setResume(null);
    } else {
      setData(EMPTY);
      const draft = loadDraft(key);
      setResume(draft && hasContent(draft.data) ? draft : null);
    }
    const groupsLoaded = loadAllModuleRecords(endpoints.groups).then((rows) => rows as unknown as RecipientGroup[]).catch(() => [] as RecipientGroup[]);
    groupsLoaded.then(setGroups);
    if (isEdit && editTarget) {
      // Fill every step with what the recipient already has; the quick details show straight away.
      let cancelled = false;
      setLoadingProfile(true);
      groupsLoaded.then((all) => loadEditData(endpoints, editTarget, all, rowToInitial(editTarget))).then((loaded) => {
        if (cancelled) return;
        original.current = loaded; setData(loaded);
      }).catch(() => { original.current = rowToInitial(editTarget); }).finally(() => { if (!cancelled) setLoadingProfile(false); });
      return () => { cancelled = true; };
    }
  }, [open, isEdit, editTarget?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || isEdit || result || resume || !tenantKey || !hasContent(data)) return;
    const timer = setTimeout(() => { storeDraft(key, data, step); setSavedAt(new Date().toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })); }, 600);
    return () => clearTimeout(timer);
  }, [data, step, open, isEdit, result, resume, key, tenantKey]);

  const patch = useCallback(<K extends keyof WizardData>(section: K, value: Partial<WizardData[K]>) => setData((c) => ({ ...c, [section]: { ...(c[section] as object), ...(value as object) } })), []);
  const changeDetails = (value: Partial<WizardData["details"]>) => {
    patch("details", value);
    setErrors({});
    if ("name" in value || "mobile" in value || "email" in value) { setDuplicates([]); setData((c) => ({ ...c, allowDuplicate: false })); }
  };
  const toTop = () => bodyTop.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const go = (target: number) => { setStep(target); setReached((p) => Math.max(p, target)); setErrors({}); setTimeout(toTop, 0); };

  const checkDetails = async (): Promise<boolean> => {
    const found = validateDetails(data.details);
    if (Object.keys(found).length) { go(0); setErrors(found); return false; }
    if (isEdit || data.allowDuplicate || !endpoints) return true;
    setBusy("checking");
    try {
      const matches = await findDuplicates(endpoints.recipients, data);
      setDuplicates(matches);
      if (matches.length) { go(0); return false; }
    } catch { /* server checks again on save */ }
    finally { setBusy(""); }
    return true;
  };

  const saveNew = async () => {
    if (!endpoints) return;
    setBusy("saving");
    try {
      const outcome = await saveWizard(data, endpoints, photo, groups);
      clearDraft(key);
      setResult(outcome);
      onSaved();
    } catch (error) {
      if (error instanceof DuplicateFound) { setDuplicates(error.matches); go(0); toast.error("This person may already be in your recipients."); }
      else toast.error(getApiErrorMessage(error));
    } finally { setBusy(""); }
  };

  const saveEdit = async () => {
    if (!endpoints || !editTarget?.id) return;
    setBusy("saving");
    try {
      const d = data.details;
      await mutateModule("patch", `${endpoints.recipients}/${String(editTarget.id)}`, {
        name: d.name.trim(),
        mobileNumber: d.mobile.trim() ? normaliseMobile(d.mobile) : null,
        email: clean(d.email), company: clean(d.company), designation: clean(d.designation), city: clean(d.city),
        recipientType: d.recipientType, relationship: data.relationship.relationship || null, isPrimary: data.relationship.isPrimary,
        ...personFields(data, original.current),
      }, undefined, SOURCE);
      const failed = await saveEditParts(data, original.current, endpoints, String(editTarget.id), groups);
      if (failed.length) toast.error(`Saved, but these could not be updated: ${[...new Set(failed)].join(", ")}.`);
      if (photo) {
        const { sendImage } = await import("@/components/ui/image-upload");
        await sendImage("put", `${endpoints.recipients}/${String(editTarget.id)}/photo`, photo).catch(() => undefined);
      }
      toast.success(`${d.name.trim()} updated.`);
      onEdited?.();
      onClose();
    } catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setBusy(""); }
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!endpoints || busy) return;
    if (step === 0) { if (await checkDetails()) go(1); return; }
    if (step === 1) { if (occasionsRef.current && !occasionsRef.current.trySave()) return; go(2); return; }
    if (step === 2) { const found = validateAddresses(data); setAddressErrors(found); if (Object.keys(found).length) return; go(3); return; }
    if (step < LAST) { go(step + 1); return; }
    const addressProblems = validateAddresses(data);
    if (Object.keys(addressProblems).length) { setAddressErrors(addressProblems); go(2); return; }
    if (await checkDetails()) { isEdit ? await saveEdit() : await saveNew(); }
  };

  const reset = () => { clearDraft(key); setStep(0); setReached(0); setData(EMPTY); setPhoto(null); setDuplicates([]); setErrors({}); setResult(null); setSavedAt(null); };
  const close = () => { if (!isEdit && !result && hasContent(data)) setConfirmCancel(true); else onClose(); };

  // ── success state (add mode only) ─────────────────────────────────────────
  if (result) {
    return <FormPanel open={open} onClose={onClose} width="2xl" icon={<CheckCircle2 size={26} />} title="Recipient added"
      description="The recipient is saved and shared with your TOFAA team."
      footer={<div className="flex flex-wrap gap-3">
        <Button className="flex-1" onClick={() => { onClose(); onViewProfile(result.recipientId); }}>View recipient profile</Button>
        <Button variant="secondary" className="flex-1" onClick={reset}><UserPlus size={16} /> Add another</Button>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Close</Button>
      </div>}>
      <p className="text-sm font-semibold capitalize text-ink">{result.name}</p>
      {result.warnings.length > 0 && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Some details could not be saved</p>
        <ul className="mt-1 list-disc pl-5">{result.warnings.map((w) => <li key={w.section}>{w.section}: {w.message}</li>)}</ul>
      </div>}
    </FormPanel>;
  }

  const locked = busy !== "" || (isEdit && loadingProfile);
  const stepper = <WizardStepper steps={isEdit ? STEPS : STEPS.map((s) => (s.key === "preferences" ? { ...s, label: "Delivery Address" } : s))} current={step} reached={reached} onGo={go} />;

  return <>
    <FormPanel open={open} onClose={close} width="2xl" locked={locked} onSubmit={(e) => void submit(e)}
      icon={isEdit ? <UserPen size={26} /> : <UserPlus size={26} />}
      title={isEdit ? "Edit Recipient" : "Add Recipient"}
      description={isEdit ? `Updating ${editTarget?.name ?? "recipient"}'s profile. Only the name is required.` : "Create a new recipient profile. Only the name is required."}
      stepper={stepper}
      footer={<div className="space-y-2">
        {savedAt && <p className="text-xs text-muted" aria-live="polite">Draft saved at {savedAt}</p>}
        <div className="flex items-center justify-between gap-3">
          {step === 0
            ? <Button type="button" variant="secondary" disabled={locked} onClick={close}>Cancel</Button>
            : <Button type="button" variant="secondary" disabled={locked} onClick={() => go(step - 1)}><ArrowLeft size={16} /> Back</Button>}
          <div className="flex gap-3">
            {step > 0 && step < LAST && <Button type="button" variant="ghost" disabled={locked} onClick={() => go(step + 1)}>Skip</Button>}
            {step === LAST
              ? <Button type="submit" disabled={locked || !endpoints}>{busy === "saving" ? "Saving…" : busy === "checking" ? "Checking…" : isEdit ? "Save Changes" : "Save Recipient"}</Button>
              : <Button type="submit" disabled={locked || !endpoints}>{busy === "checking" ? "Checking…" : <>Next <ArrowRight size={16} /></>}</Button>}
          </div>
        </div>
      </div>}>

      <div ref={bodyTop} />

      {!isEdit && resume && step === 0 && <div role="region" aria-label="Saved draft" className="rounded-xl border border-brand/25 bg-brand-soft/50 px-4 py-3">
        <p className="text-sm text-ink"><span className="font-semibold">You have a saved draft</span> for {resume.data.details.name.trim() || "a new recipient"} from {new Date(resume.savedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.</p>
        <div className="mt-2 flex gap-2">
          <Button type="button" size="sm" onClick={() => { setData(resume.data); setStep(Math.min(resume.step ?? 0, LAST)); setReached(Math.min(resume.step ?? 0, LAST)); setResume(null); }}>Continue draft</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => { clearDraft(key); setResume(null); }}>Start over</Button>
        </div>
      </div>}

      {step === 0 && <FormSection title="Recipient Details" hint="The basics. Only the full name is required.">
        <DetailsStep data={data.details} errors={errors} photoUrl={displayPhotoUrl} onChange={changeDetails} onPhoto={setPhoto}
          duplicates={duplicates} confirmedDifferent={data.allowDuplicate}
          onConfirmDifferent={() => { setData((c) => ({ ...c, allowDuplicate: true })); setDuplicates([]); go(1); }}
          groups={groups} groupData={data.relationship} onGroups={(v) => patch("relationship", v)} />
      </FormSection>}

      {step === 1 && <FormSection title="Occasions" hint="Optional. Birthdays, anniversaries or any date worth gifting for.">
        <OccasionsStep ref={occasionsRef} items={data.occasions} recipientsEndpoint={endpoints?.recipients ?? ""} onChange={(occasions) => setData((c) => ({ ...c, occasions }))} />
      </FormSection>}

      {step === 2 && <FormSection title={isEdit ? "Preferences & Delivery" : "Delivery address"} hint={isEdit ? "Optional. Gifting preferences and where gifts are delivered." : "Optional. Where gifts are delivered. Preferences can be added later by editing the recipient."}>
        {isEdit && <div className="mb-7"><PreferencesFields prefs={data.preferences} onPrefs={(v) => patch("preferences", v)} /></div>}
        <AddressesSection addresses={data.addresses} same={data.sameAddress} errors={addressErrors} onChange={(addresses, sameAddress) => { setAddressErrors({}); setData((c) => ({ ...c, addresses, sameAddress })); }} />
      </FormSection>}

      {step === 3 && <ReviewStep data={data} groups={groups} photoUrl={displayPhotoUrl} onEdit={go} panel showPreferences={isEdit} />}
    </FormPanel>

    <Sheet open={confirmCancel} zIndex="z-[90]" labelledBy="discard-title" className="max-w-md" onClose={() => setConfirmCancel(false)}>
      <h2 id="discard-title" className="text-[17px] font-semibold text-ink">Close without saving?</h2>
      <p className="mt-2 text-sm text-muted">Your entries are kept as a draft on this device, so you can continue later from Add Recipient.</p>
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="secondary" className="shrink-0" onClick={() => setConfirmCancel(false)}>Keep editing</Button>
        <div className="flex shrink-0 gap-3">
          <Button variant="secondary" className="shrink-0 text-rose-700 hover:bg-rose-50" onClick={() => { clearDraft(key); setConfirmCancel(false); onClose(); }}>Discard draft</Button>
          <Button className="shrink-0 whitespace-nowrap" onClick={() => { storeDraft(key, data, step); setConfirmCancel(false); onClose(); }}>Keep draft & close</Button>
        </div>
      </div>
    </Sheet>
  </>;
}
