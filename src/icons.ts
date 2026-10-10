// Inline SVG icons and illustrations (no icon font, works offline).
import type { CanTone, ProductInfo } from './data/products';
import canNanUrl from './assets/can-nan.webp';

const svg = (body: string, size = 24, extra = '') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  scan: (s = 24) =>
    svg('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none"/>', s),
  history: (s = 24) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', s),
  info: (s = 24) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>', s),
  infoFilled: (s = 24) =>
    `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 11v5.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.3" fill="#fff"/></svg>`,
  clockFilled: (s = 24) =>
    `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M12 7v5l3.2 2" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>`,
  camera: (s = 24) =>
    `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true"><path d="M4 7.5h3l1.6-2.4a1.5 1.5 0 0 1 1.2-.6h4.4a1.5 1.5 0 0 1 1.2.6L17 7.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9A1.5 1.5 0 0 1 4 7.5z" fill="currentColor"/><circle cx="12" cy="13.2" r="3.6" fill="none" stroke="var(--primary)" stroke-width="2"/><circle cx="18" cy="10.2" r=".9" fill="var(--primary)"/></svg>`,
  close: (s = 24) => svg('<path d="M6 6l12 12M18 6L6 18"/>', s, 'stroke-width="2.4"'),
  back: (s = 24) => svg('<path d="M15 5l-7 7 7 7"/>', s, 'stroke-width="2.4"'),
  chevron: (s = 18) => svg('<path d="M9 6l6 6-6 6"/>', s),
  check: (s = 24) => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', s, 'stroke-width="3"'),
  bang: (s = 24) => svg('<path d="M12 5.5v8"/><circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none"/>', s, 'stroke-width="3.2"'),
  question: (s = 24) =>
    svg('<path d="M9.2 9.2a2.8 2.8 0 1 1 3.9 2.6c-.7.3-1.1 1-1.1 1.7v.8"/><circle cx="12" cy="17.6" r="1.1" fill="currentColor" stroke="none"/>', s, 'stroke-width="2.6"'),
  flash: (s = 24) => svg('<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>', s),
  image: (s = 24) => svg('<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', s),
  refresh: (s = 16) => svg('<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5"/>', s),
  phone: (s = 18) =>
    svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', s),
  alertCircle: (s = 22) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.4" r="1" fill="currentColor" stroke="none"/>', s),
  // About list icons (outlined, like the mockup)
  how: (s = 22) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5"/><circle cx="12" cy="16.4" r="1" fill="currentColor" stroke="none"/>', s),
  faq: (s = 22) =>
    svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.5v.4"/><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none"/>', s),
  source: (s = 22) => svg('<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><rect x="9.5" y="9" width="5" height="6" rx="2.5"/>', s),
  privacy: (s = 22) => svg('<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6z"/><path d="M10 12.5l1.6 1.6L14.5 11"/>', s),
  terms: (s = 22) => svg('<rect x="5" y="3.5" width="14" height="17" rx="3"/><path d="M12 8v5"/><circle cx="12" cy="16.3" r="1" fill="currentColor" stroke="none"/>', s),
  backup: (s = 22) =>
    svg('<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.5A3.8 3.8 0 0 1 17.5 18"/><path d="M12 12v8M9 15l3-3 3 3"/>', s),
  block: (s = 22) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>', s),
  trash: (s = 20) => svg('<path d="M4.5 7h15M10 7V5h4v2M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>', s),
  list: (s = 22) => svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 12h8M8 15h5"/>', s),
};

/** App logo in the style of the «Кормилка» icon: a milk can with a check mark on a sea-blue tile. */
export const LOGO_SVG_BODY = `
    <rect width="120" height="120" rx="27" fill="#2E6E8E"/>
    <rect x="34" y="22" width="52" height="12" rx="6" fill="#E1EEF4"/>
    <rect x="30" y="30" width="60" height="70" rx="14" fill="#FBF6EA"/>
    <path d="M30 74H90V86a14 14 0 0 1-14 14H44a14 14 0 0 1-14-14Z" fill="#E8DCC0"/>
    <path d="M45 55l10 10 20-21" fill="none" stroke="#2E6E8E" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;

export function logo(size = 96): string {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true" class="logo">${LOGO_SVG_BODY}</svg>`;
}

