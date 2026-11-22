import { escapeHtml, raw, type Html } from '../jsx.js';

// The Ledger icon set. Static, trusted SVG markup; the only interpolated values are numbers and
// fixed colours, and those are escaped anyway.
const ICONS = {
  logo: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 22 22" fill="none" aria-hidden="true"><rect x="1" y="1" width="20" height="20" rx="5" fill="#1B1B18"></rect><rect x="5" y="6" width="12" height="2" rx="1" fill="#FFFFFF"></rect><rect x="5" y="10" width="8" height="2" rx="1" fill="#8FA2EA"></rect><rect x="5" y="14" width="5" height="2" rx="1" fill="#FFFFFF"></rect></svg>`,
  edit: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"></path></svg>`,
  trash: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.5h6.6l.7-8.5"></path></svg>`,
  plus: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10"></path></svg>`,
  'check-accent': (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="#2B47C9"></circle><path d="M4.5 7.2l1.7 1.7 3.3-3.6" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
  'check-success': (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="#1F7A4D"></circle><path d="M4.5 7.2l1.7 1.7 3.3-3.6" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
  info: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"></circle><path d="M8 7.5v4M8 5v0"></path></svg>`,
  alert: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="6.5"></circle><path d="M8 4.5v4M8 11v0"></path></svg>`,
  'alert-sm': () => `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="6" cy="6" r="5"></circle><path d="M6 3.5v3M6 8.5v0"></path></svg>`,
  warning: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 1.8l5.6 10H1.4z"></path><path d="M7 5.8v2.6M7 10.2v0"></path></svg>`,
  link: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1"></path></svg>`,
  'link-broken': (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4.5l1-1a2.8 2.8 0 0 1 4 4l-1 1M9 11.5l-1 1a2.8 2.8 0 0 1-4-4l1-1M2.5 2.5l11 11"></path></svg>`,
  copy: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"></rect><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"></path></svg>`,
  chevron: (s: number) => `<svg width="${s}" height="${s}" viewBox="0 0 16 16" fill="none" stroke="#6E6E66" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"></path></svg>`,
  'chevron-down': () => `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="chev"><path d="M4 6l4 4 4-4"></path></svg>`,
  check: () => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#2B47C9" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"></path></svg>`,
  grid: () => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"></rect><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"></rect><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"></rect><rect x="9" y="9" width="4.5" height="4.5" rx="1"></rect></svg>`,
  checklist: () => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 4l1.2 1.2L6 3M2.5 10l1.2 1.2L6 9M8.5 4.5h5M8.5 10.5h5"></path></svg>`,
  logout: () => `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6M10.5 11l3-3-3-3M13.5 8H6.5"></path></svg>`,
  'arrow-right': () => `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"></path></svg>`,
  lock: () => `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1"></rect><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5"></path></svg>`,
  'status-todo': () => `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="#6E6E66" stroke-width="1.5"></circle></svg>`,
  'status-in_progress': () => `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.5" stroke="#2B47C9" stroke-width="1.5"></circle><path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill="#2B47C9"></path></svg>`,
  'status-done': () => `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="6.25" fill="#1F7A4D"></circle><path d="M4.5 7.2l1.7 1.7 3.3-3.6" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`,
} satisfies Record<string, (size: number) => string>;

export type IconName = keyof typeof ICONS | 'step-number';

interface IconProps {
  name: IconName;
  size?: number;
  /** step-number only: the digit and its colour. */
  n?: number;
  color?: string;
}

function stepNumber(n: number, color: string): string {
  const c = escapeHtml(color);
  return `<svg width="22" height="22" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="5.75" stroke="${c}" stroke-width="1.5"></circle><text x="7" y="9.6" text-anchor="middle" font-size="7" font-weight="700" fill="${c}" font-family="Inter, system-ui, sans-serif">${n}</text></svg>`;
}

/** An inline SVG icon. Surrounded by newlines, exactly like the original partial, so spacing next to text is unchanged. */
export function Icon({ name, size = 16, n = 0, color = '#2B47C9' }: IconProps): Html {
  const svg = name === 'step-number' ? stepNumber(n, color) : ICONS[name](size);
  return raw(`\n${svg}\n`);
}
