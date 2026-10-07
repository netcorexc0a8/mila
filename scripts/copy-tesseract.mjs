// Copies the OCR engine (tesseract.js worker, WASM core, English model) into
// public/tesseract so the app never depends on a CDN and can work offline.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = join(process.cwd(), 'public', 'tesseract');
mkdirSync(out, { recursive: true });

const tjs = dirname(require.resolve('tesseract.js/package.json'));
const core = dirname(require.resolve('tesseract.js-core/package.json'));
const eng = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

cpSync(join(tjs, 'dist', 'worker.min.js'), join(out, 'worker.min.js'));
for (const f of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  cpSync(join(core, f), join(out, f));
}
cpSync(join(eng, '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'eng.traineddata.gz'));
console.log('tesseract assets copied to', out);
