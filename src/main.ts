import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/latin-600.css';
import '@fontsource/unbounded/cyrillic-500.css';
import '@fontsource/unbounded/cyrillic-700.css';
import '@fontsource/unbounded/latin-500.css';
import '@fontsource/unbounded/latin-700.css';
import './style.css';
import { registerSW } from 'virtual:pwa-register';
import { DATA_CHECKED_AT, HOTLINE, NOT_AFFECTED, PRODUCTION_PERIOD, RECALLED_PRODUCTS, SOURCE_URL } from './data/recall';
import { productInfo, UNKNOWN_PRODUCT, type ProductInfo } from './data/products';
import { addToHistory, addToSession, clearHistory, loadHistory, loadSession, saveHistory, type HistoryItem } from './lib/history';
import { backupFileName, makeBackup, mergeHistory, parseBackup } from './lib/backup';
import { addCustomLot, initCustomLots, loadCustomLots, mergeCustomLots, removeCustomLot, saveCustomLots } from './lib/custom';
import { checkLot, LOT_LENGTH, normalizeLot, type CheckResult } from './lib/lot';
import { productionDateFromLot } from './lib/dates';
import { openCamera, type ScanResult } from './camera';
import { can, icons, logo, offlineCloud } from './icons';
import motherUrl from './assets/mother.webp';
import canScanUrl from './assets/can-scan.webp';

const app = document.getElementById('app')!;
const WELCOME_KEY = 'mm.welcomed.v1';
const OFFLINE_SEEN_KEY = 'mm.offline-seen';
const BACKUP_AT_KEY = 'mm.backup-at';
const VERSION = __APP_VERSION__;

registerSW({ immediate: true });
initCustomLots();

