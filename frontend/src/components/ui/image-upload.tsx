"use client";

import { useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { clearRequestCache, mutateModule } from "@/features/modules/module.service";
import { api, getApiErrorMessage } from "@/services/api-client";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

const TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Sends a picture as the raw request body (PUT for avatars and logos, POST for proposal photos). Returns the API's data. */
export async function sendImage<T = unknown>(method: "put" | "post", url: string, file: File): Promise<T> {
  const { data } = await api.request({ method, url, data: file, headers: { "Content-Type": file.type }, timeout: 60_000 });
  clearRequestCache();
  return (data?.data ?? data) as T;
}
export const deleteImage = (url: string) => mutateModule("delete", url);

/** Shows the current picture with buttons to choose a new one or remove it. The caller says where the file goes. */
export function ImageUpload({ name, src, shape = "circle", maxMb = 2, size = "h-16 w-16 text-lg", label, onUpload, onRemove }: {
  name?: string | null; src?: string | null; shape?: "circle" | "square"; maxMb?: number; size?: string; label?: string;
  onUpload: (file: File) => Promise<void>; onRemove?: () => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch (err) { toast.error(getApiErrorMessage(err)); } finally { setBusy(false); }
  };
  const choose = (file?: File) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) { toast.error("Choose a PNG, JPG or WebP image."); return; }
    if (file.size > maxMb * 1024 * 1024) { toast.error(`That image is over ${maxMb} MB. Choose a smaller one.`); return; }
    void run(() => onUpload(file));
  };
  return <div className="flex items-center gap-4">
    <Avatar name={name} src={src} shape={shape} className={size} />
    <div className="flex flex-wrap items-center gap-2">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} aria-label={label ?? "Choose a picture"} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => input.current?.click()}><ImagePlus size={15} /> {busy ? "Saving…" : src ? "Change photo" : "Upload photo"}</Button>
      {src && onRemove && <Button size="sm" variant="ghost" disabled={busy} className="text-rose-700 hover:bg-rose-50" onClick={() => void run(onRemove)}><Trash2 size={15} /> Remove</Button>}
      <p className="w-full text-xs text-muted">PNG, JPG or WebP, up to {maxMb} MB.</p>
    </div>
  </div>;
}
