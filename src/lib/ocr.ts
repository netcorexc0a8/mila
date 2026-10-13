import type { Worker } from 'tesseract.js';
import { parseCanDates, trustedLotPrefix, type CanDates } from './dates';
import { extractLotCandidates, hasConsensus, rankCandidates } from './lot';

// The OCR engine is loaded lazily from the app's own /tesseract folder (copied
// at build time), so it works offline once cached and never hits a CDN.
let workerPromise: Promise<Worker> | null = null;

function assetBase(): string {
  return new URL(`${import.meta.env.BASE_URL}tesseract/`, location.href).href;
}

export function getOcrWorker(onProgress?: (p: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const base = assetBase();
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        workerPath: `${base}worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        workerBlobURL: false,
        logger: (m) => {
          if (onProgress && typeof m.progress === 'number') onProgress(m.progress);
        },
      });
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:./- ',
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      });
      return worker;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export type Variant = 'plain' | 'inv' | 'blur-inv' | 'adapt' | 'adapt-inv' | 'blur-adapt-inv';

interface Pass {
  variant: Variant;
  /** Width the region is resized to; dot-matrix characters read best at ~30–50 px high. */
  width: number;
}

/**
 * Tried in order until two passes agree. Cans carry light dot-matrix print on
 * shiny metal, so local (adaptive) thresholding of light text comes first: it
 * ignores reflections. Plain contrast and dark-text passes cover labels.
 */
export const PASSES: Pass[] = [
  { variant: 'blur-adapt-inv', width: 800 },
  { variant: 'adapt-inv', width: 600 },
  { variant: 'inv', width: 1000 },
  { variant: 'blur-adapt-inv', width: 1200 },
  { variant: 'adapt-inv', width: 800 },
  { variant: 'plain', width: 1600 },
  { variant: 'adapt', width: 1000 },
];

/**
 * Prepare an image region for OCR: grayscale, upscale, then either a contrast
 * stretch or an adaptive threshold (pixel vs. local mean, robust to reflections).
 * "blur" merges the dots of dot-matrix characters into solid strokes;
 * "inv" turns light-on-dark print into the dark-on-light text Tesseract expects.
 */
export function preprocess(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  crop?: DOMRect,
  variant: Variant = 'plain',
  targetWidth = 1600,
  rotation: Rotation = 0,
): HTMLCanvasElement {
  const sx = crop?.x ?? 0;
  const sy = crop?.y ?? 0;
  const cw = crop?.width ?? sw;
  const ch = crop?.height ?? sh;
  const scale = Math.min(3, targetWidth / cw);
  const canvas = document.createElement('canvas');
  const w = (canvas.width = Math.round(cw * scale));
  const h = (canvas.height = Math.round(ch * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  if (variant.startsWith('blur')) ctx.filter = `blur(${Math.max(1, scale * 1.2)}px)`;
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, w, h);
  ctx.filter = 'none';

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];

  const invert = variant.endsWith('inv');
  const out = variant.includes('adapt') ? adaptiveThreshold(gray, w, h, invert) : stretch(gray, invert);
  for (let i = 0; i < out.length; i++) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = out[i];
  ctx.putImageData(img, 0, 0);
  return rotation ? rotate(canvas, rotation) : canvas;
}

export type Rotation = 0 | 90 | 180 | 270;

function rotate(src: HTMLCanvasElement, deg: Rotation): HTMLCanvasElement {
  const out = document.createElement('canvas');
  const quarter = deg === 90 || deg === 270;
  out.width = quarter ? src.height : src.width;
  out.height = quarter ? src.width : src.height;
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return out;
}

function stretch(gray: Float32Array, invert: boolean): Float32Array {
  let min = 255;
  let max = 0;
  for (const v of gray) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  return gray.map((v) => {
    const n = ((v - min) / range) * 255;
    return invert ? 255 - n : n;
  });
}

/** Text pixels (brighter than the local mean when `lightText`) become black, the rest white. */
export function adaptiveThreshold(gray: Float32Array, w: number, h: number, lightText: boolean): Float32Array {
  const r = Math.round(Math.max(15, h / 8));
  const stride = w + 1;
  const sum = new Float64Array(stride * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += gray[y * w + x];
      sum[(y + 1) * stride + x + 1] = sum[y * stride + x + 1] + row;
    }
  }
  const out = new Float32Array(w * h);
  const sign = lightText ? 1 : -1;
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const mean = (sum[y1 * stride + x1] - sum[y0 * stride + x1] - sum[y1 * stride + x0] + sum[y0 * stride + x0]) / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = sign * (gray[y * w + x] - mean) > 12 ? 0 : 255;
    }
  }
  return out;
}

let currentPsm = '11';

/**
 * OCR a prepared canvas. "block" (PSM 6) keeps the printed lines together and
 * reads a framed can bottom best; "sparse" (PSM 11) finds text anywhere in a photo.
 */
export async function recognize(canvas: HTMLCanvasElement, mode: 'block' | 'sparse' = 'block'): Promise<string> {
  const worker = await getOcrWorker();
  const psm = mode === 'block' ? '6' : '11';
  if (psm !== currentPsm) {
    await worker.setParameters({ tessedit_pageseg_mode: psm as never });
    currentPsm = psm;
  }
  const { data } = await worker.recognize(canvas);
  return data.text;
}

export interface LotReading {
  /** Batch numbers, best first. */
  lots: string[];
  dates: CanDates;
  /** Orientation the code was found in. */
  rotation: Rotation;
}

/** Everything the OCR passes over one region produced, kept for the final vote. */
interface Evidence {
  texts: string[];
  man: string[];
  exp: string[];
}

function addText(ev: Evidence, text: string): void {
  ev.texts.push(text);
  const d = parseCanDates(text);
  if (d.man) ev.man.push(d.man);
  if (d.exp) ev.exp.push(d.exp);
}

const mostCommon = (xs: string[]) =>
  [...xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0];

/**
 * Final answer from all passes. The production date printed under the code
 * (when read reliably) fixes misread digits in the code's first four
 * characters, which encode that same date.
 */
function conclude(ev: Evidence, rotation: Rotation): LotReading {
  const prefix = trustedLotPrefix(ev.man, ev.exp);
  const lots = rankCandidates(ev.texts.map((t) => extractLotCandidates(t, prefix)), prefix);
  return { lots, dates: { man: mostCommon(ev.man), exp: mostCommon(ev.exp) }, rotation };
}

/**
 * Read the batch number with several preprocessing variants and let them vote.
 * Each variant is tried the right way up and upside down (a can is easily
 * photographed rotated); once one orientation yields a code, the other is
 * skipped. Photos from the gallery also try 90°/270°. Stops as soon as two
 * passes agree, so a clear photo costs two OCR passes.
 */
async function readLotIn(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  crop?: DOMRect,
  onProgress?: (p: number) => void,
  rotations: Rotation[] = [0, 180],
  ev: Evidence = { texts: [], man: [], exp: [] },
): Promise<{ ev: Evidence; rotation: Rotation; found: boolean }> {
  const reads: string[][] = [];
  // How convincingly each orientation reads as a can print: a pass with a
  // code scores one point, a pass with a labelled date ("MAN", "EXP") another.
  // Upside-down print produces junk codes too, but rarely dates.
  const score = new Map<Rotation, number>(rotations.map((r) => [r, 0]));
  const total = PASSES.length * rotations.length;
  let done = 0;
  const byRotation = new Map<Rotation, Evidence>();
  const best = () => [...score].sort((a, b) => b[1] - a[1])[0];
  outer: for (const { variant, width } of PASSES) {
    for (const rotation of rotations) {
      done++;
      // Once one orientation clearly holds the print, the others are not worth reading.
      const [lead, leadScore] = best();
      if (leadScore >= 2 && lead !== rotation && score.get(rotation) === 0) continue;
      const text = await recognize(preprocess(source, sw, sh, crop, variant, width, rotation));
      const lots = extractLotCandidates(text);
      const d = parseCanDates(text);
      score.set(rotation, score.get(rotation)! + (lots.length ? 1 : 0) + (d.man || d.exp ? 1 : 0));
      reads.push(lots);
      const rev = byRotation.get(rotation) ?? { texts: [], man: [], exp: [] };
      byRotation.set(rotation, rev);
      addText(rev, text);
      onProgress?.(done / total);
      if (hasConsensus(reads)) break outer;
    }
  }
  const [rotation, top] = best();
  const rev = byRotation.get(rotation);
  if (rev) {
    ev.texts.push(...rev.texts);
    ev.man.push(...rev.man);
    ev.exp.push(...rev.exp);
  }
  const found = top > 0 && rev?.texts.some((t) => extractLotCandidates(t).length) === true;
  return { ev, rotation, found };
}

/**
 * One fast OCR pass for live scanning: the camera calls this on a frame every
 * second or so and waits until the same code shows up twice.
 */
export async function quickRead(source: CanvasImageSource, sw: number, sh: number, crop: DOMRect, rotation: Rotation): Promise<string[]> {
  return extractLotCandidates(await recognize(preprocess(source, sw, sh, crop, 'blur-adapt-inv', 800, rotation)));
}

/** Draw the source rotated, capped at `maxSide` pixels. */
function rotatedCopy(source: CanvasImageSource, sw: number, sh: number, deg: Rotation, maxSide = 2400): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const base = document.createElement('canvas');
  base.width = Math.round(sw * k);
  base.height = Math.round(sh * k);
  base.getContext('2d')!.drawImage(source, 0, 0, base.width, base.height);
  return deg ? rotate(base, deg) : base;
}

/**
 * Find the line holding the batch number in a whole photo: the line with the
 * longest run of digits. Returns a crop around it in `canvas` pixels.
 */
async function locateLotLine(canvas: HTMLCanvasElement): Promise<DOMRect | null> {
  const worker = await getOcrWorker();
  if (currentPsm !== '11') {
    await worker.setParameters({ tessedit_pageseg_mode: '11' as never });
    currentPsm = '11';
  }
  for (const { variant, width } of [
    { variant: 'plain' as Variant, width: 1600 },
    { variant: 'adapt-inv' as Variant, width: 1600 },
    { variant: 'blur-adapt-inv' as Variant, width: 1600 },
  ]) {
    const scaled = preprocess(canvas, canvas.width, canvas.height, undefined, variant, width);
    const k = canvas.width / scaled.width;
    const { data } = await worker.recognize(scaled, {}, { text: true, blocks: true });
    let best: { run: number; bbox: { x0: number; y0: number; x1: number; y1: number } } | null = null;
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const run = Math.max(0, ...(line.text.replace(/\s/g, '').match(/\d+/g) ?? []).map((d) => d.length));
          if (run >= 5 && (!best || run > best.run)) best = { run, bbox: line.bbox };
        }
      }
    }
    if (best) {
      const { x0, y0, x1, y1 } = best.bbox;
      const lh = (y1 - y0) * k;
      // Generous margins: at this scale part of the line may be lost to glare
      // (a cut-off first "6" reads as "5"). The two date lines below are kept:
      // the production date confirms the code.
      const x = Math.max(0, x0 * k - lh * 5);
      const y = Math.max(0, y0 * k - lh * 1.2);
      const w = Math.min(canvas.width - x, (x1 - x0) * k + lh * 10);
      const h = Math.min(canvas.height - y, lh * 5.5);
      return new DOMRect(x, y, w, h);
    }
  }
  return null;
}

/**
 * The dates are printed under the code; read a few more passes until the
 * production date is confirmed, since it double-checks the code.
 */
async function readDates(source: CanvasImageSource, sw: number, sh: number, crop: DOMRect | undefined, ev: Evidence, rotation: Rotation = 0): Promise<void> {
  for (const { variant, width } of [
    { variant: 'adapt-inv' as Variant, width: 1200 },
    { variant: 'blur-adapt-inv' as Variant, width: 1000 },
    { variant: 'plain' as Variant, width: 1600 },
  ]) {
    if (trustedLotPrefix(ev.man, ev.exp)) break;
    addText(ev, await recognize(preprocess(source, sw, sh, crop, variant, width, rotation)));
  }
}

/**
 * Read a batch number. With a crop (the camera frame) the region is read
 * directly. Without one (a photo from the gallery) the line with the code is
 * located first, trying all four orientations, and then read up close.
 */
export async function readLot(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  crop?: DOMRect,
  onProgress?: (p: number) => void,
): Promise<LotReading> {
  if (crop) {
    const { ev, rotation, found } = await readLotIn(source, sw, sh, crop, onProgress, [0, 180]);
    if (found) await readDates(source, sw, sh, crop, ev, rotation);
    return conclude(ev, rotation);
  }

  const orientations: Rotation[] = [0, 180, 90, 270];
  for (let i = 0; i < orientations.length; i++) {
    const canvas = rotatedCopy(source, sw, sh, orientations[i]);
    const line = await locateLotLine(canvas);
    onProgress?.((i + 1) / (orientations.length * 2));
    if (!line) continue;
    const { ev, found } = await readLotIn(canvas, canvas.width, canvas.height, line, (p) => onProgress?.(0.5 + p / 2), [0]);
    if (found) {
      await readDates(canvas, canvas.width, canvas.height, line, ev);
      return { ...conclude(ev, 0), rotation: orientations[i] };
    }
  }
  // Nothing located: fall back to reading the whole frame.
  const { ev, rotation } = await readLotIn(source, sw, sh, undefined, onProgress, orientations);
  return conclude(ev, rotation);
}