const TONES: Record<CanTone, [string, string]> = {
  blue: ['#2f6fd0', '#8fb6ef'],
  teal: ['#1f8a8a', '#86cfc9'],
  green: ['#2e9a5c', '#9ad3ac'],
  gold: ['#b58a2b', '#e7cf8c'],
  purple: ['#6b4fb8', '#b9a8ea'],
};

let canSeq = 0;

/** Formula can art. NAN 2 uses the can picture from the mockup; other products get a drawn can in their line colour. */
export function can(product: ProductInfo | null, size = 64): string {
  if (product?.brand === 'NAN' && product.stage === '2') {
    return `<img class="can-img" src="${canNanUrl}" width="${Math.round(size * 0.77)}" height="${size}" alt="" />`;
  }
  const [dark, light] = TONES[product?.tone ?? 'blue'];
  const id = `cg${++canSeq}`;
  const brand = product?.brand ?? '';
  const stage = product?.stage ?? '';
  return `<svg viewBox="0 0 50 64" width="${Math.round(size * 0.78)}" height="${size}" aria-hidden="true" class="can-img">
    <defs>
      <linearGradient id="${id}" x1="0" x2="1">
        <stop offset="0" stop-color="${dark}"/><stop offset=".35" stop-color="${light}"/><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="${dark}"/>
      </linearGradient>
      <linearGradient id="${id}w" x1="0" x2="1">
        <stop offset="0" stop-color="#dfe8f5"/><stop offset=".5" stop-color="#fff"/><stop offset="1" stop-color="#d4deed"/>
      </linearGradient>
    </defs>
    <rect x="4" y="5" width="42" height="56" rx="5" fill="url(#${id}w)"/>
    <rect x="4" y="5" width="42" height="10" rx="4" fill="url(#${id})"/>
    <rect x="4" y="52" width="42" height="9" rx="4" fill="url(#${id})"/>
    <ellipse cx="25" cy="5.5" rx="21" ry="3.2" fill="#c9d4e4"/>
    ${brand ? `<text x="25" y="${stage ? 29 : 36}" text-anchor="middle" font-size="${brand.length > 4 ? 6.5 : 11}" font-weight="800" fill="${dark}" font-family="system-ui,sans-serif">${brand}</text>` : `<circle cx="25" cy="32" r="9" fill="none" stroke="${light}" stroke-width="2"/>`}
    ${stage ? `<text x="25" y="47" text-anchor="middle" font-size="16" font-weight="800" fill="${dark}" font-family="system-ui,sans-serif">${stage}</text>` : ''}
  </svg>`;
}

/** Outline can used on the recognition screen. */
export function canOutline(size = 72): string {
  return `<svg viewBox="0 0 64 72" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round" aria-hidden="true">
    <ellipse cx="32" cy="12" rx="20" ry="6"/>
    <path d="M12 12v46c0 3.3 9 6 20 6s20-2.7 20-6V12"/>
    <path d="M12 20c0 3.3 9 6 20 6s20-2.7 20-6"/>
    <path d="M20 38c0-3 2-5 4-5" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`;
}

/** Cloud with a slash for the offline screen. */
export function offlineCloud(size = 110): string {
  return `<svg viewBox="0 0 120 100" width="${size}" height="${Math.round(size * 0.83)}" fill="none" aria-hidden="true">
    <path d="M32 78h58a20 20 0 0 0 2-40 30 30 0 0 0-57-6A23 23 0 0 0 32 78z" fill="var(--soft)" stroke="var(--muted)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M24 14l74 74" stroke="var(--muted)" stroke-width="4.5" stroke-linecap="round"/>
    <path d="M27 11l74 74" stroke="var(--bg)" stroke-width="3"/>
  </svg>`;
}
