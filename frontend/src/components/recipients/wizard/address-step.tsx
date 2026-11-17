"use client";

import { InputField } from "@/components/ui/input-field";
import { type AddressItem, type Errors, type WizardData, newKey, validateAddress } from "./wizard-types";

/** Two fixed delivery addresses. They use the existing RESIDENTIAL and OTHER labels in the database, shown as Permanent and Current. */
export const PERMANENT = "PERMANENT" as const;
export const CURRENT = "CURRENT" as const;
/** Rows saved before the Permanent / Current names existed. */
const OLD_NAME: Record<string, AddressItem["label"]> = { RESIDENTIAL: "PERMANENT", OTHER: "CURRENT" };
const nameOf = (label: string) => OLD_NAME[label] ?? label;

const blank = (a?: AddressItem) => !a || ![a.line1, a.line2, a.city, a.postalCode].some((v) => v.trim());
const slot = (items: AddressItem[], label: AddressItem["label"]) => items.find((a) => nameOf(a.label) === label);

/** Puts the two addresses back into the list: empty ones are dropped, and the current address is the one gifts go to when there is one. */
function assemble(items: AddressItem[], permanent: AddressItem | undefined, current: AddressItem | undefined): AddressItem[] {
  const others = items.filter((a) => nameOf(a.label) !== PERMANENT && nameOf(a.label) !== CURRENT);
  const list = [permanent, current].filter((a): a is AddressItem => !blank(a));
  const target = list.find((a) => a.label === CURRENT) ?? list[0];
  return [...list.map((a) => ({ ...a, isDefault: a === target })), ...others.map((a) => ({ ...a, isDefault: false }))];
}

/** Checks whichever of the two addresses has been started. Both are optional. */
export function validateAddresses(data: Pick<WizardData, "addresses" | "sameAddress">): Errors {
  const errors: Errors = {};
  const check = (prefix: string, a?: AddressItem) => { if (!blank(a)) for (const [k, v] of Object.entries(validateAddress(a!))) errors[`${prefix}.${k}`] = v; };
  check("permanent", slot(data.addresses, PERMANENT));
  if (!data.sameAddress) check("current", slot(data.addresses, CURRENT));
  return errors;
}

function Fields({ title, label, item, disabled, errors, prefix, onChange }: {
  title: string; label: AddressItem["label"]; item?: AddressItem; disabled?: boolean; errors: Errors; prefix: string; onChange: (next: AddressItem) => void;
}) {
  const value = item ?? { key: newKey(), label, line1: "", line2: "", city: "", postalCode: "", isDefault: false };
  const set = (patch: Partial<AddressItem>) => onChange({ ...value, ...patch });
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2"><InputField label={`${title}`} disabled={disabled} placeholder="Enter address" value={value.line1} onChange={(event) => set({ line1: event.target.value })} error={errors[`${prefix}.line1`]} /></div>
    <div className="sm:col-span-2"><InputField label="Address line 2" disabled={disabled} placeholder="Enter address line 2" value={value.line2} onChange={(event) => set({ line2: event.target.value })} /></div>
    <InputField label="City" disabled={disabled} placeholder="Enter city" value={value.city} onChange={(event) => set({ city: event.target.value })} error={errors[`${prefix}.city`]} />
    <InputField label="PIN code" disabled={disabled} inputMode="numeric" maxLength={6} placeholder="Enter PIN code" value={value.postalCode} onChange={(event) => set({ postalCode: event.target.value })} error={errors[`${prefix}.postalCode`]} />
  </div>;
}

export function AddressesSection({ addresses, same, errors, onChange }: { addresses: AddressItem[]; same: boolean; errors: Errors; onChange: (addresses: AddressItem[], same: boolean) => void }) {
  const permanent = slot(addresses, PERMANENT);
  const current = slot(addresses, CURRENT);
  const setPermanent = (next: AddressItem) => onChange(assemble(addresses, next, same ? undefined : current), same);
  const setCurrent = (next: AddressItem) => onChange(assemble(addresses, permanent, next), same);
  const toggleSame = (checked: boolean) => onChange(assemble(addresses, permanent, checked ? undefined : current), checked);
  return <div className="space-y-6">
    <div>
      <h3 className="mb-3 text-base font-semibold text-ink">Permanent address</h3>
      <Fields title="Address" label={PERMANENT} item={permanent} errors={errors} prefix="permanent" onChange={setPermanent} />
    </div>
    <div>
      <h3 className="text-base font-semibold text-ink">Current address</h3>
      <label className="mb-3 mt-2 flex min-h-9 cursor-pointer items-center gap-2.5 text-sm text-ink">
        <input type="checkbox" checked={same} onChange={(event) => toggleSame(event.target.checked)} className="h-4 w-4 accent-brand" />Same as permanent address
      </label>
      {same
        ? <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-muted">Gifts will be delivered to the permanent address.</p>
        : <Fields title="Address" label={CURRENT} item={current} errors={errors} prefix="current" onChange={setCurrent} />}
    </div>
  </div>;
}
