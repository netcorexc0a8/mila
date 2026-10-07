import type { HistoryItem, HistoryStatus } from './history';
import { isCustomLot, type CustomLot } from './custom';

/** File format of a backup. Kept small and readable so it can be inspected or moved between phones. */
export interface Backup {
  app: 'mila';
  version: 1;
  createdAt: string;
  history: HistoryItem[];
  /** The user's own blocked batches (added in Mila; older copies have none). */
  blocked?: CustomLot[];
}

/** Copies saved before the app was renamed to Mila. */
const APP_IDS = ['mila', 'mozhno-malyshu'];
const NOT_A_BACKUP = 'Это не файл резервной копии Mila.';

const STATUSES: HistoryStatus[] = ['recalled', 'similar', 'not-recalled'];

export function makeBackup(history: HistoryItem[], blocked: CustomLot[] = [], now = new Date()): Backup {
  return { app: 'mila', version: 1, createdAt: now.toISOString(), history, blocked };
}

export function backupFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `mila-${d}.json`;
}

function isItem(x: unknown): x is HistoryItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.ts === 'number' &&
    Number.isFinite(o.ts) &&
    typeof o.lot === 'string' &&
    /^[A-Z0-9]{1,24}$/.test(o.lot) &&
    STATUSES.includes(o.status as HistoryStatus)
  );
}

/** Parse a backup file; throws a user-facing (Russian) message when the file is not a backup. */
export function parseBackup(text: string): { history: HistoryItem[]; blocked: CustomLot[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(NOT_A_BACKUP);
  }
  const b = data as { app?: unknown; version?: unknown; history?: unknown; blocked?: unknown } | null;
  if (!b || !APP_IDS.includes(b.app as string) || !Array.isArray(b.history)) throw new Error(NOT_A_BACKUP);
  if (b.version !== 1) throw new Error('Копия сделана более новой версией приложения. Обновите приложение.');
  return {
    history: b.history.filter(isItem).map(({ ts, lot, status }) => ({ ts, lot, status })),
    blocked: (Array.isArray(b.blocked) ? b.blocked : [])
      .filter(isCustomLot)
      .map(({ lot, note, ts }) => ({ lot, note: note.slice(0, 60), ts })),
  };
}

/**
 * Merge restored checks into the current history: one entry per batch number,
 * the most recent check wins, newest first. Restoring the same file twice changes nothing.
 */
export function mergeHistory(current: HistoryItem[], restored: HistoryItem[]): { items: HistoryItem[]; added: number } {
  const byLot = new Map<string, HistoryItem>();
  for (const h of current) byLot.set(h.lot, h);
  let added = 0;
  for (const h of restored) {
    const existing = byLot.get(h.lot);
    if (!existing) added++;
    if (!existing || h.ts > existing.ts) byLot.set(h.lot, h);
  }
  return { items: [...byLot.values()].sort((a, b) => b.ts - a.ts), added };
}
