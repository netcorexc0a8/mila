import type { Worker } from 'tesseract.js';

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

/** Grayscale + contrast stretch + upscale: dot-matrix prints read much better this way. */
export function preprocess(source: CanvasImageSource, sw: number, sh: number, crop?: DOMRect): HTMLCanvasElement {
  const sx = crop?.x ?? 0;
  const sy = crop?.y ?? 0;
  const cw = crop?.width ?? sw;
  const ch = crop?.height ?? sh;
  const scale = Math.min(2, 1600 / cw);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(cw * scale);
  canvas.height = Math.round(ch * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export async function recognize(canvas: HTMLCanvasElement, onProgress?: (p: number) => void): Promise<string> {
  const worker = await getOcrWorker(onProgress);
  const { data } = await worker.recognize(canvas);
  return data.text;
}
