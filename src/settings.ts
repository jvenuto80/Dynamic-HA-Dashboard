// Runtime app settings, persisted in localStorage. Connection values fall back
// to Vite env vars / defaults when not set so the app still works out of the box.

export type ThemeId = 'midnight' | 'slate' | 'black' | 'light';

export interface AppSettings {
  haUrl: string;
  haToken: string;
  theme: ThemeId;
  accent: string; // hex color used as the primary accent
}

const STORAGE_KEY = 'ha-dashboard-settings';

export const DEFAULT_ACCENT = '#ff6b35';

const ENV_URL = (import.meta.env.VITE_HA_URL as string) || 'http://homeassistant.local:8123';
const ENV_TOKEN = (import.meta.env.VITE_HA_TOKEN as string) || '';

export const THEMES: { id: ThemeId; name: string }[] = [
  { id: 'midnight', name: 'Midnight' },
  { id: 'slate', name: 'Slate' },
  { id: 'black', name: 'OLED Black' },
  { id: 'light', name: 'Light' },
];

export const ACCENT_SWATCHES = [
  '#ff6b35', // orange (default)
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // green
  '#a855f7', // purple
  '#ec4899', // pink
  '#f59e0b', // amber
  '#ef4444', // red
];

const DEFAULTS: AppSettings = {
  haUrl: '',
  haToken: '',
  theme: 'midnight',
  accent: DEFAULT_ACCENT,
};

let cache: AppSettings | null = null;

export function getSettings(): AppSettings {
  if (cache) return cache;
  let loaded: AppSettings;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    loaded = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    loaded = { ...DEFAULTS };
  }
  cache = loaded;
  return loaded;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / privacy-mode failures */
  }
  applyTheme(next);
  return next;
}

/** Effective Home Assistant URL: saved setting → env var → default. */
export function getHaUrl(): string {
  return getSettings().haUrl || ENV_URL;
}

/** Effective long-lived access token: saved setting → env var → empty. */
export function getHaToken(): string {
  return getSettings().haToken || ENV_TOKEN;
}

/** Apply theme + accent to the document root via data attribute and CSS vars. */
export function applyTheme(s: AppSettings = getSettings()): void {
  const root = document.documentElement;
  root.setAttribute('data-theme', s.theme);
  root.style.setProperty('--accent-orange', s.accent);
  root.style.setProperty('--accent-primary', s.accent);
  root.style.setProperty('--accent-rgb', hexToRgbTriplet(s.accent));
  root.style.setProperty('--accent-glow', hexToRgba(s.accent, 0.15));
  root.style.setProperty('--accent-soft', hexToRgba(s.accent, 0.15));
}

function hexToRgbTriplet(hex: string): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
