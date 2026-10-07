import type { Worker } from 'tesseract.js';
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
  { variant: 'adapt-inv', width: 800 },
  { variant: 'blur-adapt-inv', width: 800 },
  { variant: 'plain', width: 1600 },
  { variant: 'blur-adapt-inv', width: 1200 },
  { variant: 'adapt-inv', width: 600 },
  { variant: 'adapt', width: 1000 },
  { variant: 'inv', width: 1000 },
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
  return canvas;
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

export async function recognize(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getOcrWorker(onProgress);
  const { data } = await worker.recognize(canvas);
  return data.text;
}

/**
 * Read the batch number with several preprocessing variants and let them vote.
 * Stops as soon as two variants agree, so a clear photo costs two OCR passes.
 */
export async function readLot(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  crop?: DOMRect,
  onProgress?: (p: number) => void,
): Promise<string[]> {
  const reads: string[][] = [];
  for (let i = 0; i < PASSES.length; i++) {
    const { variant, width } = PASSES[i];
    const text = await recognize(preprocess(source, sw, sh, crop, variant, width));
    reads.push(extractLotCandidates(text));
    onProgress?.((i + 1) / PASSES.length);
    if (hasConsensus(reads)) break;
  }
  return rankCandidates(reads);
}
