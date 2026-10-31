import { useSyncExternalStore } from "react";

/** What the save indicator shows: how many saves/uploads are in flight, and the last failure. */
interface SyncState {
  pending: number;
  error: string | null;
  savedAt: number | null;
}

let state: SyncState = { pending: 0, error: null, savedAt: null };
const listeners = new Set<() => void>();

function set(next: Partial<SyncState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

/** Run a cloud write and reflect it in the indicator. Rethrows so callers can react too. */
export async function track<T>(work: () => Promise<T>): Promise<T> {
  set({ pending: state.pending + 1 });
  try {
    const out = await work();
    set({ pending: state.pending - 1, error: null, savedAt: Date.now() });
    return out;
  } catch (e) {
    set({ pending: state.pending - 1, error: (e as Error).message || "Couldn't save." });
    throw e;
  }
}

export function useSyncState() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => state,
  );
}
