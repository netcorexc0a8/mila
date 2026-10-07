import { describe, expect, it } from 'vitest';
import { addToHistory, clearHistory, loadHistory, type KeyValueStore } from './history';

function memoryStore(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

describe('history', () => {
  it('stores newest first and de-duplicates by lot', () => {
    const s = memoryStore();
    addToHistory({ ts: 1, lot: 'A', status: 'not-recalled' }, s);
    addToHistory({ ts: 2, lot: 'B', status: 'recalled' }, s);
    addToHistory({ ts: 3, lot: 'A', status: 'not-recalled' }, s);
    expect(loadHistory(s).map((h) => h.lot)).toEqual(['A', 'B']);
  });

  it('survives corrupted storage', () => {
    const s = memoryStore();
    s.setItem('mm.history.v1', '{oops');
    expect(loadHistory(s)).toEqual([]);
  });

  it('clears', () => {
    const s = memoryStore();
    addToHistory({ ts: 1, lot: 'A', status: 'not-recalled' }, s);
    clearHistory(s);
    expect(loadHistory(s)).toEqual([]);
  });

  it('works without storage', () => {
    expect(loadHistory(null)).toEqual([]);
  });
});