// ---------- helpers ----------

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function longDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === new Date().toDateString()) return `Сегодня, ${time}`;
  if (d.toDateString() === new Date(Date.now() - 864e5).toDateString()) return `Вчера, ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(' г.', '')}, ${time}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Hand the backup to the iOS share sheet (Save to Files, AirDrop…) or download it. */
async function saveBackup(): Promise<string> {
  const json = JSON.stringify(makeBackup(loadHistory(), loadCustomLots()), null, 1);
  const name = backupFileName();
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Mila: резервная копия' });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return '';
      throw e;
    }
  } else {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  set(BACKUP_AT_KEY, String(Date.now()));
  return 'Копия сохранена.';
}

async function restoreBackup(file: File): Promise<string> {
  const restored = parseBackup(await file.text());
  const { items, added } = mergeHistory(loadHistory(), restored.history);
  const blocked = mergeCustomLots(loadCustomLots(), restored.blocked);
  if (!saveHistory(items) || !saveCustomLots(blocked.items)) {
    throw new Error('Не удалось сохранить данные: память браузера недоступна.');
  }
  const parts = [
    added && `${added} ${plural(added, 'проверка', 'проверки', 'проверок')}`,
    blocked.added && `${blocked.added} ${plural(blocked.added, 'своя партия', 'своих партии', 'своих партий')}`,
  ].filter(Boolean);
  return parts.length ? `Восстановлено: ${parts.join(' и ')}.` : 'Всё из копии уже есть на телефоне.';
}

function storage(kind: 'local' | 'session') {
  try {
    return kind === 'local' ? localStorage : sessionStorage;
  } catch {
    return null;
  }
}
const get = (k: string, kind: 'local' | 'session' = 'local') => storage(kind)?.getItem(k) ?? null;
const set = (k: string, v: string, kind: 'local' | 'session' = 'local') => {
  try {
    storage(kind)?.setItem(k, v);
  } catch {
    /* private mode */
  }
};

function go(hash: string): void {
  if (location.hash === hash) render();
  else location.hash = hash;
}

/** Product shown for a check: known for recalled lots, generic otherwise. */
function productFor(r: CheckResult): ProductInfo {
  if (r.status !== 'recalled' && r.status !== 'similar') return UNKNOWN_PRODUCT;
  if (r.entry.custom) {
    return { title: r.entry.custom.note || 'Моя партия', description: 'Из вашего списка «Мои партии»', brand: '', tone: 'purple' };
  }
  return productInfo(r.entry.product);
}

const isOwn = (r: CheckResult) => (r.status === 'recalled' || r.status === 'similar') && !!r.entry.custom;

type Tone = 'ok' | 'bad' | 'warn';
const TONE: Record<HistoryItem['status'], Tone> = { recalled: 'bad', similar: 'warn', 'not-recalled': 'ok' };
const CHIP: Record<Tone, string> = { ok: 'В порядке', bad: 'Отозвана', warn: 'Проверьте' };

function chip(tone: Tone): string {
  return `<span class="chip chip--${tone}">${CHIP[tone]}</span>`;
}

/** Colour the iOS status bar area to match the screen; takes a CSS variable so it follows the light/dark theme. */
function setThemeColor(cssVar: string): void {
  const color = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  if (color) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
}

// ---------- layout ----------

type Tab = 'scan' | 'history' | 'about' | null;

function tabbar(active: Tab): string {
  const item = (tab: Exclude<Tab, null>, href: string, icon: string, iconActive: string, label: string) =>
    `<a href="${href}" class="tab ${active === tab ? 'is-active' : ''}" ${active === tab ? 'aria-current="page"' : ''}>
      ${active === tab ? iconActive : icon}<span>${label}</span></a>`;
  return `<nav class="tabbar" aria-label="Разделы">
    ${item('scan', '#/', icons.scan(26), icons.scan(26), 'Сканер')}
    ${item('history', '#/history', icons.history(26), icons.clockFilled(26), 'История')}
    ${item('about', '#/about', icons.info(26), icons.infoFilled(26), 'О приложении')}
  </nav>`;
}

function page(content: string, tab: Tab, cls = ''): string {
  return `<main class="screen ${cls} ${tab ? 'has-tabbar' : ''}">${content}</main>${tab ? tabbar(tab) : ''}`;
}

// ---------- 1. Welcome ----------

function welcomeScreen(): string {
  return `<main class="screen screen--welcome">
    <div class="welcome__top">
      ${logo(112)}
      <h1 class="brand">Mila</h1>
      <p class="welcome__lead">Проверьте детское питание<br/>перед покупкой</p>
    </div>
    <div class="welcome__art">
      <img src="${motherUrl}" alt="" width="1110" height="720" />
    </div>
    <div class="welcome__bottom">
      <button class="btn btn--primary btn--block" data-action="start">Начать</button>
      <p class="welcome__care">С заботой о вашем малыше <span class="heart">💙</span></p>
    </div>
  </main>`;
}

// ---------- 2. Home (scanner) ----------

function homeScreen(): string {
  return page(
    `<header class="appbar">
      <div class="appbar__brand">${logo(40)}<span>Mila</span></div>
      <a href="#/about/how" class="icon-btn" aria-label="Как это работает">${icons.info(26)}</a>
    </header>
    <h1 class="h1">Проверьте детскую смесь перед покупкой</h1>
    <p class="sub">Наведите камеру на номер партии (LOT) на дне банки.</p>
    <div class="scan-hero-wrap"><div class="scan-hero" aria-hidden="true">
      <i></i><i></i><i></i><i></i>
      <img src="${canScanUrl}" alt="" width="440" height="560" />
    </div></div>
    <div class="stack">
      <button class="btn btn--primary btn--block" data-action="camera">${icons.camera(24)} Сканировать</button>
      <a href="#/about/how" class="btn btn--outline btn--block">Как это работает?</a>
      <a href="#/manual" class="link-quiet">Ввести номер партии вручную</a>
    </div>`,
    'scan',
    'screen--home',
  );
}

// ---------- manual entry ----------

function manualScreen(prefill = ''): string {
  return page(
    `<header class="navbar">
      <a href="#/" class="icon-btn icon-btn--ink" aria-label="Назад">${icons.back(24)}</a>
      <h1 class="navbar__title">Номер партии</h1>
    </header>
    <form class="card manual" data-form="lot" autocomplete="off">
      <label for="lot" class="label">Введите номер с дна банки</label>
      <input id="lot" name="lot" class="input" inputmode="text" autocapitalize="characters" spellcheck="false"
        placeholder="например, 51510346AB" maxlength="24" enterkeyhint="go" value="${esc(prefill)}" />
      <p class="hint" data-hint>Номер партии — ${LOT_LENGTH} цифр и букв, часто после «L-» или «LOT».</p>
      <button class="btn btn--primary btn--block" type="submit">Проверить</button>
    </form>`,
    'scan',
  );
}

// ---------- 5/6. Result ----------

interface ResultParams {
  fromOcr: boolean;
  save: boolean;
  exp?: string;
  man?: string;
}

function resultScreen(rawLot: string, p: ResultParams): string {
  const result = checkLot(rawLot);
  if (result.status === 'empty' || result.status === 'too-short') {
    return manualScreen(result.status === 'too-short' ? result.input : '');
  }
  const product = productFor(result);
  const own = isOwn(result);
  const lot = result.status === 'recalled' && !own ? result.entry.lot : result.input;

  if (p.save) {
    const item: HistoryItem = { ts: Date.now(), lot: result.input, status: result.status };
    addToHistory(item);
    addToSession(item);
  }

  // Other brands encode batch numbers differently, so the date is only derived for Nestlé lots.
  const madeOn = p.man ?? (own ? undefined : productionDateFromLot(lot));
  const dateRow = p.exp ? row('Срок годности', p.exp) : madeOn ? row('Дата производства', madeOn) : '';
  const productCard = `<div class="pcard__head">
      ${can(product === UNKNOWN_PRODUCT ? null : product, 92)}
      <div><h2 class="pcard__title">${esc(product.title)}</h2><p class="pcard__desc">${esc(product.description)}</p></div>
    </div>
    <dl class="facts">${row('Партия (LOT)', lot, true)}${dateRow}</dl>`;

  const ocrNote = p.fromOcr
    ? `<p class="ocr-note">Номер распознан камерой, сверьте его с банкой. <button class="link" data-action="edit" data-lot="${esc(result.input)}">Исправить</button></p>`
    : '';
  const session = loadSession();
  const sessionLink =
    session.length > 1 ? `<a class="link-quiet" href="#/session">Проверено банок: ${session.length}</a>` : '';

  if (result.status === 'recalled' && own) {
    setThemeColor('--bad-bg');
    return page(
      `<section class="verdict">
        <div class="badge badge--bad">${icons.block(44)}</div>
        <h1 class="verdict__title">Партия в вашем списке</h1>
        <p class="verdict__sub">Вы сами добавили её в заблокированные.<br/>Не покупайте этот продукт.</p>
      </section>
      <section class="card pcard">
        ${productCard}
        ${ocrNote}
      </section>
      <a class="btn btn--danger btn--block" href="#/about/blocked">Мои партии</a>
      <button class="btn btn--outline btn--block" data-action="camera">Проверить другую банку</button>
      ${sessionLink}`,
      'scan',
      'screen--bad',
    );
  }

  if (result.status === 'recalled') {
    setThemeColor('--bad-bg');
    return page(
      `<section class="verdict">
        <div class="badge badge--bad">${icons.bang(44)}</div>
        <h1 class="verdict__title">Эта партия отозвана</h1>
        <p class="verdict__sub">Не покупайте и не используйте<br/>этот продукт.</p>
      </section>
      <section class="card pcard">
        ${productCard}
        ${ocrNote}
        <div class="alert">
          ${icons.alertCircle(22)}
          <p>Подробнее об отзыве и дальнейших действиях можно узнать на сайте Nestlé.
          Горячая линия: <a href="tel:${HOTLINE.replace(/\s/g, '')}">${HOTLINE}</a>.</p>
        </div>
      </section>
      <a class="btn btn--danger btn--block" href="${SOURCE_URL}" target="_blank" rel="noopener">Узнать больше</a>
      <button class="btn btn--outline btn--block" data-action="camera">Проверить другую банку</button>
      ${sessionLink}`,
      'scan',
      'screen--bad',
    );
  }

  if (result.status === 'similar') {
    setThemeColor('--warn-bg');
    return page(
      `<section class="verdict">
        <div class="badge badge--warn">${icons.question(44)}</div>
        <h1 class="verdict__title">Проверьте номер ещё раз</h1>
        <p class="verdict__sub">Он отличается от ${own ? 'партии из вашего списка' : 'отозванной партии'}<br/>${esc(result.entry.lot)} одним символом.</p>
      </section>
      <section class="card pcard">
        ${productCard}
        <div class="compare"><span>${own ? 'Ваша партия' : 'Отозвана партия'}</span><b>${diffMarkup(result.entry.lot, result.input)}</b></div>
        <p class="small">Если на банке именно <b>${esc(result.entry.lot)}</b>, ${own ? 'партия в вашем списке заблокированных' : 'партия отозвана'}. Если номер введён верно, его нет в ${own ? 'списке' : 'списке отзыва'}.</p>
        ${ocrNote}
      </section>
      <button class="btn btn--primary btn--block" data-action="edit" data-lot="${esc(result.input)}">Исправить номер</button>
      <button class="btn btn--outline btn--block" data-action="camera">Проверить другую банку</button>`,
      'scan',
      'screen--warn',
    );
  }

  return page(
    `<div class="okpanel">
      <section class="verdict">
        <div class="badge badge--ok">${icons.check(44)}</div>
        <h1 class="verdict__title">Этот продукт<br/>не в списке отозванных<br/>партий</h1>
      </section>
      <section class="card pcard">
        ${productCard}
        ${ocrNote}
      </section>
      <p class="actual">Данные актуальны на ${longDate(DATA_CHECKED_AT)} ${icons.refresh(16)}</p>
      <button class="btn btn--outline btn--block" data-action="camera">Проверить другую банку</button>
      <a class="link-quiet" href="#/about/blocked?lot=${encodeURIComponent(result.input)}">${icons.block(18)} Добавить в «Мои партии»</a>
      ${sessionLink}
    </div>`,
    'scan',
    'screen--ok',
  );
}

function row(label: string, value: string, mono = false): string {
  return `<div><dt>${label}</dt><dd${mono ? ' class="mono"' : ''}>${esc(value)}</dd></div>`;
}

function diffMarkup(recalled: string, entered: string): string {
  return Array.from(recalled)
    .map((ch, i) => (ch === entered[i] ? esc(ch) : `<mark>${esc(ch)}</mark>`))
    .join('');
}

// ---------- 7. Session queue ----------

function sessionScreen(): string {
  const items = loadSession();
  return page(
    `<header class="navbar">
      <a href="#/" class="icon-btn icon-btn--ink" aria-label="Назад">${icons.back(24)}</a>
      <h1 class="navbar__title">Сканировать ещё</h1>
    </header>
    ${
      items.length
        ? `<ul class="list">${items
            .map((h, i) => {
              const r = checkLot(h.lot);
              const tone = TONE[h.status];
              return `<li><a class="qrow" href="#/check/${encodeURIComponent(h.lot)}?view">
                <span class="dot dot--${tone}">${tone === 'ok' ? icons.check(14) : tone === 'bad' ? icons.bang(14) : icons.question(14)}</span>
                ${can(r.status === 'recalled' || r.status === 'similar' ? productFor(r) : null, 54)}
                <span class="qrow__body"><span>Банка ${i + 1}</span><span>${esc(productFor(r).title)}</span><span>Партия ${esc(h.lot)}</span></span>
                ${chip(tone)}
              </a></li>`;
            })
            .join('')}</ul>`
        : `<p class="empty">Пока ни одной банки. Отсканируйте первую.</p>`
    }
    <div class="sticky-cta"><button class="btn btn--primary btn--block" data-action="camera">Сканировать ещё</button></div>`,
    null,
    'screen--session',
  );
}

// ---------- 8. History ----------

function historyRow(h: HistoryItem): string {
  const r = checkLot(h.lot);
  const product = productFor(r);
  const tone = TONE[h.status];
  return `<li><a class="hrow" href="#/check/${encodeURIComponent(h.lot)}?view">
    ${can(r.status === 'recalled' || r.status === 'similar' ? product : null, 60)}
    <span class="hrow__body">
      <span class="hrow__time">${formatTime(h.ts)}</span>
      <span class="hrow__meta"><span class="nowrap">${esc(product.title)}</span> <span class="sep">•</span> <span class="nowrap">Партия ${esc(h.lot)}</span></span>
      ${chip(tone)}
    </span>
    <span class="hrow__chev">${icons.chevron(18)}</span>
  </a></li>`;
}

function historyScreen(): string {
  const items = loadHistory();
  return page(
    `<h1 class="h2">История проверок</h1>
    ${
      items.length
        ? `<ul class="list">${items.map(historyRow).join('')}</ul>
           <button class="link-quiet" data-action="clear-history">Очистить историю</button>`
        : `<div class="empty">${icons.history(48)}<p>Здесь появятся проверенные банки.</p><a class="btn btn--primary" href="#/">Проверить банку</a></div>`
    }`,
    'history',
  );
}

// ---------- 9. About ----------

const ABOUT_PAGES: Record<string, { title: string; icon: string; sub?: string; body: () => string }> = {
  how: {
    title: 'Как это работает',
    icon: icons.how(22),
    body: () => `<ol class="steps">
        <li><b>Переверните банку.</b> На дне напечатаны номер партии, дата производства и срок годности.</li>
        <li><b>Наведите камеру</b> так, чтобы строка с номером (обычно после «L-» или «LOT») попала в рамку. Банку можно держать и вверх ногами.</li>
        <li><b>Сверьте результат.</b> Приложение сравнит номер со списком отозванных партий Nestlé. Список хранится на телефоне и работает без интернета.</li>
      </ol>
      <p class="small">Штрихкод у всех партий одного продукта одинаковый, поэтому проверять нужно именно номер партии.</p>`,
  },
  faq: {
    title: 'Часто задаваемые вопросы',
    icon: icons.faq(22),
    body: () => `
      <h3>Почему отзывают смесь?</h3>
      <p>Nestlé отзывает партии в качестве меры предосторожности: у поставщика арахидоновой кислоты выявлен потенциальный риск наличия токсина цереулида. Отзываемые партии произведены с ${PRODUCTION_PERIOD.from} по ${PRODUCTION_PERIOD.to}.</p>
      <h3>Каких продуктов это касается?</h3>
      <p>Только партий из официального списка (${RECALLED_PRODUCTS.reduce((n, p) => n + p.lots.length, 0)} номеров). Не затронуты: ${NOT_AFFECTED.join('; ')}.</p>
      <h3>Что делать, если партия отозвана?</h3>
      <p>Не используйте смесь и сохраните упаковку. Верните её в магазин, где покупали, или в любой «Детский мир». Частные лица могут вернуть до 20 упаковок. Горячая линия Nestlé: <a href="tel:${HOTLINE.replace(/\s/g, '')}">${HOTLINE}</a> (круглосуточно).</p>
      <h3>Ребёнок уже пил смесь из отозванной партии</h3>
      <p>Если вас что-то беспокоит в самочувствии ребёнка, обратитесь к педиатру.</p>
      <h3>Камера не распознаёт номер</h3>
      <p>Наклоните банку, чтобы убрать блики, и поднесите телефон ближе. Если не получается, введите номер вручную.</p>`,
  },
  source: {
    title: 'Источник данных',
    sub: 'Официальная информация Nestlé',
    icon: icons.source(22),
    body: () => `<p>Список отозванных партий взят с официальной страницы Nestlé Россия и проверен ${longDate(DATA_CHECKED_AT)}.</p>
      <a class="btn btn--outline btn--block" href="${SOURCE_URL}" target="_blank" rel="noopener">Открыть страницу Nestlé</a>
      <h3>Все отозванные партии</h3>
      ${RECALLED_PRODUCTS.map((p) => {
        const info = productInfo(p);
        return `<div class="lots"><h4>${esc(info.title)} <span>${esc(p.weight)}</span></h4>
          <div class="lots__grid">${p.lots.map((l) => `<a class="lotchip" href="#/check/${l}?view">${l}</a>`).join('')}</div></div>`;
      }).join('')}`,
  },
  blocked: {
    title: 'Мои партии',
    sub: 'Свои заблокированные номера',
    icon: icons.block(22),
    body: () => {
      const items = loadCustomLots();
      const prefill = new URLSearchParams(location.hash.split('?')[1] ?? '').get('lot') ?? '';
      return `<p>Добавьте номера партий, которые не хотите покупать: другой бренд, отзыв, о котором узнали сами, или банка, после которой малышу было плохо. Приложение предупредит при проверке.</p>
      <form class="blocked-form" data-form="blocked" autocomplete="off">
        <label for="blocked-lot" class="label">Номер партии</label>
        <input id="blocked-lot" name="lot" class="input" autocapitalize="characters" spellcheck="false"
          placeholder="например, 51510346AB" maxlength="30" enterkeyhint="next" value="${esc(prefill)}" />
        <label for="blocked-note" class="label">Название или заметка <span class="muted">(необязательно)</span></label>
        <input id="blocked-note" name="note" class="input input--text" maxlength="60" placeholder="например, Малютка 2, 600 г" enterkeyhint="done" />
        <p class="hint" data-blocked-msg role="status"></p>
        <button class="btn btn--primary btn--block" type="submit">${icons.block(22)} Заблокировать партию</button>
      </form>
      ${
        items.length
          ? `<h3>В списке: ${items.length}</h3><ul class="blocked-list">${items
              .map(
                (i) => `<li>
                <a href="#/check/${encodeURIComponent(i.lot)}?view"><b class="mono">${esc(i.lot)}</b><span>${esc(i.note || 'Без заметки')} · ${formatTime(i.ts)}</span></a>
                <button class="icon-btn icon-btn--ink" data-action="blocked-remove" data-lot="${esc(i.lot)}" aria-label="Удалить ${esc(i.lot)}">${icons.trash(20)}</button>
              </li>`,
              )
              .join('')}</ul>`
          : `<p class="small">Список пока пуст.</p>`
      }
      <p class="small">Список хранится только на этом телефоне и попадает в резервную копию.</p>`;
    },
  },
  backup: {
    title: 'Резервная копия',
    sub: 'Сохранить и восстановить историю',
    icon: icons.backup(22),
    body: () => {
      const n = loadHistory().length;
      const m = loadCustomLots().length;
      const last = get(BACKUP_AT_KEY);
      return `<p>История проверок и ваши заблокированные партии хранятся только на этом телефоне. Сохраните копию в файл, чтобы не потерять их при смене телефона или очистке браузера.</p>
      <p class="backup-stat"><b>${n}</b> ${plural(n, 'проверка', 'проверки', 'проверок')} в истории${m ? `<br/><b>${m}</b> ${plural(m, 'своя партия', 'своих партии', 'своих партий')}` : ''}${last ? `<br/><span>Последняя копия: ${formatTime(Number(last))}</span>` : ''}</p>
      <button class="btn btn--primary btn--block" data-action="backup-save" ${n + m ? '' : 'disabled'}>${icons.backup(22)} Сохранить копию</button>
      <label class="btn btn--outline btn--block">Восстановить из файла<input type="file" accept="application/json,.json" data-backup-input hidden /></label>
      <p class="backup-msg" data-backup-msg role="status"></p>
      <p class="small">На iPhone выберите «Сохранить в Файлы» и iCloud Drive: копия будет доступна и на новом телефоне. При восстановлении данные добавляются к текущим, повторы не дублируются.</p>`;
    },
  },
  privacy: {
    title: 'Политика конфиденциальности',
    icon: icons.privacy(22),
    body: () => `<p>Приложение не собирает и не отправляет никаких данных. Изображение с камеры обрабатывается только на вашем телефоне и нигде не сохраняется.</p>
      <p>История проверок хранится в памяти браузера на этом устройстве. Её можно очистить в разделе «История».</p>`,
  },
  terms: {
    title: 'Условия использования',
    icon: icons.terms(22),
    body: () => `<p>Mila — неофициальное приложение, не связанное с Nestlé. Оно сравнивает номер партии с опубликованным Nestlé списком отозванных партий.</p>
      <p>Распознавание номера может ошибаться, поэтому всегда сверяйте номер на экране с номером на банке. Если сомневаетесь, позвоните на горячую линию Nestlé ${HOTLINE}.</p>`,
  },
};

function aboutScreen(): string {
  return page(
    `<h1 class="h2">О приложении</h1>
    <div class="about-head">
      ${logo(84)}
      <h2>Mila</h2>
      <p>Проверяйте детское питание<br/>перед покупкой</p>
      <span class="version">Версия ${VERSION}</span>
    </div>
    <ul class="group">
      ${Object.entries(ABOUT_PAGES)
        .map(
          ([key, p]) => `<li><a href="#/about/${key}">
            <span class="group__icon">${p.icon}</span>
            <span class="group__text"><span>${p.title}</span>${p.sub ? `<small>${p.sub}</small>` : ''}</span>
            ${icons.chevron(18)}</a></li>`,
        )
        .join('')}
    </ul>
    <p class="about-foot">Данные об отзыве обновлены:<br/>${longDate(DATA_CHECKED_AT).replace(' г.', '')}</p>`,
    'about',
  );
}

function aboutPage(key: string): string {
  const p = ABOUT_PAGES[key];
  if (!p) return aboutScreen();
  return page(
    `<header class="navbar">
      <a href="#/about" class="icon-btn icon-btn--ink" aria-label="Назад">${icons.back(24)}</a>
      <h1 class="navbar__title">${p.title}</h1>
    </header>
    <article class="card prose">${p.body()}</article>`,
    'about',
  );
}

// ---------- 10. Offline ----------

function offlineScreen(): string {
  return `<main class="screen screen--offline">
    <div class="offline">
      ${offlineCloud(120)}
      <h1>Нет интернета</h1>
      <p>Проверка возможна в офлайн-режиме.<br/>Данные об отозванных партиях<br/>загружены на устройство.</p>
    </div>
    <div class="stack">
      <button class="btn btn--primary btn--block" data-action="retry">Попробовать ещё раз</button>
      <button class="btn btn--soft btn--block" data-action="offline-continue">Продолжить офлайн</button>
    </div>
  </main>`;
}

// ---------- router ----------

function render(): void {
  const hash = location.hash || '#/';
  const [path, query = ''] = hash.slice(1).split('?');
  const params = new URLSearchParams(query);
  setThemeColor('--bg');

  if (!get(WELCOME_KEY) && path !== '/welcome' && !path.startsWith('/check/')) {
    location.replace('#/welcome');
    return;
  }
  if (!navigator.onLine && !get(OFFLINE_SEEN_KEY, 'session') && path !== '/welcome') {
    app.innerHTML = offlineScreen();
    return;
  }

  if (path === '/welcome') app.innerHTML = welcomeScreen();
  else if (path === '/history') app.innerHTML = historyScreen();
  else if (path === '/session') app.innerHTML = sessionScreen();
  else if (path === '/manual') app.innerHTML = manualScreen(params.get('lot') ?? '');
  else if (path === '/about') app.innerHTML = aboutScreen();
  else if (path.startsWith('/about/')) app.innerHTML = aboutPage(path.slice(7));
  else if (path.startsWith('/check/'))
    app.innerHTML = resultScreen(decodeURIComponent(path.slice(7)), {
      fromOcr: params.has('ocr'),
      save: !params.has('view'),
      exp: params.get('exp') ?? undefined,
      man: params.get('man') ?? undefined,
    });
  else app.innerHTML = homeScreen();

  window.scrollTo(0, 0);
  const input = app.querySelector<HTMLInputElement>('#lot');
  if (input && params.has('lot')) input.focus();
}

function startCamera(): void {
  openCamera((r: ScanResult) => {
    const q = new URLSearchParams({ ocr: '1' });
    if (r.dates.exp) q.set('exp', r.dates.exp);
    if (r.dates.man) q.set('man', r.dates.man);
    // Replace the current entry so "back" from the result goes home, not to the previous can.
    location.hash = `#/check/${encodeURIComponent(r.lots[0])}?${q}`;
  });
}

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  switch (el.dataset.action) {
    case 'start':
      set(WELCOME_KEY, '1');
      go('#/');
      break;
    case 'camera':
      startCamera();
      break;
    case 'edit':
      go(`#/manual?lot=${encodeURIComponent(el.dataset.lot ?? '')}`);
      break;
    case 'clear-history':
      if (confirm('Очистить историю проверок?')) {
        clearHistory();
        render();
      }
      break;
    case 'retry':
      if (navigator.onLine) {
        set(OFFLINE_SEEN_KEY, '1', 'session');
        render();
      } else {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
      break;
    case 'backup-save':
      saveBackup()
        .then((msg) => {
          if (msg) {
            render();
            showBackupMsg(msg, false);
          }
        })
        .catch(() => showBackupMsg('Не удалось сохранить копию.', true));
      break;
    case 'blocked-remove': {
      const lot = el.dataset.lot ?? '';
      if (confirm(`Удалить партию ${lot} из вашего списка?`)) {
        removeCustomLot(lot);
        render();
      }
      break;
    }
    case 'offline-continue':
      set(OFFLINE_SEEN_KEY, '1', 'session');
      render();
      break;
  }
});

