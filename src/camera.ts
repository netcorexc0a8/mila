import { FrameVotes } from './lib/lot';
import { getOcrWorker, quickRead, readLot, type LotReading, type Rotation } from './lib/ocr';
import { canOutline, icons } from './icons';

export type ScanResult = LotReading;

const STEPS = ['Снимок банки', 'Номер партии (LOT)', 'Дата производства', 'Дата окончания срока годности'];

/**
 * Full-screen camera (mockup screen 3) followed by the recognition screen
 * (screen 4). The user frames the code and taps the shutter; the still frame
 * is read on-device with Tesseract. `onFound` gets the result when a batch
 * number is recognised.
 */
export function openCamera(onFound: (r: ScanResult) => void): void {
  const root = document.createElement('div');
  root.className = 'camera';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Сканирование номера партии');
  root.innerHTML = `
    <video class="camera__video" playsinline muted autoplay></video>
    <div class="camera__frame" aria-hidden="true"><i></i><i></i><i></i><i></i><b class="camera__laser"></b></div>
    <button class="camera__icon camera__close" aria-label="Закрыть">${icons.close(30)}</button>
    <button class="camera__icon camera__torch" aria-label="Фонарик" hidden>${icons.flash(28)}</button>
    <p class="camera__hint">Наведите камеру на номер партии (LOT) на&nbsp;дне банки</p>
    <p class="camera__status" aria-live="polite"></p>
    <div class="camera__bar">
      <label class="camera__icon camera__file" aria-label="Выбрать фото из галереи">${icons.image(28)}<input type="file" accept="image/*" hidden /></label>
      <button class="camera__shutter" aria-label="Сделать снимок"></button>
      <span class="camera__spacer"></span>
    </div>
    <section class="recog" hidden aria-live="polite">
      <div class="recog__ring">
        <svg viewBox="0 0 200 200" class="recog__svg"><circle cx="100" cy="100" r="90" class="recog__track"/><circle cx="100" cy="100" r="90" class="recog__val"/></svg>
        <span class="recog__can">${canOutline(84)}</span>
      </div>
      <h2 class="recog__title">Распознаём данные…</h2>
      <ul class="recog__list">${STEPS.map((s) => `<li><span class="tick">${icons.check(14)}</span>${s}</li>`).join('')}</ul>
      <p class="recog__sub"></p>
    </section>`;
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#000000');

  const video = root.querySelector('video')!;
  const hint = root.querySelector<HTMLElement>('.camera__hint')!;
  const recog = root.querySelector<HTMLElement>('.recog')!;
  const recogSub = root.querySelector<HTMLElement>('.recog__sub')!;
  const ringVal = root.querySelector<SVGCircleElement>('.recog__val')!;
  const steps = [...root.querySelectorAll<HTMLElement>('.recog__list li')];
  const torchBtn = root.querySelector<HTMLButtonElement>('.camera__torch')!;
  const status = root.querySelector<HTMLElement>('.camera__status')!;
  let stream: MediaStream | null = null;
  let torchOn = false;
  let busy = false;
  let loopTimer = 0;

  const stopStream = () => {
    clearTimeout(loopTimer);
    stream?.getTracks().forEach((t) => t.stop());
  };
  const close = () => {
    stopStream();
    root.remove();
    document.body.classList.remove('no-scroll');
    window.removeEventListener('hashchange', close);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f5f8fd');
  };
  window.addEventListener('hashchange', close);
  root.querySelector('.camera__close')!.addEventListener('click', close);

  // Start loading the OCR engine while the camera warms up.
  void getOcrWorker().catch(() => {});

  const CIRC = 2 * Math.PI * 90;
  const setProgress = (p: number) => {
    ringVal.style.strokeDashoffset = String(CIRC * (1 - Math.max(0.08, Math.min(1, p))));
  };
  const tick = (i: number, state: 'done' | 'skip') => steps[i].classList.add(state === 'done' ? 'is-done' : 'is-skip');
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function run(source: CanvasImageSource, w: number, h: number, crop?: DOMRect) {
    busy = true;
    clearTimeout(loopTimer);
    recog.hidden = false;
    steps.forEach((s) => s.classList.remove('is-done', 'is-skip'));
    recogSub.textContent = navigator.onLine ? '' : 'Без интернета, на устройстве';
    setProgress(0.08);
    tick(0, 'done');
    try {
      await getOcrWorker();
      const reading = await readLot(source, w, h, crop, setProgress);
      setProgress(1);
      if (reading.lots.length) {
        stopStream();
        tick(1, 'done');
        await wait(220);
        // The production date is always known: it is encoded in the batch number.
        tick(2, 'done');
        await wait(220);
        tick(3, reading.dates.exp ? 'done' : 'skip');
        await wait(350);
        onFound(reading);
        close();
        return;
      }
      showError('Не удалось прочитать номер. Наклоните банку, чтобы убрать блики, подойдите ближе и попробуйте ещё раз.');
    } catch {
      showError(
        navigator.onLine
          ? 'Не удалось запустить распознавание. Введите номер вручную.'
          : 'Распознавание ещё не загружено на устройство. Подключитесь к интернету один раз или введите номер вручную.',
      );
    }
  }

  function showError(text: string) {
    busy = false;
    votes.reset();
    scheduleScan(2500);
    recog.hidden = true;
    hint.innerHTML = `${text}<br/><a href="#/manual" class="camera__manual">Ввести вручную</a>`;
    hint.classList.add('camera__hint--warn');
  }

  /**
   * Map the on-screen frame to video pixels (the video is object-fit: cover),
   * with a margin around it: people frame loosely, and a character cut by the
   * crop edge gets misread (a clipped "6" reads as "5").
   */
  function frameCrop(): DOMRect {
    const frame = root.querySelector<HTMLElement>('.camera__frame')!.getBoundingClientRect();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const box = video.getBoundingClientRect();
    const scale = Math.max(box.width / vw, box.height / vh);
    const offX = (vw * scale - box.width) / 2;
    const offY = (vh * scale - box.height) / 2;
    const fw = frame.width / scale;
    const fh = frame.height / scale;
    const x0 = Math.max(0, (frame.left - box.left + offX) / scale - fw * 0.12);
    const y0 = Math.max(0, (frame.top - box.top + offY) / scale - fh * 0.2);
    const x1 = Math.min(vw, x0 + fw * 1.24);
    const y1 = Math.min(vh, y0 + fh * 1.4);
    return new DOMRect(x0, y0, x1 - x0, y1 - y0);
  }

  /** Freeze the current frame so every OCR pass reads the same picture. */
  function grab(): HTMLCanvasElement {
    const still = document.createElement('canvas');
    still.width = video.videoWidth;
    still.height = video.videoHeight;
    still.getContext('2d')!.drawImage(video, 0, 0);
    return still;
  }

  root.querySelector('.camera__shutter')!.addEventListener('click', () => {
    if (!video.videoWidth || busy) return;
    const still = grab();
    void run(still, still.width, still.height, frameCrop());
  });

  // Live scanning: read a frame about once a second, alternating upright and
  // upside down, and start the full check once two frames agree on a code.
  const votes = new FrameVotes();
  let frameNo = 0;
  function scheduleScan(delay = 700) {
    clearTimeout(loopTimer);
    loopTimer = window.setTimeout(scanFrame, delay);
  }
  async function scanFrame() {
    if (!root.isConnected || busy) return;
    if (!video.videoWidth || document.hidden) return scheduleScan();
    const still = grab();
    const crop = frameCrop();
    const rotation: Rotation = frameNo++ % 2 ? 180 : 0;
    try {
      const lots = await quickRead(still, still.width, still.height, crop, rotation);
      if (busy || !root.isConnected) return;
      status.textContent = lots.length ? 'Номер найден, держите банку неподвижно…' : 'Ищем номер партии…';
      if (votes.add(lots)) {
        void run(still, still.width, still.height, crop);
        return;
      }
    } catch {
      // The OCR engine may still be loading; try again shortly.
    }
    scheduleScan();
  }

  root.querySelector<HTMLInputElement>('input[type=file]')!.addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const bitmap = await createImageBitmap(file);
    void run(bitmap, bitmap.width, bitmap.height);
  });

  torchBtn.addEventListener('click', async () => {
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    torchOn = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: torchOn } as MediaTrackConstraintSet] });
      torchBtn.classList.toggle('is-on', torchOn);
    } catch {
      torchBtn.hidden = true;
    }
  });

  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      hint.textContent = 'Камера недоступна в этом браузере. Выберите фото кнопкой слева внизу или введите номер вручную.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (!root.isConnected) {
        stopStream();
        return;
      }
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as
        | { torch?: boolean; zoom?: { min: number; max: number }; focusMode?: string[] }
        | undefined;
      if (caps?.torch) torchBtn.hidden = false;
      // iPhone Pro cameras cannot focus closer than ~15 cm on the main lens:
      // a 2× zoom lets the user hold the phone at a distance the lens can focus at.
      const advanced: Record<string, unknown>[] = [];
      if (caps?.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
      if (caps?.zoom && caps.zoom.max >= 2) advanced.push({ zoom: Math.max(caps.zoom.min, 2) });
      if (advanced.length) await track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => {});
      status.textContent = 'Ищем номер партии…';
      scheduleScan(1200);
    } catch {
      hint.innerHTML =
        'Нет доступа к камере. Разрешите доступ в настройках, выберите фото кнопкой слева внизу<br/>или <a href="#/manual" class="camera__manual">введите номер вручную</a>.';
      hint.classList.add('camera__hint--warn');
    }
  })();
}
