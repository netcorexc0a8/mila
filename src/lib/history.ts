export type HistoryStatus = 'recalled' | 'similar' | 'not-recalled';

export interface HistoryItem {
  ts: number;
  lot: string;
  status: HistoryStatus;
  product?: string;
}

const KEY = 'mm.history.v1';
const LIMIT = 100;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadHistory(store = defaultStore()): HistoryItem[] {
  try {
    const raw = store?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

/** Add a check to the top of the history; re-checking the same lot moves it up instead of duplicating. */
export function addToHistory(item: HistoryItem, store = defaultStore()): HistoryItem[] {
  const next = [item, ...loadHistory(store).filter((h) => h.lot !== item.lot)].slice(0, LIMIT);
  try {
    store?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: history is a convenience, the check itself still works.
  }
  return next;
}

export function clearHistory(store = defaultStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
