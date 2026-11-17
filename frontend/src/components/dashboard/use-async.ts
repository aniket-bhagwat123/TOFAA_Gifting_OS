import { useEffect, useState } from "react";

/** Runs a loader whenever its key changes. `data` is null while loading or after a failure (`failed` tells which). */
export function useAsync<T>(load: (() => Promise<T>) | null, key: string) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; failed: boolean }>({ data: null, loading: !!load, failed: false });
  useEffect(() => {
    if (!load) { setState({ data: null, loading: false, failed: false }); return; }
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, failed: false }));
    // One quiet retry: a first call after the server was idle can fail once and work straight after.
    load().catch(() => new Promise<T>((resolve, reject) => setTimeout(() => load().then(resolve, reject), 800))).then((data) => { if (!cancelled) setState({ data, loading: false, failed: false }); })
      .catch(() => { if (!cancelled) setState({ data: null, loading: false, failed: true }); });
    return () => { cancelled = true; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}
