import { useCallback, useEffect, useState } from "react";

type AsyncState<T> = { data: T | null; loading: boolean; error: string | null };

/** Runs `loader` whenever `deps` change and exposes a `reload` function. */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    loader().then(
      (data) => { if (alive) setState({ data, loading: false, error: null }); },
      (error: unknown) => { if (alive) setState({ data: null, loading: false, error: error instanceof Error ? error.message : "Something went wrong." }); },
    );
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}

/** Wraps a save action: tracks "busy" and the error message to show in the form. */
export function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(null);
    try { await action(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  return { busy, error, setError, run };
}
