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
  /** Set for batches the user blocked themselves; holds their note (may be empty). */
  custom?: { note: string };
}

/** Shortest batch number a user may block: shorter codes would match inside unrelated numbers. */
export const MIN_CUSTOM_LENGTH = 6;

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

// Batches the user added to their own block list (any brand, any length ≥ 6).
let customEntries: { key: string; entry: RecallEntry }[] = [];

/** Replace the user's own blocked batches used by `checkLot`. */
export function setCustomLots(lots: { lot: string; note: string }[]): void {
  customEntries = lots
    .map(({ lot, note }) => ({ lot: normalizeLot(lot), note }))
    .filter(({ lot }) => lot.length >= MIN_CUSTOM_LENGTH)
    .map(({ lot, note }) => ({
      key: canonicalLot(lot),
      entry: { lot, product: { name: note || 'Моя партия', weight: '', lots: [lot] }, custom: { note } },
    }));
}

/** The official recall entry for a batch number, if it is exactly one of the published lots. */
export function officialEntry(raw: string): RecallEntry | undefined {
  const canon = canonicalLot(raw);
  return canon.length === LOT_LENGTH ? INDEX.get(canon) : undefined;
}

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
  const canon = canonicalLot(input);
  // The user's own batches may be shorter than Nestlé's 10 characters.
  const own = customEntries.find(({ key }) => canon.includes(key));
  if (input.length < LOT_LENGTH && !own) return { status: 'too-short', input };

  for (let i = 0; i + LOT_LENGTH <= canon.length; i++) {
    const entry = index.get(canon.slice(i, i + LOT_LENGTH));
    if (entry) return { status: 'recalled', input, entry };
  }
  if (own) return { status: 'recalled', input, entry: own.entry };

  // A single wrong character in an exact-length code is most likely a typo or misread.
  if (canon.length === LOT_LENGTH) {
    for (const [key, entry] of index) {
      if (hammingOne(key, canon)) return { status: 'similar', input, entry };
    }
  }
  for (const { key, entry } of customEntries) {
    if (hammingOne(key, canon)) return { status: 'similar', input, entry };
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

/** Digits 2–4 of a Nestlé batch number are the day of the year, so they must be 001–366. */
function plausibleLot(lot: string): boolean {
  if (!new RegExp(`^\\d{${DIGIT_PREFIX}}`).test(lot)) return false;
  const day = Number(lot.slice(1, 4));
  return day >= 1 && day <= 366;
}

/**
 * The first four digits of a batch number encode the production date printed
 * under it. When a reading differs from that date in exactly one of those
 * digits (dot-matrix "1", "4" and "7" are easy to mix up), the date wins.
 */
export function alignToPrefix(lot: string, prefix?: string): string {
  if (!prefix || lot.length !== LOT_LENGTH) return lot;
  let diff = 0;
  for (let i = 0; i < prefix.length; i++) if (lot[i] !== prefix[i]) diff++;
  return diff === 1 ? prefix + lot.slice(prefix.length) : lot;
}

/**
 * Pull likely batch numbers out of OCR text: alphanumeric runs of exactly 10
 * characters, or a recalled lot found anywhere inside a longer run. With a
 * `prefix` vouched for by the dates on the can, readings are aligned to it,
 * and an 11-character run with one stray character (a dot read as "7") is
 * repaired.
 */
export function extractLotCandidates(text: string, prefix?: string): string[] {
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
      const variants = [run.length === LOT_LENGTH ? alignToPrefix(fixDigitPrefix(run), prefix) : run];
      if (prefix && run.length === LOT_LENGTH + 1) {
        for (let i = 0; i < DIGIT_PREFIX; i++) {
          const v = fixDigitPrefix(run.slice(0, i) + run.slice(i + 1));
          if (v.startsWith(prefix)) variants.push(v);
        }
      }
      for (const v of variants) {
        const result = checkLot(v);
        // A recalled lot that contradicts the production date is a misreading of another code.
        if (result.status === 'recalled' && (!prefix || !/^\d{4}/.test(result.entry.lot) || result.entry.lot.startsWith(prefix))) {
          add(result.entry.lot);
        } else if (v.length === LOT_LENGTH && plausibleLot(v)) add(v);
      }
    }
  }
  // Recalled hits first so they are never hidden behind noise.
  return found.sort((a, b) => Number(checkLot(b).status === 'recalled') - Number(checkLot(a).status === 'recalled'));
}

