import { describe, expect, it } from 'vitest';
import { backupFileName, makeBackup, mergeHistory, parseBackup } from './backup';
import type { HistoryItem } from './history';

const a: HistoryItem = { ts: 100, lot: '61210346AB', status: 'not-recalled' };
const b: HistoryItem = { ts: 200, lot: '52800017C2', status: 'recalled' };

describe('backup', () => {
  it('round-trips through JSON', () => {
    const blocked = [{ lot: 'ABC123456', note: 'Малютка', ts: 50 }];
    const file = JSON.stringify(makeBackup([a, b], blocked, new Date('2026-10-07T12:00:00Z')));
    expect(parseBackup(file)).toEqual({ history: [a, b], blocked });
  });

  it('reads copies saved before the rename, without blocked batches', () => {
    const old = JSON.stringify({ app: 'mozhno-malyshu', version: 1, createdAt: '', history: [a] });
    expect(parseBackup(old)).toEqual({ history: [a], blocked: [] });
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-10-07T12:00:00Z'))).toBe('mila-2026-10-07.json');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('hello')).toThrow(/не файл резервной копии/);
    expect(() => parseBackup('{"history":[]}')).toThrow(/не файл резервной копии/);
    expect(() => parseBackup('{"app":"mila","version":2,"history":[]}')).toThrow(/более новой версией/);
  });

  it('drops malformed entries and extra fields', () => {
    const file = JSON.stringify({
      app: 'mila',
      version: 1,
      history: [a, { ts: 'x', lot: 'A', status: 'recalled' }, { ...b, extra: '<script>' }, { ts: 1, lot: '<b>', status: 'recalled' }],
      blocked: [{ lot: '<img>', note: '', ts: 1 }, { lot: '12345', note: '', ts: 1 }, { lot: '1234567', note: 'x', ts: 2, extra: 1 }],
    });
    expect(parseBackup(file)).toEqual({ history: [a, b], blocked: [{ lot: '1234567', note: 'x', ts: 2 }] });
  });

  it('merges without duplicates, newest check wins', () => {
    const newer = { ...a, ts: 300 };
    const { items, added } = mergeHistory([a], [newer, b]);
    expect(items).toEqual([newer, b]);
    expect(added).toBe(1);
    expect(mergeHistory(items, [newer, b]).added).toBe(0);
  });
});
