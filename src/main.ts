import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { DATA_CHECKED_AT, HOTLINE, NOT_AFFECTED, PRODUCTION_PERIOD, RECALLED_PRODUCTS, SOURCE_URL } from './data/recall';
import { addToHistory, clearHistory, loadHistory, type HistoryItem } from './lib/history';
import { checkLot, LOT_LENGTH, normalizeLot, type CheckResult } from './lib/lot';
import { openCamera } from './camera';
import { can, canBottom, icons, logo } from './icons';

const app = document.getElementById('app')!;
const WELCOME_KEY = 'mm.welcomed.v1';
const VERSION = __APP_VERSION__;

registerSW({ immediate: true });

// ---------- helpers ----------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Сегодня, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Вчера, ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${time}`;
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

function go(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

const STATUS_LABEL: Record<HistoryItem['status'], string> = {
  recalled: 'Отозвана',
  similar: 'Проверьте',
  'not-recalled': 'Нет в списке',
};
const STATUS_TONE = { recalled: 'bad', similar: 'warn', 'not-recalled': 'ok' } as const;

// ---------- layout ----------

type Tab = 'scan' | 'history' | 'about' | null;

function tabbar(active: Tab): string {
  const item = (tab: Exclude<Tab, null>, href: string, icon: string, label: string) =>
    `<a href="${href}" class="tab ${active === tab ? 'tab--active' : ''}" ${active === tab ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="Разделы">
    ${item('scan', '#/', icons.scan(22), 'Проверка')}
    ${item('history', '#/history', icons.history(22), 'История')}
    ${item('about', '#/about', icons.info(22), 'О приложении')}
  </nav>`;
}

function offlinePill(): string {
  return navigator.onLine
    ? ''
    : `<div class="pill pill--offline" role="status">${icons.offline(16)} Нет интернета — проверка всё равно работает</div>`;
}

function page(content: string, tab: Tab, cls = ''): string {
  return `<main class="screen ${cls}">${offlinePill()}${content}</main>${tab ? tabbar(tab) : ''}`;
}

// ---------- screens ----------

function welcomeScreen(): string {
  return `<main class="screen screen--welcome">
    <div class="welcome">
      <div class="welcome__logo">${logo(120)}</div>
      <h1 class="brand">Можно<br/>малышу</h1>
      <p class="lead">Проверьте детскую смесь перед покупкой</p>
      <div class="welcome__card">
        <p>Nestlé отозвала часть партий смесей NAN, NESTOGEN, PRENAN и ALFARÉ, выпущенных с ${PRODUCTION_PERIOD.from} по ${PRODUCTION_PERIOD.to}.</p>
        <p>Введите или сфотографируйте номер партии с дна банки, и приложение скажет, есть ли он в списке отзыва.</p>
      </div>
      <button class="btn btn--primary btn--block" data-action="start">Начать</button>
      <p class="muted small center">С заботой о вашем малыше 💙</p>
    </div>
  </main>`;
}

function recentList(items: HistoryItem[]): string {
  if (!items.length) return '';
  return `<section class="section">
    <div class="section__head"><h2>Последние проверки</h2><a href="#/history" class="link">Все</a></div>
    <ul class="list">${items.map(historyRow).join('')}</ul>
  </section>`;
}

function homeScreen(): string {
  return page(
    `<header class="topbar">
      <div class="topbar__brand">${logo(36)}<span>Можно<br/>малышу</span></div>
      <a href="#/about" class="icon-btn" aria-label="О приложении">${icons.info(22)}</a>
    </header>
    <h1 class="title">Проверьте детскую смесь перед покупкой</h1>
    <p class="muted">Номер партии — 10 букв и цифр на дне банки, обычно рядом со сроком годности.</p>
    <div class="hero">${canBottom()}</div>
    <button class="btn btn--primary btn--block" data-action="camera">${icons.camera(20)} Сканировать номер камерой</button>
    <form class="lot-form" data-form="lot" autocomplete="off">
      <label for="lot" class="label">Или введите номер партии</label>
      <div class="lot-form__row">
        <input id="lot" name="lot" class="input input--mono" inputmode="text" autocapitalize="characters"
          spellcheck="false" placeholder="например, 51510346AB" maxlength="24" enterkeyhint="go" />
        <button class="btn btn--dark" type="submit">Проверить</button>
      </div>
      <p class="hint" data-hint></p>
    </form>
    ${recentList(loadHistory().slice(0, 3))}
    <a href="#/about" class="btn btn--ghost btn--block">Как это работает?</a>`,
    'scan',
  );
}

let lastOcr: { candidates: string[] } | null = null;

function resultScreen(rawLot: string, fromOcr: boolean, save: boolean): string {
  const result = checkLot(rawLot);
  const others = fromOcr && lastOcr ? lastOcr.candidates.filter((c) => c !== normalizeLot(rawLot)) : [];

  if (save && (result.status === 'recalled' || result.status === 'similar' || result.status === 'not-recalled')) {
    addToHistory({
      ts: Date.now(),
      lot: result.input,
      status: result.status,
      product: 'entry' in result ? `${result.entry.product.name} ${result.entry.product.weight}` : undefined,
    });
  }

  const ocrNote = fromOcr
    ? `<div class="note">${icons.camera(18)}<div>Номер распознан камерой. Сверьте его с банкой.
         <button class="link" data-action="edit" data-lot="${esc(result.status === 'empty' ? '' : result.input)}">Исправить</button></div></div>
       ${others.length ? `<div class="others">Также распознано: ${others.map((c) => `<a class="chip" href="#/check/${esc(c)}?ocr=1">${esc(c)}</a>`).join(' ')}</div>` : ''}`
    : '';

  return page(
    `<header class="topbar topbar--plain">
      <a href="#/" class="icon-btn" aria-label="Назад">${icons.back(22)}</a>
      <span class="topbar__title">Результат проверки</span>
      <span class="icon-btn" aria-hidden="true"></span>
    </header>
    ${resultCard(result)}
    ${ocrNote}
    <div class="actions">
      <button class="btn btn--primary btn--block" data-action="camera">${icons.camera(20)} Проверить другую банку</button>
      <a href="#/" class="btn btn--ghost btn--block">Ввести номер вручную</a>
    </div>
    <p class="muted small center">Список проверен ${formatDate(DATA_CHECKED_AT)} · <a class="link" href="${SOURCE_URL}" target="_blank" rel="noopener">источник Nestlé</a></p>`,
    'scan',
    `screen--result screen--${toneOf(result)}`,
  );
}

function toneOf(r: CheckResult): string {
  switch (r.status) {
    case 'recalled':
      return 'bad';
    case 'similar':
      return 'warn';
    case 'not-recalled':
      return 'ok';
    default:
      return 'neutral';
  }
}

function lotRows(lot: string, product?: string): string {
  return `<dl class="facts">
    ${product ? `<div><dt>Продукт</dt><dd>${esc(product)}</dd></div>` : ''}
    <div><dt>Партия (LOT)</dt><dd class="mono">${esc(lot)}</dd></div>
  </dl>`;
}

function whatToDo(): string {
  return `<div class="todo">
    <h3>Что делать</h3>
    <ul>
      <li>Не давайте эту смесь ребёнку и не выбрасывайте банку: для возврата нужна оригинальная упаковка.</li>
      <li>Верните её в магазин, где покупали, или в любой «Детский мир» (начислят бонусы).</li>
      <li>Если ребёнок уже пил эту смесь и вас что-то беспокоит, обратитесь к педиатру.</li>
    </ul>
    <a class="btn btn--danger btn--block" href="tel:${HOTLINE.replace(/\s/g, '')}">${icons.phone(18)} Позвонить: ${HOTLINE}</a>
    <a class="btn btn--ghost btn--block" href="${SOURCE_URL}" target="_blank" rel="noopener">Подробнее на сайте Nestlé ${icons.external(16)}</a>
  </div>`;
}

function resultCard(r: CheckResult): string {
  switch (r.status) {
    case 'recalled': {
      const p = r.entry.product;
      return `<section class="verdict verdict--bad" role="alert">
        <div class="verdict__badge">${icons.alert(40)}</div>
        <h1>Эта партия отозвана</h1>
        <p>Не покупайте и не используйте этот продукт.</p>
      </section>
      <section class="card">
        <div class="card__product">${can('bad')}<div><b>${esc(p.name)}</b><span class="muted">${esc(p.weight)}</span></div></div>
        ${lotRows(r.entry.lot)}
        ${r.input !== r.entry.lot ? `<p class="small muted">Вы ввели ${esc(r.input)}, это совпадает с отозванной партией ${esc(r.entry.lot)} (похожие символы, например 0 и O, считаются одинаковыми).</p>` : ''}
      </section>
      ${whatToDo()}`;
    }
    case 'similar': {
      const p = r.entry.product;
      return `<section class="verdict verdict--warn" role="alert">
        <div class="verdict__badge">${icons.question(40)}</div>
        <h1>Проверьте номер ещё раз</h1>
        <p>Он отличается от отозванной партии всего одним символом.</p>
      </section>
      <section class="card">
        ${lotRows(r.input)}
        <div class="compare">
          <span class="muted small">Отозвана партия</span>
          <span class="mono">${diffMarkup(r.entry.lot, r.input)}</span>
          <span class="muted small">${esc(p.name)} ${esc(p.weight)}</span>
        </div>
        <p class="small">Если на банке именно <b class="mono">${esc(r.entry.lot)}</b>, партия отозвана. Если номер введён верно, его нет в списке отзыва.</p>
        <button class="btn btn--ghost btn--block" data-action="edit" data-lot="${esc(r.input)}">Исправить номер</button>
      </section>`;
    }
    case 'not-recalled':
      return `<section class="verdict verdict--ok" role="status">
        <div class="verdict__badge">${icons.check(40)}</div>
        <h1>Этой партии нет в списке отозванных</h1>
        <p>По данным Nestlé, отзыв её не касается.</p>
      </section>
      <section class="card">
        ${lotRows(r.input)}
        ${r.input.length !== LOT_LENGTH ? `<p class="small warn-text">Номер партии обычно состоит из ${LOT_LENGTH} символов, а у вас ${r.input.length}. Проверьте, что ввели только номер партии.</p>` : ''}
        <p class="small muted">Отозваны только партии из официального списка. Все остальные партии, в том числе NAN 3 и NAN 4 OPTIPRO и NESTOGEN 1–4, можно использовать.</p>
      </section>`;
    case 'too-short':
      return `<section class="verdict verdict--neutral">
        <div class="verdict__badge">${icons.question(40)}</div>
        <h1>Номер слишком короткий</h1>
        <p>Номер партии состоит из ${LOT_LENGTH} символов, а введено ${r.input.length}: <span class="mono">${esc(r.input)}</span>.</p>
      </section>
      <button class="btn btn--ghost btn--block" data-action="edit" data-lot="${esc(r.input)}">Исправить номер</button>`;
    case 'empty':
      return `<section class="verdict verdict--neutral"><div class="verdict__badge">${icons.question(40)}</div><h1>Номер не введён</h1></section>`;
  }
}

/** Highlight the differing character between the recalled lot and what was entered. */
function diffMarkup(recalled: string, entered: string): string {
  return Array.from(recalled)
    .map((ch, i) => (ch === entered[i] ? esc(ch) : `<mark>${esc(ch)}</mark>`))
    .join('');
}

function historyRow(h: HistoryItem): string {
  const tone = STATUS_TONE[h.status];
  return `<li><a class="row" href="#/check/${encodeURIComponent(h.lot)}?view">
    ${can(tone, 40)}
    <div class="row__body">
      <span class="muted small">${formatTime(h.ts)}</span>
      <span class="mono">${esc(h.lot)}</span>
      ${h.product ? `<span class="small">${esc(h.product)}</span>` : ''}
    </div>
    <span class="badge badge--${tone}">${STATUS_LABEL[h.status]}</span>
  </a></li>`;
}

function historyScreen(): string {
  const items = loadHistory();
  return page(
    `<header class="topbar topbar--plain"><span class="topbar__title topbar__title--left">История проверок</span></header>
    ${
      items.length
        ? `<ul class="list">${items.map(historyRow).join('')}</ul>
           <button class="btn btn--ghost btn--block" data-action="clear-history">Очистить историю</button>`
        : `<div class="empty">${icons.history(48)}<p>Здесь появятся проверенные банки.</p><a class="btn btn--primary" href="#/">Проверить банку</a></div>`
    }
    <p class="muted small center">История хранится только на этом устройстве.</p>`,
    'history',
  );
}

function aboutScreen(): string {
  const total = RECALLED_PRODUCTS.reduce((n, p) => n + p.lots.length, 0);
  return page(
    `<header class="topbar topbar--plain"><span class="topbar__title topbar__title--left">О приложении</span></header>
    <div class="about-head">${logo(72)}<h2>Можно малышу</h2><p class="muted">Проверьте детское питание перед покупкой</p><p class="muted small">Версия ${VERSION}</p></div>

    <details class="acc" open>
      <summary>Как это работает</summary>
      <ol>
        <li>Переверните банку и найдите номер партии: 10 букв и цифр, например <span class="mono">51510346AB</span>.</li>
        <li>Наведите на него камеру или введите вручную.</li>
        <li>Приложение сравнит номер со списком отозванных партий, опубликованным Nestlé.</li>
      </ol>
      <p class="small muted">Штрихкод у всех партий одного продукта одинаковый, поэтому проверять нужно именно номер партии.</p>
    </details>

    <details class="acc">
      <summary>Почему отзывают смесь</summary>
      <p>Nestlé отзывает партии в качестве меры предосторожности: у поставщика одного из ингредиентов (арахидоновой кислоты) выявлен потенциальный риск наличия токсина цереулида. Отзываемые партии произведены с ${PRODUCTION_PERIOD.from} по ${PRODUCTION_PERIOD.to}.</p>
    </details>

    <details class="acc">
      <summary>Список отозванных партий (${total})</summary>
      ${RECALLED_PRODUCTS.map(
        (p) => `<div class="lots"><h4>${esc(p.name)} <span class="muted">${esc(p.weight)}</span></h4>
          <div class="lots__grid">${p.lots.map((l) => `<a class="chip mono" href="#/check/${l}?view">${l}</a>`).join('')}</div></div>`,
      ).join('')}
      <p class="small muted">Не затронуты: ${NOT_AFFECTED.join('; ')}.</p>
    </details>

    <details class="acc">
      <summary>Что делать, если партия отозвана</summary>
      <ul>
        <li>Сохраните оригинальную упаковку: без неё возврат невозможен.</li>
        <li>Верните банку в магазин, где покупали, или в любой «Детский мир».</li>
        <li>Или отправьте упаковку Почтой России, адрес указан на сайте Nestlé.</li>
        <li>Частные лица могут вернуть до 20 упаковок.</li>
      </ul>
      <a class="btn btn--ghost btn--block" href="tel:${HOTLINE.replace(/\s/g, '')}">${icons.phone(18)} ${HOTLINE} (круглосуточно)</a>
    </details>

    <a class="row row--link" href="${SOURCE_URL}" target="_blank" rel="noopener">
      ${icons.info(20)}<div class="row__body"><span>Источник данных</span><span class="muted small">Официальная страница Nestlé</span></div>${icons.external(18)}
    </a>

    <p class="small muted">Приложение неофициальное и не связано с Nestlé. Оно работает без интернета: список партий хранится на устройстве. Данные о партиях проверены ${formatDate(DATA_CHECKED_AT)}. Если сомневаетесь, позвоните на горячую линию Nestlé.</p>
    <p class="small muted">Приложение ничего не отправляет на сервер. Фото с камеры обрабатываются на телефоне.</p>`,
    'about',
  );
}

// ---------- router ----------

function render(): void {
  const hash = location.hash || '#/';
  const [path, query = ''] = hash.slice(1).split('?');
  const params = new URLSearchParams(query);

  if (!storageGet(WELCOME_KEY) && path !== '/welcome' && !path.startsWith('/check/')) {
    location.replace('#/welcome');
    return;
  }

  if (path === '/welcome') app.innerHTML = welcomeScreen();
  else if (path === '/history') app.innerHTML = historyScreen();
  else if (path === '/about') app.innerHTML = aboutScreen();
  else if (path.startsWith('/check/')) app.innerHTML = resultScreen(decodeURIComponent(path.slice(7)), params.has('ocr'), !params.has('view'));
  else app.innerHTML = homeScreen();

  window.scrollTo(0, 0);
  const prefill = params.get('edit');
  if (prefill !== null) {
    const input = app.querySelector<HTMLInputElement>('#lot');
    if (input) {
      input.value = prefill;
      input.focus();
    }
  }
}

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'start':
      storageSet(WELCOME_KEY, '1');
      go('#/');
      break;
    case 'camera':
      openCamera((candidates) => {
        lastOcr = { candidates };
        go(`#/check/${encodeURIComponent(candidates[0])}?ocr=1`);
      });
      break;
    case 'edit':
      go(`#/?edit=${encodeURIComponent(el.dataset.lot ?? '')}`);
      break;
    case 'clear-history':
      if (confirm('Очистить историю проверок?')) {
        clearHistory();
        render();
      }
      break;
  }
});

app.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (form.dataset.form !== 'lot') return;
  e.preventDefault();
  const input = form.querySelector<HTMLInputElement>('#lot')!;
  const lot = normalizeLot(input.value);
  const hint = form.querySelector<HTMLElement>('[data-hint]')!;
  if (!lot) {
    hint.textContent = 'Введите номер партии с дна банки.';
    input.focus();
    return;
  }
  if (lot.length < LOT_LENGTH) {
    hint.textContent = `Номер партии состоит из ${LOT_LENGTH} символов, введено ${lot.length}.`;
    input.focus();
    return;
  }
  lastOcr = null;
  go(`#/check/${encodeURIComponent(lot)}`);
});

app.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== 'lot') return;
  const hint = app.querySelector<HTMLElement>('[data-hint]');
  const n = normalizeLot(input.value).length;
  if (hint) hint.textContent = n ? `${n} из ${LOT_LENGTH} символов` : '';
});

window.addEventListener('hashchange', render);
window.addEventListener('online', render);
window.addEventListener('offline', render);
render();