interface Cluster {
  key: string;
  reads: Set<number>;
  spellings: string[];
  first: number;
}

/**
 * Group readings across passes. Readings equal up to confusable characters
 * are one group, and a 10-character group one character away from a bigger
 * one joins it ("61260346AB" next to three "61240346AB"): a single misread
 * dot-matrix digit should be outvoted character by character, not compete as
 * a separate code.
 */
function clusterReads(reads: string[][]): Cluster[] {
  const byKey = new Map<string, Cluster>();
  let order = 0;
  reads.forEach((read, r) => {
    for (const cand of new Set(read)) {
      const key = canonicalLot(cand);
      const c = byKey.get(key) ?? { key, reads: new Set<number>(), spellings: [], first: order++ };
      c.reads.add(r);
      c.spellings.push(cand);
      byKey.set(key, c);
    }
  });
  const clusters: Cluster[] = [];
  for (const c of [...byKey.values()].sort((a, b) => b.reads.size - a.reads.size || a.first - b.first)) {
    const home = clusters.find((h) => h.key.length === LOT_LENGTH && hammingOne(h.key, c.key));
    if (!home) {
      clusters.push({ ...c, reads: new Set(c.reads), spellings: [...c.spellings] });
      continue;
    }
    c.reads.forEach((r) => home.reads.add(r));
    home.spellings.push(...c.spellings);
    home.first = Math.min(home.first, c.first);
  }
  return clusters;
}

/**
 * Merge candidates from several OCR passes into a ranked list. Each group is
 * spelled by a character-by-character majority. A group matching the
 * production date on the can (`prefix`) comes first, then recalled lots, so a
 * match is never hidden, then the most votes.
 */
export function rankCandidates(reads: string[][], prefix?: string): string[] {
  return clusterReads(reads)
    .map((c) => {
      const lot = consensusSpelling(c.spellings);
      return { votes: c.reads.size, first: c.first, lot, recalled: checkLot(lot).status === 'recalled', dated: !!prefix && lot.startsWith(prefix) };
    })
    .sort(
      (a, b) =>
        Number(b.dated) - Number(a.dated) || Number(b.recalled) - Number(a.recalled) || b.votes - a.votes || a.first - b.first,
    )
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
    // Dot-matrix "A" is also read as "R" in front of a "B".
    if (chars[8] === 'R' && /[B8]/.test(chars[9])) chars[8] = 'A';
    const look: Record<string, string> = { '8': 'B', '4': 'A' };
    const [a, b] = [chars[8], chars[9]];
    if (/[A-Z]/.test(a) && look[b]) chars[9] = look[b];
    if (/[A-Z]/.test(chars[9]) && look[a]) chars[8] = look[a];
    // "48" and "88" style suffixes are the same misreading of letters.
    if (look[chars[8]] && look[chars[9]]) [chars[8], chars[9]] = [look[chars[8]], look[chars[9]]];
  }
  return chars.join('');
}

/**
 * True once the passes clearly agree: one reading seen three times, or twice
 * with no competing reading one character away. Two passes that disagree in a
 * single digit (dot-matrix "4" and "1") are not enough to stop.
 */
export function hasConsensus(reads: string[][]): boolean {
  const counts = new Map<string, number>();
  for (const read of reads) for (const key of new Set(read.map(canonicalLot))) counts.set(key, (counts.get(key) ?? 0) + 1);
  for (const [key, n] of counts) {
    if (n >= 3) return true;
    if (n < 2) continue;
    let rivals = 0;
    for (const [other, m] of counts) if (other.length === key.length && hammingOne(other, key)) rivals += m;
    if (rivals === 0) return true;
  }
  return false;
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
