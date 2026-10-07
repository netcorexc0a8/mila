import { afterEach, describe, expect, it } from 'vitest';
import { addCustomLot, initCustomLots, loadCustomLots, mergeCustomLots, removeCustomLot } from './custom';
import { checkLot, extractLotCandidates, setCustomLots } from './lot';
import type { KeyValueStore } from './history';

function memory(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

afterEach(() => setCustomLots([]));

describe('own blocked batches', () => {
  it('adds a batch and checkLot reports it as blocked with the note', () => {
    const store = memory();
    const r = addCustomLot(' l- 7123 4567 ', 'Малютка 2', store, 1);
    expect(r.ok).toBe(true);
    expect(loadCustomLots(store)).toEqual([{ lot: 'L71234567', note: 'Малютка 2', ts: 1 }]);
    const c = checkLot('L71234567');
    expect(c.status).toBe('recalled');
    if (c.status === 'recalled') {
      expect(c.entry.custom).toEqual({ note: 'Малютка 2' });
      expect(c.entry.product.name).toBe('Малютка 2');
    }
  });

  it('matches short numbers and numbers inside a longer OCR line', () => {
    const store = memory();
    addCustomLot('А12345', '', store);
    expect(checkLot('A12345').status).toBe('recalled');
    expect(checkLot('LOT A12345 14:32').status).toBe('recalled');
    expect(checkLot('A12346').status).toBe('too-short');
    expect(extractLotCandidates('LOT A12345XYZW')).toEqual(['A12345']);
  });

  it('flags a one-character difference as similar', () => {
    addCustomLot('9988776655', '', memory());
    const c = checkLot('9988776656');
    expect(c.status).toBe('similar');
  });

  it('rejects short, duplicate and official numbers', () => {
    const store = memory();
    expect(addCustomLot('123', '', store)).toMatchObject({ ok: false, error: expect.stringMatching(/короткий/) });
    expect(addCustomLot('52800017C2', '', store)).toMatchObject({ ok: false, error: expect.stringMatching(/официальном/) });
    addCustomLot('ABCDEF', '', store);
    expect(addCustomLot('abcdef', '', store)).toMatchObject({ ok: false, error: expect.stringMatching(/уже в вашем/) });
  });

  it('official recall wins over an own batch inside the same text', () => {
    addCustomLot('C2XYZ1', 'моя', memory());
    const c = checkLot('52800017C2XYZ1');
    expect(c.status === 'recalled' && c.entry.custom).toBeFalsy();
  });

  it('removes a batch and stops matching it', () => {
    const store = memory();
    addCustomLot('ABCDEF', '', store);
    removeCustomLot('ABCDEF', store);
    expect(loadCustomLots(store)).toEqual([]);
    expect(checkLot('ABCDEF').status).toBe('too-short');
  });

  it('loads saved batches into the checker at start-up', () => {
    const store = memory();
    store.setItem('mm.blocked.v1', JSON.stringify([{ lot: 'QWERTY12', note: '', ts: 1 }, { lot: '<b>', note: '', ts: 1 }]));
    expect(initCustomLots(store)).toHaveLength(1);
    expect(checkLot('QWERTY12').status).toBe('recalled');
  });

  it('merges restored batches without duplicates, keeping notes', () => {
    const cur = [{ lot: 'AAAAAA', note: '', ts: 1 }];
    const res = [{ lot: 'AAAAAA', note: 'смесь', ts: 5 }, { lot: 'BBBBBB', note: '', ts: 3 }];
    const { items, added } = mergeCustomLots(cur, res);
    expect(added).toBe(1);
    expect(items).toEqual([{ lot: 'BBBBBB', note: '', ts: 3 }, { lot: 'AAAAAA', note: 'смесь', ts: 1 }]);
  });
});
