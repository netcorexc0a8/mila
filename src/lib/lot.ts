import { RECALLED_PRODUCTS, type RecalledProduct } from '../data/recall';

export const LOT_LENGTH = 10;

// Cyrillic letters that look like Latin ones (users often type on a Russian layout).
const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', К: 'K', М: 'M', О: 'O', Р: 'P', Т: 'T', Х: 'X', У: 'Y',
  З: '3', Ч: '4', Б: '6',
};

// Characters that are easy to confuse on a dot-matrix print or in OCR.
// Each group collapses to one representative for comparison.
const CONFUSABLE: Record<string, string> = {
  O: '0', D: '0', Q: '0',
  I: '1', L: '1', '|': '1',
  S: '5',
  B: '8',
  Z: '2',
  G: '6',
  A: '4', // dot-matrix "A" is regularly read as "4"
};

// The first 8 characters of a batch number are always digits (production date
// and plant code); only the last two may be letters.
const DIGIT_PREFIX = 8;

/** Uppercase, map Cyrillic look-alikes to Latin, drop everything but A–Z and 0–9. */
export function normalizeLot(raw: string): string {
  return Array.from(raw.toUpperCase())
    .map((ch) => CYRILLIC_TO_LATIN[ch] ?? ch)
    .join('')
    .replace(/[^A-Z0-9]/g, '');
}

/** Collapse confusable characters so "5151O346A8" equals "51510346AB". */
export function canonicalLot(lot: string): string {
  return Array.from(normalizeLot(lot))
    .map((ch) => CONFUSABLE[ch] ?? ch)
    .join('');
}

export interface RecallEntry {
  lot: string;
  product: RecalledProduct;
}

function buildIndex(products: RecalledProduct[]): Map<string, RecallEntry> {
  const index = new Map<string, RecallEntry>();
  for (const product of products) {
    for (const lot of product.lots) {
      const key = canonicalLot(lot);
      if (index.has(key)) throw new Error(`Ambiguous lot after canonicalization: ${lot}`);
      index.set(key, { lot, product });
    }
  }
  return index;
}

const INDEX = buildIndex(RECALLED_PRODUCTS);

export type CheckResult =
  | { status: 'empty' }
  | { status: 'too-short'; input: string }
  | { status: 'recalled'; input: string; entry: RecallEntry }
  | { status: 'similar'; input: string; entry: RecallEntry }
  | { status: 'not-recalled'; input: string };

function hammingOne(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
  return diff === 1;
}

/**
 * Check a batch number typed by the user or read by OCR.
 * Longer strings (e.g. "LOT 51510346AB 14:32") are scanned for any 10-char window.
 */
export function checkLot(raw: string, index: Map<string, RecallEntry> = INDEX): CheckResult {
  const input = normalizeLot(raw);
  if (!input) return { status: 'empty' };
  if (input.length < LOT_LENGTH) return { status: 'too-short', input };

  const canon = canonicalLot(input);
  for (let i = 0; i + LOT_LENGTH <= canon.length; i++) {
    const entry = index.get(canon.slice(i, i + LOT_LENGTH));
    if (entry) return { status: 'recalled', input, entry };
  }

  // A single wrong character in an exact-length code is most likely a typo or misread.
  if (canon.length === LOT_LENGTH) {
    for (const [key, entry] of index) {
      if (hammingOne(key, canon)) return { status: 'similar', input, entry };
    }
  }
  return { status: 'not-recalled', input };
}

/** Letters misread in the all-digit part of a 10-character code become the digits they resemble. */
export function fixDigitPrefix(lot: string): string {
  if (lot.length !== LOT_LENGTH) return lot;
  return Array.from(lot)
    .map((ch, i) => (i < DIGIT_PREFIX && /[A-Z]/.test(ch) ? (CONFUSABLE[ch] ?? ch) : ch))
    .join('');
}

/**
 * Pull likely batch numbers out of OCR text: alphanumeric runs of exactly 10
 * characters, or a recalled lot found anywhere inside a longer run.
 */
