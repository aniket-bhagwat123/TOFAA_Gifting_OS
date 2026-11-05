"use client";

import { useEffect, useState } from "react";

export function Switch({ name, labelId, value, error, onChange }: {
  name: string;
  labelId: string;
  value: string;
  error?: string;
  onChange: () => void;
}) {
  const [enabled, setEnabled] = useState(value === "true");
  useEffect(() => setEnabled(value === "true"), [value]);
  return <div className="flex items-center gap-3">
    <input type="hidden" name={name} value={String(enabled)} />
    <button type="button" role="switch" aria-labelledby={labelId} aria-checked={enabled} aria-invalid={!!error} onClick={() => { setEnabled((current) => !current); onChange(); }} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${error ? "ring-2 ring-rose-300" : ""} ${enabled ? "bg-brand" : "bg-slate-300"}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{enabled ? "Active" : "Inactive"}</span>
  </div>;
}
