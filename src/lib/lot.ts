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
};

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
      else if (run.length === LOT_LENGTH && /\d{6}/.test(run)) add(run);
    }
  }
  // Recalled hits first so they are never hidden behind noise.
  return found.sort((a, b) => Number(checkLot(b).status === 'recalled') - Number(checkLot(a).status === 'recalled'));
}

export const ALL_RECALLED_LOTS = RECALLED_PRODUCTS.flatMap((p) => p.lots);
