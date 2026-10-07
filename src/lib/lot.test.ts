import { describe, expect, it } from 'vitest';
import { RECALLED_PRODUCTS } from '../data/recall';
import { ALL_RECALLED_LOTS, canonicalLot, checkLot, extractLotCandidates, consensusSpelling, fixDigitPrefix, FrameVotes, hasConsensus, normalizeLot, rankCandidates } from './lot';

describe('recall data', () => {
  it('has the 57 published lots, each 10 characters', () => {
    expect(ALL_RECALLED_LOTS).toHaveLength(57);
    for (const lot of ALL_RECALLED_LOTS) expect(lot).toMatch(/^[0-9A-Z]{10}$/);
  });

  it('has no duplicate lots, even after collapsing confusable characters', () => {
    const canon = ALL_RECALLED_LOTS.map(canonicalLot);
    expect(new Set(canon).size).toBe(canon.length);
  });

  it('has 13 product/size rows', () => {
    expect(RECALLED_PRODUCTS).toHaveLength(13);
  });
});

describe('normalizeLot', () => {
  it('strips spaces and punctuation and uppercases', () => {
    expect(normalizeLot(' 5151-0346 ab ')).toBe('51510346AB');
  });
  it('maps Cyrillic look-alike letters to Latin', () => {
    expect(normalizeLot('51510346АВ')).toBe('51510346AB'); // Cyrillic А, В
    expect(normalizeLot('52790742С1')).toBe('52790742C1'); // Cyrillic С
  });
});

describe('checkLot', () => {
  it('finds every recalled lot', () => {
    for (const p of RECALLED_PRODUCTS) {
      for (const lot of p.lots) {
        const r = checkLot(lot);
        expect(r.status).toBe('recalled');
        if (r.status === 'recalled') expect(r.entry.product).toBe(p);
      }
    }
  });

  it('returns the product for a recalled lot', () => {
    const r = checkLot('52750742F1');
    expect(r.status === 'recalled' && r.entry.product.name).toBe('NAN SUPREME');
  });

  it('treats confusable characters as equal', () => {
    expect(checkLot('5151O346A8').status).toBe('recalled'); // O for 0, 8 for B
    expect(checkLot('52OOI678II').status).toBe('recalled'); // 5200167811
  });

  it('finds a lot embedded in surrounding text', () => {
    expect(checkLot('LOT 51510346AB 12:45').status).toBe('recalled');
  });

  it('reports a lot that is not in the list', () => {
    expect(checkLot('51510346XY').status).toBe('not-recalled');
    expect(checkLot('6000000000').status).toBe('not-recalled');
  });

  it('warns when one character differs from a recalled lot', () => {
    const r = checkLot('51510346AE');
    expect(r.status).toBe('similar');
    if (r.status === 'similar') expect(r.entry.lot).toBe('51510346AB');
  });

  it('asks for more characters when the code is short', () => {
    expect(checkLot('515103').status).toBe('too-short');
    expect(checkLot('  ').status).toBe('empty');
  });
});

describe('extractLotCandidates', () => {
  it('pulls the lot out of typical OCR output', () => {
    const text = 'EXP 06.2027\nLOT 51510346AB 14:32\nMFG 06.2025';
    expect(extractLotCandidates(text)).toEqual(['51510346AB']);
  });

  it('joins a code split in two by OCR', () => {
    expect(extractLotCandidates('5151 0346AB')).toContain('51510346AB');
  });

  it('returns unknown 10-character codes for the user to confirm', () => {
    expect(extractLotCandidates('LOT 53990346ZZ')).toEqual(['53990346ZZ']);
  });

  it('puts recalled lots first', () => {
    const c = extractLotCandidates('53990346ZZ\n52560346AA');
    expect(c[0]).toBe('52560346AA');
  });

  it('ignores text without codes', () => {
    expect(extractLotCandidates('NAN OPTIPRO 800 g')).toEqual([]);
  });
});

describe('OCR voting', () => {
  // Real reads of one can photo (light dot-matrix print on shiny metal).
  const reads = [['61210348A8'], ['61210346AB'], ['6121034648'], ['61210346A8'], ['61210346AB']];

  it('picks the reading most passes agree on, in its most common spelling', () => {
    expect(rankCandidates(reads)[0]).toBe('61210346AB');
  });

  it('drops one-off noise once passes agree', () => {
    expect(rankCandidates(reads)).toEqual(['61210346AB']);
  });

  it('keeps all readings when no two passes agree', () => {
    expect(rankCandidates([['61210348AB'], ['61210366AB']])).toEqual(['61210348AB', '61210366AB']);
  });

  it('shows "AB" even when most passes read the suffix as "A8" or "48"', () => {
    expect(rankCandidates([['6121034648'], ['61210346A8'], ['61210346A8']])).toEqual(['61210346AB']);
  });

  it('reads an all-digit "48" suffix as the letters "AB"', () => {
    expect(rankCandidates([['6121034648'], ['6121034648']])).toEqual(['61210346AB']);
  });

  it('votes character by character', () => {
    expect(consensusSpelling(['61210348AB', '61210346AB', '61210346A8'])).toBe('61210346AB');
    expect(consensusSpelling(['5124080611', '5124080611'])).toBe('5124080611');
  });

  it('turns letters in the digit part into digits', () => {
    expect(fixDigitPrefix('6I21O346AB')).toBe('61210346AB');
    expect(fixDigitPrefix('52790742C1')).toBe('52790742C1');
  });

  it('always puts a recalled lot first', () => {
    expect(rankCandidates([['61210346AB'], ['61210346AB'], ['51510346AB']])[0]).toBe('51510346AB');
  });

  it('detects consensus when two passes agree up to confusable characters', () => {
    expect(hasConsensus([['61210348A8'], ['61210346AB']])).toBe(false);
    expect(hasConsensus([['61210346AB'], ['61210346A8']])).toBe(true);
    expect(hasConsensus([[], ['51510346AB']])).toBe(true);
    expect(hasConsensus([[], []])).toBe(false);
  });

  it('extracts the lot from a real can print with an "L-" prefix', () => {
    expect(extractLotCandidates('L- 61210346AB 05:13\nMAN 01 05 2026\nEXP 30 04 2028')).toEqual(['61210346AB']);
  });
});

describe('FrameVotes', () => {
  it('reports a code once two recent frames agree, ignoring confusable characters', () => {
    const v = new FrameVotes();
    expect(v.add(['61210346AB'])).toBeNull();
    expect(v.add([])).toBeNull();
    expect(v.add(['61210346A8'])).toBe(canonicalLot('61210346AB'));
  });

  it('forgets frames outside the window', () => {
    const v = new FrameVotes(2, 2);
    v.add(['61210346AB']);
    v.add([]);
    expect(v.add(['61210346AB'])).toBeNull();
  });
});
