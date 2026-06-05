// Runtime app settings, persisted in localStorage. Connection values fall back
// to Vite env vars / defaults when not set so the app still works out of the box.

export type ThemeId = 'midnight' | 'slate' | 'black' | 'light';

export interface AppSettings {
  haUrl: string;
  haToken: string;
  theme: ThemeId;
  accent: string; // hex color used as the primary accent
  ambientEffects: boolean; // weather backdrop (rain/snow particles, lightning)
  compactSections: boolean; // flow sections into a masonry so short ones sit side-by-side (less wasted vertical space)
  rememberOnServer: boolean; // opt-in: store connection (URL + token) on the server so new devices auto-connect
  weatherEntity: string; // header weather entity; '' = auto-discover the first weather.* entity
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
  ambientEffects: true,
  compactSections: true,
  rememberOnServer: false,
  weatherEntity: '',
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

// ── Opt-in shared connection (stored on the server, shared across devices) ──

// Resolve the API relative to the app's base path so it works behind HA Ingress
// (served under /api/hassio_ingress/<token>/) as well as at the root.
const CONNECTION_ENDPOINT = `${import.meta.env.BASE_URL}connection`.replace(/\/\/+/g, '/');

interface ServerConnection {
  haUrl: string;
  haToken: string;
}

/** Read the shared connection from the server, or null if none is stored. */
export async function fetchServerConnection(): Promise<ServerConnection | null> {
  try {
    const res = await fetch(CONNECTION_ENDPOINT);
    if (!res.ok || res.status === 204) return null;
    const data = (await res.json()) as Partial<ServerConnection>;
    // Require BOTH a URL and a token — an incomplete entry would make a device
    // adopt a connection it can't use (e.g. empty URL → unreachable default host).
    if (
      data &&
      typeof data.haUrl === 'string' &&
      data.haUrl &&
      typeof data.haToken === 'string' &&
      data.haToken
    ) {
      return { haUrl: data.haUrl, haToken: data.haToken };
    }
  } catch {
    /* server connection is optional */
  }
  return null;
}

/** Store the shared connection on the server (opt-in). */
export async function saveServerConnection(haUrl: string, haToken: string): Promise<void> {
  // Never store an incomplete connection — it would poison other devices.
  if (!haUrl || !haToken) return;
  try {
    await fetch(CONNECTION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ haUrl, haToken }),
    });
  } catch {
    /* ignore */
  }
}

/** Remove the shared connection from the server. */
export async function clearServerConnection(): Promise<void> {
  try {
    await fetch(CONNECTION_ENDPOINT, { method: 'DELETE' });
  } catch {
    /* ignore */
  }
}

/**
 * On startup, if this browser doesn't already have a complete connection of its
 * own (URL + token) but the server has a shared one stored, adopt it so the
 * device auto-connects. Returns true if a server connection was applied.
 */
export async function hydrateConnectionFromServer(): Promise<boolean> {
  // "Complete" means both a URL and a token (from settings or env). A device
  // missing either (e.g. a tablet with a token but no URL) should adopt the
  // shared connection rather than fall back to an unreachable default host.
  if (getHaUrl() && getHaToken()) return false;
  const server = await fetchServerConnection();
  if (!server) return false;
  const local = getSettings();
  cache = { ...local, haUrl: server.haUrl, haToken: server.haToken, rememberOnServer: true };
  return true;
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
