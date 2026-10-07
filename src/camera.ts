import { getOcrWorker, readLot, type LotReading } from './lib/ocr';
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
    <div class="camera__frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <button class="camera__icon camera__close" aria-label="Закрыть">${icons.close(30)}</button>
    <button class="camera__icon camera__torch" aria-label="Фонарик" hidden>${icons.flash(28)}</button>
    <p class="camera__hint">Наведите камеру на номер партии (LOT)<br/>на дне банки</p>
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
  let stream: MediaStream | null = null;
  let torchOn = false;

  const stopStream = () => stream?.getTracks().forEach((t) => t.stop());
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
    recog.hidden = true;
    hint.innerHTML = `${text}<br/><a href="#/manual" class="camera__manual">Ввести вручную</a>`;
    hint.classList.add('camera__hint--warn');
  }

  /** Map the on-screen frame to video pixels (the video is object-fit: cover). */
  function frameCrop(): DOMRect {
    const frame = root.querySelector<HTMLElement>('.camera__frame')!.getBoundingClientRect();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const box = video.getBoundingClientRect();
    const scale = Math.max(box.width / vw, box.height / vh);
    const offX = (vw * scale - box.width) / 2;
    const offY = (vh * scale - box.height) / 2;
    const x = Math.max(0, (frame.left - box.left + offX) / scale);
    const y = Math.max(0, (frame.top - box.top + offY) / scale);
    return new DOMRect(x, y, Math.min(vw - x, frame.width / scale), Math.min(vh - y, frame.height / scale));
  }

  root.querySelector('.camera__shutter')!.addEventListener('click', () => {
    if (!video.videoWidth) return;
    // Freeze the frame so every OCR pass reads the same picture.
    const still = document.createElement('canvas');
    still.width = video.videoWidth;
    still.height = video.videoHeight;
    still.getContext('2d')!.drawImage(video, 0, 0);
    void run(still, still.width, still.height, frameCrop());
  });

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
      const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
      if (caps?.torch) torchBtn.hidden = false;
    } catch {
      hint.innerHTML =
        'Нет доступа к камере. Разрешите доступ в настройках, выберите фото кнопкой слева внизу<br/>или <a href="#/manual" class="camera__manual">введите номер вручную</a>.';
      hint.classList.add('camera__hint--warn');
    }
  })();
}