export function extractLotCandidates(text: string): string[] {
  const found: string[] = [];
  const add = (s: string) => {
    if (!found.includes(s)) found.push(s);
  };
  for (const line of text.split(/\n+/)) {
    const tokens = line.split(/\s+/).map(normalizeLot).filter(Boolean);
    // OCR sometimes splits the code ("5151 0346AB"), so also try adjacent pairs.
    const runs = [...tokens];
    for (let i = 0; i + 1 < tokens.length; i++) runs.push(tokens[i] + tokens[i + 1]);
    for (const run of runs) {
      const result = checkLot(run);
      if (result.status === 'recalled') add(result.entry.lot);
      else if (run.length === LOT_LENGTH && /\d{6}/.test(run)) add(fixDigitPrefix(run));
    }
  }
  // Recalled hits first so they are never hidden behind noise.
  return found.sort((a, b) => Number(checkLot(b).status === 'recalled') - Number(checkLot(a).status === 'recalled'));
}

/**
 * Merge candidates from several OCR passes. Readings that are equal up to
 * confusable characters are one vote; the most common spelling represents the
 * group. Recalled lots always come first so a match is never hidden.
 */
export function rankCandidates(reads: string[][]): string[] {
  const groups = new Map<string, { votes: number; spellings: string[]; first: number }>();
  let order = 0;
  for (const read of reads) {
    for (const cand of new Set(read)) {
      const key = canonicalLot(cand);
      const g = groups.get(key) ?? { votes: 0, spellings: [], first: order++ };
      g.votes++;
      g.spellings.push(cand);
      groups.set(key, g);
    }
  }
  return [...groups.values()]
    .map((g) => {
      const lot = consensusSpelling(g.spellings);
      return { ...g, lot, recalled: checkLot(lot).status === 'recalled' };
    })
    .sort((a, b) => Number(b.recalled) - Number(a.recalled) || b.votes - a.votes || a.first - b.first)
    // Once passes agree, one-off readings are noise unless they hit a recalled lot.
    .filter((g, _, all) => g.recalled || g.votes > 1 || all.every((o) => o.votes < 2))
    .map((g) => g.lot);
}

/**
 * Character-by-character majority over readings of the same code. In the
 * two-character suffix a letter wins ties, and next to a letter an "8" or "4"
 * is shown as the "B" or "A" it almost always is on dot-matrix print.
 */
export function consensusSpelling(spellings: string[]): string {
  const len = spellings[0].length;
  if (spellings.some((s) => s.length !== len)) return spellings[0];
  const chars = Array.from({ length: len }, (_, i) => {
    const counts = new Map<string, number>();
    for (const s of spellings) counts.set(s[i], (counts.get(s[i]) ?? 0) + 1);
    const isSuffix = len === LOT_LENGTH && i >= DIGIT_PREFIX;
    return [...counts].sort(
      (a, b) => b[1] - a[1] || (isSuffix ? Number(/[A-Z]/.test(b[0])) - Number(/[A-Z]/.test(a[0])) : 0),
    )[0][0];
  });
  if (len === LOT_LENGTH) {
    const look: Record<string, string> = { '8': 'B', '4': 'A' };
    const [a, b] = [chars[8], chars[9]];
    if (/[A-Z]/.test(a) && look[b]) chars[9] = look[b];
    if (/[A-Z]/.test(chars[9]) && look[a]) chars[8] = look[a];
    // "48" and "88" style suffixes are the same misreading of letters.
    if (look[chars[8]] && look[chars[9]]) [chars[8], chars[9]] = [look[chars[8]], look[chars[9]]];
  }
  return chars.join('');
}

/** True once two passes produced the same reading, or any pass found a recalled lot. */
export function hasConsensus(reads: string[][]): boolean {
  const seen = new Set<string>();
  for (const read of reads) {
    for (const cand of new Set(read.map(canonicalLot))) {
      if (seen.has(cand)) return true;
      seen.add(cand);
    }
  }
  return reads.some((r) => r.some((c) => checkLot(c).status === 'recalled'));
}

/**
 * Tracks codes seen across live camera frames. A code counts as stable once
 * it has been read in `needed` of the last `window` frames, which filters out
 * one-off misreads while the phone is still moving.
 */
export class FrameVotes {
  private frames: string[][] = [];
  constructor(
    private readonly needed = 2,
    private readonly window = 4,
  ) {}

  /** Add one frame's candidates; returns a stable code, if any. */
  add(candidates: string[]): string | null {
    this.frames.push([...new Set(candidates.map(canonicalLot))]);
    if (this.frames.length > this.window) this.frames.shift();
    const counts = new Map<string, number>();
    for (const f of this.frames) for (const c of f) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const [c, n] of counts) if (n >= this.needed) return c;
    return null;
  }

  reset(): void {
    this.frames = [];
  }
}

export const ALL_RECALLED_LOTS = RECALLED_PRODUCTS.flatMap((p) => p.lots);
