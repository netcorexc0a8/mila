import type { KeyValueStore } from './history';
import { MIN_CUSTOM_LENGTH, normalizeLot, officialEntry, setCustomLots } from './lot';

/** A batch number the user blocked themselves (another brand, a recall they heard about, a can that made the baby ill). */
export interface CustomLot {
  lot: string;
  note: string;
  ts: number;
}

const KEY = 'mm.blocked.v1';
const MAX_NOTE = 60;
const MAX_LOT = 24;

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function isCustomLot(x: unknown): x is CustomLot {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.lot === 'string' &&
    new RegExp(`^[A-Z0-9]{${MIN_CUSTOM_LENGTH},${MAX_LOT}}$`).test(o.lot) &&
    typeof o.note === 'string' &&
    typeof o.ts === 'number' &&
    Number.isFinite(o.ts)
  );
}

export function loadCustomLots(store = defaultStore()): CustomLot[] {
  try {
    const raw = store?.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isCustomLot) : [];
  } catch {
    return [];
  }
}

/** Save the list and make `checkLot` use it straight away. */
export function saveCustomLots(items: CustomLot[], store = defaultStore()): boolean {
  setCustomLots(items);
  try {
    store?.setItem(KEY, JSON.stringify(items));
    return !!store;
  } catch {
    return false;
  }
}

/** Load the saved list into the checker; call once at start-up. */
export function initCustomLots(store = defaultStore()): CustomLot[] {
  const items = loadCustomLots(store);
  setCustomLots(items);
  return items;
}

export type AddResult =
  | { ok: true; item: CustomLot; items: CustomLot[] }
  | { ok: false; error: string };

export function addCustomLot(rawLot: string, rawNote: string, store = defaultStore(), now = Date.now()): AddResult {
  const lot = normalizeLot(rawLot);
  const note = rawNote.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE);
  if (!lot) return { ok: false, error: 'Введите номер партии.' };
  if (lot.length < MIN_CUSTOM_LENGTH) return { ok: false, error: `Номер слишком короткий: нужно не меньше ${MIN_CUSTOM_LENGTH} символов.` };
  if (lot.length > MAX_LOT) return { ok: false, error: `Номер слишком длинный: не больше ${MAX_LOT} символов.` };
  if (officialEntry(lot)) return { ok: false, error: 'Эта партия уже есть в официальном списке отзыва Nestlé.' };
  const items = loadCustomLots(store);
  if (items.some((i) => i.lot === lot)) return { ok: false, error: 'Эта партия уже в вашем списке.' };
  const item: CustomLot = { lot, note, ts: now };
  const next = [item, ...items];
  if (!saveCustomLots(next, store)) return { ok: false, error: 'Не удалось сохранить: память браузера недоступна.' };
  return { ok: true, item, items: next };
}

export function removeCustomLot(lot: string, store = defaultStore()): CustomLot[] {
  const next = loadCustomLots(store).filter((i) => i.lot !== lot);
  saveCustomLots(next, store);
  return next;
}

/** Merge restored batches into the current list: one entry per number, an existing note is kept. */
export function mergeCustomLots(current: CustomLot[], restored: CustomLot[]): { items: CustomLot[]; added: number } {
  const byLot = new Map(current.map((i) => [i.lot, i]));
  let added = 0;
  for (const r of restored) {
    const existing = byLot.get(r.lot);
    if (!existing) {
      byLot.set(r.lot, r);
      added++;
    } else if (!existing.note && r.note) {
      byLot.set(r.lot, { ...existing, note: r.note });
    }
  }
  return { items: [...byLot.values()].sort((a, b) => b.ts - a.ts), added };
}
