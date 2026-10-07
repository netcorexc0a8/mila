import { describe, expect, it } from 'vitest';
import { backupFileName, makeBackup, mergeHistory, parseBackup } from './backup';
import type { HistoryItem } from './history';

const a: HistoryItem = { ts: 100, lot: '61210346AB', status: 'not-recalled' };
const b: HistoryItem = { ts: 200, lot: '52800017C2', status: 'recalled' };

describe('backup', () => {
  it('round-trips through JSON', () => {
    const file = JSON.stringify(makeBackup([a, b], new Date('2026-10-07T12:00:00Z')));
    expect(parseBackup(file)).toEqual([a, b]);
  });

  it('names the file by date', () => {
    expect(backupFileName(new Date('2026-10-07T12:00:00Z'))).toBe('mozhno-malyshu-2026-10-07.json');
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('hello')).toThrow(/не файл резервной копии/);
    expect(() => parseBackup('{"history":[]}')).toThrow(/не файл резервной копии/);
    expect(() => parseBackup('{"app":"mozhno-malyshu","version":2,"history":[]}')).toThrow(/более новой версией/);
  });

  it('drops malformed entries and extra fields', () => {
    const file = JSON.stringify({
      app: 'mozhno-malyshu',
      version: 1,
      history: [a, { ts: 'x', lot: 'A', status: 'recalled' }, { ...b, extra: '<script>' }, { ts: 1, lot: '<b>', status: 'recalled' }],
    });
    expect(parseBackup(file)).toEqual([a, b]);
  });

  it('merges without duplicates, newest check wins', () => {
    const newer = { ...a, ts: 300 };
    const { items, added } = mergeHistory([a], [newer, b]);
    expect(items).toEqual([newer, b]);
    expect(added).toBe(1);
    expect(mergeHistory(items, [newer, b]).added).toBe(0);
  });
});
