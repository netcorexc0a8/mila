import { describe, expect, it } from 'vitest';
import { parseCanDates, parseDate, productionDateFromLot } from './dates';

describe('parseDate', () => {
  it('reads day month year in several layouts', () => {
    expect(parseDate('30 04 2028')).toBe('30.04.2028');
    expect(parseDate('30.04.2028')).toBe('30.04.2028');
    expect(parseDate('30042028')).toBe('30.04.2028');
    expect(parseDate('O1 05 2026')).toBe('01.05.2026');
  });
  it('reads month year', () => {
    expect(parseDate('06.2027')).toBe('06.2027');
  });
  it('rejects nonsense', () => {
    expect(parseDate('99 99 9999')).toBeUndefined();
    expect(parseDate('ABC')).toBeUndefined();
  });
});

describe('parseCanDates', () => {
  it('reads the real can print', () => {
    const text = 'L- 61210346AB 05:13\nMAN 01 05 2026\nEXP 30 04 2028';
    expect(parseCanDates(text)).toEqual({ man: '01.05.2026', exp: '30.04.2028' });
  });
  it('reads MFG/EXP month-year prints', () => {
    expect(parseCanDates('LOT 528701\nMFG 06.2025\nEXP 06.2027')).toEqual({ man: '06.2025', exp: '06.2027' });
  });
});

describe('productionDateFromLot', () => {
  const now = new Date('2026-10-07');
  it('decodes year digit and day of year', () => {
    expect(productionDateFromLot('61210346AB', now)).toBe('01.05.2026'); // matches "MAN 01 05 2026" on the can
    expect(productionDateFromLot('51510346AB', now)).toBe('31.05.2025');
    expect(productionDateFromLot('53310806 11', now)).toBe('27.11.2025');
  });
  it('rejects impossible days', () => {
    expect(productionDateFromLot('5999000000', now)).toBeUndefined();
  });
});