function showBackupMsg(text: string, error: boolean): void {
  const el = app.querySelector<HTMLElement>('[data-backup-msg]');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', error);
}

app.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (!input.matches('[data-backup-input]')) return;
  const file = input.files?.[0];
  if (!file) return;
  restoreBackup(file)
    .then((msg) => {
      render();
      showBackupMsg(msg, false);
    })
    .catch((err: Error) => showBackupMsg(err.message || 'Не удалось прочитать файл.', true));
});

app.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  if (form.dataset.form === 'blocked') return submitBlocked(e, form);
  if (form.dataset.form !== 'lot') return;
  e.preventDefault();
  const input = form.querySelector<HTMLInputElement>('#lot')!;
  const lot = normalizeLot(input.value);
  const hint = form.querySelector<HTMLElement>('[data-hint]')!;
  // Own blocked batches may be shorter than Nestlé's.
  if (checkLot(lot).status === 'too-short' || !lot) {
    hint.textContent = lot
      ? `Номер партии состоит из ${LOT_LENGTH} символов, введено ${lot.length}.`
      : 'Введите номер партии с дна банки.';
    hint.classList.add('hint--warn');
    input.focus();
    return;
  }
  input.blur();
  go(`#/check/${encodeURIComponent(lot)}`);
});

function submitBlocked(e: Event, form: HTMLFormElement): void {
  e.preventDefault();
  const lotInput = form.querySelector<HTMLInputElement>('#blocked-lot')!;
  const note = form.querySelector<HTMLInputElement>('#blocked-note')!.value;
  const r = addCustomLot(lotInput.value, note);
  if (!r.ok) {
    const msg = form.querySelector<HTMLElement>('[data-blocked-msg]')!;
    msg.textContent = r.error;
    msg.classList.add('hint--warn');
    lotInput.focus();
    return;
  }
  (document.activeElement as HTMLElement | null)?.blur();
  // Drop a ?lot= prefill so the form comes back empty.
  if (location.hash !== '#/about/blocked') history.replaceState(null, '', '#/about/blocked');
  render();
  const msg = app.querySelector<HTMLElement>('[data-blocked-msg]');
  if (msg) msg.textContent = `Партия ${r.item.lot} добавлена.`;
}

app.addEventListener('input', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.id !== 'lot') return;
  const hint = app.querySelector<HTMLElement>('[data-hint]');
  const n = normalizeLot(input.value).length;
  if (hint) {
    hint.classList.remove('hint--warn');
    hint.textContent = n ? `${n} из ${LOT_LENGTH} символов` : `Номер партии — ${LOT_LENGTH} цифр и букв.`;
  }
});

window.addEventListener('hashchange', render);
// Re-render when the phone switches between light and dark (e.g. automatic at sunset).
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', render);
window.addEventListener('online', render);
window.addEventListener('offline', () => {
  // Only interrupt with the offline screen at start-up, not in the middle of a check.
  set(OFFLINE_SEEN_KEY, '1', 'session');
});
render();
