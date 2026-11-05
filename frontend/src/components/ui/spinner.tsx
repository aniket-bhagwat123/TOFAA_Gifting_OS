export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div role="status" aria-label={label} className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />;
}
