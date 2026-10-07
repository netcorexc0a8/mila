import type { HistoryItem, HistoryStatus } from './history';

/** File format of a backup. Kept small and readable so it can be inspected or moved between phones. */
export interface Backup {
  app: 'mozhno-malyshu';
  version: 1;
  createdAt: string;
  history: HistoryItem[];
}

const STATUSES: HistoryStatus[] = ['recalled', 'similar', 'not-recalled'];

export function makeBackup(history: HistoryItem[], now = new Date()): Backup {
  return { app: 'mozhno-malyshu', version: 1, createdAt: now.toISOString(), history };
}

export function backupFileName(now = new Date()): string {
  const d = now.toISOString().slice(0, 10);
  return `mozhno-malyshu-${d}.json`;
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
export function parseBackup(text: string): HistoryItem[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Это не файл резервной копии «Можно малышу».');
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'mozhno-malyshu' || !Array.isArray(b.history)) {
    throw new Error('Это не файл резервной копии «Можно малышу».');
  }
  if (b.version !== 1) throw new Error('Копия сделана более новой версией приложения. Обновите приложение.');
  return b.history.filter(isItem).map(({ ts, lot, status }) => ({ ts, lot, status }));
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
