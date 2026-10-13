/** Dates printed on the can bottom, e.g. "MAN 01 05 2026" / "EXP 30 04 2028" or "EXP 06.2027". */
export interface CanDates {
  /** Production date, "ДД.ММ.ГГГГ" or "ММ.ГГГГ". */
  man?: string;
  /** Best-before date, same formats. */
  exp?: string;
}

const LABELS: Record<string, keyof CanDates> = {
  MAN: 'man', MFG: 'man', MFD: 'man', PROD: 'man', P: 'man',
  EXP: 'exp', BB: 'exp', BBE: 'exp', E: 'exp',
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Parse "30 04 2028", "30.04.2028", "04.2028", "042028" into "30.04.2028" / "04.2028". */
export function parseDate(raw: string): string | undefined {
  const groups = raw.replace(/[OQD]/g, '0').replace(/[IL]/g, '1').match(/\d+/g);
  if (!groups) return undefined;
  let digits = groups;
  if (digits.length === 1 && digits[0].length === 8) digits = [digits[0].slice(0, 2), digits[0].slice(2, 4), digits[0].slice(4)];
  if (digits.length === 1 && digits[0].length === 6) digits = [digits[0].slice(0, 2), digits[0].slice(2)];
  const nums = digits.map(Number);
  const valid = (d: number, m: number, y: number) => y >= 2020 && y <= 2040 && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  if (nums.length >= 3 && digits[2].length === 4 && valid(nums[0], nums[1], nums[2])) {
    return `${pad(nums[0])}.${pad(nums[1])}.${nums[2]}`;
  }
  if (nums.length >= 2 && digits[1].length === 4 && valid(1, nums[0], nums[1])) return `${pad(nums[0])}.${nums[1]}`;
  return undefined;
}

/** Find labelled production and expiry dates in OCR text. */
export function parseCanDates(text: string): CanDates {
  const out: CanDates = {};
  for (const line of text.toUpperCase().split(/\n+/)) {
    const m = line.match(/\b(MAN|MFG|MFD|PROD|EXP|BBE|BB)\b[\s.:]*(.+)/);
    if (!m) continue;
    const key = LABELS[m[1]];
    const date = parseDate(m[2]);
    if (date && !out[key]) out[key] = date;
  }
  return out;
}

/**
 * Nestlé batch numbers start with the production date: last digit of the year
 * and the day of the year ("6121…" = 1 May 2026). Returns "ДД.ММ.ГГГГ".
 */
export function productionDateFromLot(lot: string, now = new Date()): string | undefined {
  const m = lot.match(/^(\d)(\d{3})/);
  if (!m) return undefined;
  const day = Number(m[2]);
  if (day < 1 || day > 366) return undefined;
  // The decade is the one that puts the year closest to (and not after) today.
  let year = Math.floor(now.getFullYear() / 10) * 10 + Number(m[1]);
  if (year > now.getFullYear()) year -= 10;
  const d = new Date(Date.UTC(year, 0, day));
  if (d.getUTCFullYear() !== year) return undefined;
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${year}`;
}

/** Batch-number prefix for a production date: last digit of the year + day of the year ("01.05.2026" → "6121"). */
export function lotPrefixFromDate(date: string): string | undefined {
  const m = date.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return undefined;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = Date.UTC(y, mo - 1, d);
  const day = Math.round((t - Date.UTC(y, 0, 1)) / 864e5) + 1;
  return `${y % 10}${String(day).padStart(3, '0')}`;
}

/** Nestlé formula keeps two years: "EXP 30 04 2028" goes with "MAN 01 05 2026". */
function productionFromExpiry(exp: string): string | undefined {
  const m = exp.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[3]) - 2, Number(m[2]) - 1, Number(m[1]) + 1));
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
}

/**
 * The batch-number prefix the dates on the can vouch for, or undefined when
 * the evidence is thin. A production date counts once it was read twice the
 * same way, or once the expiry date (two years later) agrees with it: one
 * misread date must never overrule the code itself.
 */
export function trustedLotPrefix(manReads: string[], expReads: string[]): string | undefined {
  const votes = new Map<string, number>();
  for (const man of manReads) {
    const p = lotPrefixFromDate(man);
    if (p) votes.set(p, (votes.get(p) ?? 0) + 1);
  }
  const fromExp = new Set(expReads.map(productionFromExpiry).filter(Boolean).map((d) => lotPrefixFromDate(d!)));
  let best: string | undefined;
  let bestScore = 0;
  for (const [p, n] of votes) {
    const score = n + (fromExp.has(p) ? 1 : 0);
    if (score >= 2 && score > bestScore) [best, bestScore] = [p, score];
  }
  return best;
}
