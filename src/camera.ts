import { getOcrWorker, readLot } from './lib/ocr';
import { icons } from './icons';

/**
 * Full-screen camera overlay. The user frames the batch number and taps the
 * shutter; the frame is cropped, cleaned up and read on-device with Tesseract.
 * `onFound` gets the candidates (best first) when a code is recognised.
 */
export function openCamera(onFound: (candidates: string[]) => void): void {
  const root = document.createElement('div');
  root.className = 'camera';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Сканирование номера партии');
  root.innerHTML = `
    <video class="camera__video" playsinline muted autoplay></video>
    <div class="camera__shade"></div>
    <div class="camera__frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <button class="camera__btn camera__close" aria-label="Закрыть">${icons.close(24)}</button>
    <button class="camera__btn camera__torch" aria-label="Фонарик" hidden>${icons.flash(22)}</button>
    <p class="camera__hint">Наведите рамку на номер партии. Если мешают блики, наклоните банку</p>
    <div class="camera__bar">
      <label class="camera__btn camera__file" aria-label="Выбрать фото">${icons.image(22)}<input type="file" accept="image/*" hidden /></label>
      <button class="camera__shutter" aria-label="Сделать снимок"></button>
      <span class="camera__spacer"></span>
    </div>
    <div class="camera__busy" hidden>
      <div class="ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44"/><circle class="ring__val" cx="50" cy="50" r="44"/></svg>${icons.scan(36)}</div>
      <p class="camera__busy-title">Распознаём номер…</p>
      <p class="camera__busy-sub"></p>
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('no-scroll');

  const video = root.querySelector('video')!;
  const hint = root.querySelector<HTMLElement>('.camera__hint')!;
  const busy = root.querySelector<HTMLElement>('.camera__busy')!;
  const busySub = root.querySelector<HTMLElement>('.camera__busy-sub')!;
  const ringVal = root.querySelector<SVGCircleElement>('.ring__val')!;
  const torchBtn = root.querySelector<HTMLButtonElement>('.camera__torch')!;
  let stream: MediaStream | null = null;
  let torchOn = false;

  const close = () => {
    stream?.getTracks().forEach((t) => t.stop());
    root.remove();
    document.body.classList.remove('no-scroll');
    window.removeEventListener('hashchange', close);
  };
  window.addEventListener('hashchange', close);
  root.querySelector('.camera__close')!.addEventListener('click', close);

  // Start loading the OCR engine while the camera warms up.
  void getOcrWorker().catch(() => {});

  const setProgress = (p: number) => {
    ringVal.style.strokeDashoffset = String(276.5 * (1 - Math.max(0.05, Math.min(1, p))));
  };

  async function run(source: CanvasImageSource, w: number, h: number, crop?: DOMRect) {
    busy.hidden = false;
    busySub.textContent = navigator.onLine ? '' : 'Без интернета, на устройстве';
    setProgress(0.05);
    try {
      await getOcrWorker();
      const { lots: candidates } = await readLot(source, w, h, crop, setProgress);
      if (candidates.length) {
        close();
        onFound(candidates);
        return;
      }
      hint.textContent = 'Не удалось прочитать номер. Наклоните банку, чтобы убрать блики, подойдите ближе и попробуйте ещё раз, или введите номер вручную.';
      hint.classList.add('camera__hint--warn');
    } catch {
      hint.textContent = navigator.onLine
        ? 'Не удалось запустить распознавание. Введите номер вручную.'
        : 'Распознавание ещё не загружено на устройство. Подключитесь к интернету один раз или введите номер вручную.';
      hint.classList.add('camera__hint--warn');
    } finally {
      busy.hidden = true;
    }
  }

  /** Map the on-screen frame to video pixels (video is object-fit: cover). */
  function frameCrop(): DOMRect {
    const frame = root.querySelector<HTMLElement>('.camera__frame')!.getBoundingClientRect();
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const box = video.getBoundingClientRect();
    const scale = Math.max(box.width / vw, box.height / vh);
    const offX = (vw * scale - box.width) / 2;
    const offY = (vh * scale - box.height) / 2;
    const x = (frame.left - box.left + offX) / scale;
    const y = (frame.top - box.top + offY) / scale;
    return new DOMRect(
      Math.max(0, x),
      Math.max(0, y),
      Math.min(vw - x, frame.width / scale),
      Math.min(vh - y, frame.height / scale),
    );
  }

  root.querySelector('.camera__shutter')!.addEventListener('click', () => {
    if (!video.videoWidth) return;
    // Freeze the frame so the voting passes all read the same picture.
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
      hint.textContent = 'Камера недоступна в этом браузере. Выберите фото номера или введите его вручную.';
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (!root.isConnected) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as { torch?: boolean } | undefined;
      if (caps?.torch) torchBtn.hidden = false;
    } catch {
      hint.textContent = 'Нет доступа к камере. Разрешите доступ в настройках браузера, выберите фото или введите номер вручную.';
      hint.classList.add('camera__hint--warn');
    }
  })();
}
