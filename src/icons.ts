// Inline SVG icons (no external icon font, works offline).
const svg = (body: string, size = 24, extra = '') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  scan: (s?: number) =>
    svg('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>', s),
  history: (s?: number) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', s),
  info: (s?: number) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', s),
  camera: (s?: number) =>
    svg('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>', s),
  close: (s?: number) => svg('<path d="M6 6l12 12M18 6L6 18"/>', s),
  back: (s?: number) => svg('<path d="M15 5l-7 7 7 7"/>', s),
  check: (s?: number) => svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', s, 'stroke-width="3"'),
  alert: (s?: number) => svg('<path d="M12 6v7M12 17h.01"/>', s, 'stroke-width="3"'),
  question: (s?: number) => svg('<path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17h.01"/>', s, 'stroke-width="2.6"'),
  flash: (s?: number) => svg('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>', s),
  image: (s?: number) => svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>', s),
  phone: (s?: number) =>
    svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>', s),
  external: (s?: number) => svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', s),
  chevron: (s?: number) => svg('<path d="M9 6l6 6-6 6"/>', s),
  offline: (s?: number) => svg('<path d="M3 3l18 18M8.5 8.6A5 5 0 0 0 6 13H5.5a3.5 3.5 0 0 0 0 7H17M20.6 18.5A3.5 3.5 0 0 0 18 13h-.3A6 6 0 0 0 10.3 7.2"/>', s),
};

/** App logo: a baby face in a crescent with a heart. */
export function logo(size = 96): string {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="60" cy="60" r="56" fill="var(--logo-bg)"/>
    <circle cx="56" cy="62" r="34" fill="#fff"/>
    <path d="M30 50c4-16 20-26 36-24-8 4-12 12-12 12" fill="none" stroke="var(--primary)" stroke-width="5" stroke-linecap="round"/>
    <circle cx="46" cy="62" r="3.6" fill="#22325a"/>
    <circle cx="64" cy="62" r="3.6" fill="#22325a"/>
    <path d="M47 74c5 5 12 5 17 0" fill="none" stroke="#22325a" stroke-width="3.4" stroke-linecap="round"/>
    <circle cx="40" cy="71" r="4" fill="#ffb3c1" opacity=".8"/>
    <circle cx="71" cy="71" r="4" fill="#ffb3c1" opacity=".8"/>
    <path d="M88 38c-4-7-15-4-13 4 1 5 13 12 13 12s12-7 13-12c2-8-9-11-13-4z" fill="#ff7a93"/>
  </svg>`;
}

/** A formula can; tinted by check status. */
export function can(tone: 'ok' | 'bad' | 'warn' | 'neutral' = 'neutral', size = 56): string {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" class="can can--${tone}">
    <ellipse cx="32" cy="12" rx="20" ry="6" fill="var(--can-top)"/>
    <path d="M12 12v40c0 3.3 9 6 20 6s20-2.7 20-6V12c0 3.3-9 6-20 6s-20-2.7-20-6z" fill="var(--can-body)"/>
    <path d="M12 26c0 3.3 9 6 20 6s20-2.7 20-6v14c0 3.3-9 6-20 6s-20-2.7-20-6z" fill="var(--can-band)"/>
    <text x="32" y="42" text-anchor="middle" font-size="10" font-weight="800" fill="#fff" font-family="system-ui,sans-serif">LOT</text>
  </svg>`;
}

/** Bottom of a can with the batch number highlighted: shows users where to look. */
export function canBottom(): string {
  return `<svg viewBox="0 0 240 150" class="can-bottom" role="img" aria-label="Номер партии на дне банки">
    <ellipse cx="120" cy="75" rx="112" ry="68" fill="var(--surface-2)" stroke="var(--line)" stroke-width="3"/>
    <ellipse cx="120" cy="75" rx="96" ry="56" fill="none" stroke="var(--line)" stroke-width="2"/>
    <g font-family="ui-monospace,Menlo,monospace" font-size="14" fill="var(--muted)" letter-spacing="1">
      <text x="120" y="56" text-anchor="middle">EXP 06.2027</text>
      <text x="120" y="104" text-anchor="middle">12:45</text>
    </g>
    <rect x="44" y="66" width="152" height="26" rx="6" fill="var(--primary-soft)" stroke="var(--primary)" stroke-width="2.5"/>
    <text x="120" y="84.5" text-anchor="middle" font-family="ui-monospace,Menlo,monospace" font-size="16" font-weight="700" fill="var(--primary-ink)" letter-spacing="1.5">51510346AB</text>
  </svg>`;
}
