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
