// DR-14 — the seam between "a surface is stuck retrying" and "the app says so once".
//
// Module-level publish/subscribe, deliberately NOT a React context (the story bans one): any number
// of surfaces can register a pending transient failure, and the single global <ToastHost /> reads the
// merged count through `useSyncExternalStore`. No React import lives here.
//
// ponytail: one merged toast, no stack and no per-surface queue — the entries are only counted, never
// labelled. The day two distinct simultaneous failures must be told apart is the day this Set becomes
// a queue of `{ id, message }`; until then a count is the whole state.

interface Entry {
  retry: () => void;
}

const entries = new Set<Entry>();
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

/** Register a surface as "failing transiently, still retrying". Returns its (idempotent) clear fn. */
export function beginTransientFailure(retry: () => void): () => void {
  const entry: Entry = { retry };
  entries.add(entry);
  emit();
  return () => {
    if (entries.delete(entry)) emit();
  };
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getFailingCount(): number {
  return entries.size;
}

/** SSR snapshot for `useSyncExternalStore` — the server never has a pending client fetch. */
export function getServerCount(): 0 {
  return 0;
}

/** « Réessayer maintenant » — one merged toast means one button for every failing surface (D-3). */
export function retryAll(): void {
  [...entries].forEach((entry) => entry.retry());
}
