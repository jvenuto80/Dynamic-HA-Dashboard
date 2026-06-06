// Smart value formatting for dates, timestamps and durations.
//
// Home Assistant hands us values as raw strings: an "uptime" sensor is usually a
// boot *timestamp* ("2026-06-04T13:23:00+00:00"), a "duration" sensor is a number
// of seconds, etc. Showing those raw is ugly and timezone-ambiguous. This module:
//   • renders timestamps in the *browser's* timezone using a user-chosen pattern,
//   • renders durations as "3d 4h 23m 24s" or "3:04:23:24",
//   • auto-detects which is which (and treats an uptime/boot timestamp as the
//     elapsed time since boot — i.e. the actual uptime).
//
// The pattern + duration style are global app settings; individual NOC pills can
// override the *mode* (absolute date vs. elapsed vs. raw) per field.

import { getSettings } from '../settings';
import type { NocValueFormat } from '../types';

export type DateFormatId = 'auto' | 'mdy12' | 'mdy24' | 'dmy12' | 'dmy24' | 'ymd';
export type DurationStyle = 'compact' | 'colon' | 'long';

/** Date-format choices for the Settings dropdown (sample = 4 Jun 2026, 1:23:09 PM local). */
export const DATE_FORMATS: { id: DateFormatId; label: string; sample: string }[] = [
  { id: 'mdy12', label: 'MM/DD/YY · 12-hour', sample: '06/04/26 01:23:09 PM' },
  { id: 'mdy24', label: 'MM/DD/YY · 24-hour', sample: '06/04/26 13:23:09' },
  { id: 'dmy12', label: 'DD/MM/YY · 12-hour', sample: '04/06/26 01:23:09 PM' },
  { id: 'dmy24', label: 'DD/MM/YY · 24-hour', sample: '04/06/26 13:23:09' },
  { id: 'ymd', label: 'YYYY-MM-DD · 24-hour', sample: '2026-06-04 13:23' },
  { id: 'auto', label: 'Match this device', sample: 'system locale' },
];

export const DURATION_STYLES: { id: DurationStyle; label: string; sample: string }[] = [
  { id: 'compact', label: 'Compact', sample: '3d 4h 23m' },
  { id: 'colon', label: 'Clock', sample: '3:04:23:24' },
  { id: 'long', label: 'Words', sample: '3 days 4 hrs' },
];

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

// All getters below use the Date object's *local* accessors, so everything is
// rendered in the browser's own timezone with no manual offset math.
function dateStr(d: Date, fmt: DateFormatId): string {
  const y2 = pad(d.getFullYear() % 100);
  const mo = pad(d.getMonth() + 1);
  const da = pad(d.getDate());
  switch (fmt) {
    case 'ymd':
      return `${d.getFullYear()}-${mo}-${da}`;
    case 'dmy12':
    case 'dmy24':
      return `${da}/${mo}/${y2}`;
    default:
      return `${mo}/${da}/${y2}`;
  }
}

function timeStr(d: Date, fmt: DateFormatId): string {
  const h24 = d.getHours();
  const mi = pad(d.getMinutes());
  const se = pad(d.getSeconds());
  if (fmt === 'ymd') return `${pad(h24)}:${mi}`;
  if (fmt === 'mdy24' || fmt === 'dmy24') return `${pad(h24)}:${mi}:${se}`;
  const ap = h24 < 12 ? 'AM' : 'PM';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${pad(h12)}:${mi}:${se} ${ap}`;
}

/** Format an absolute Date in the browser timezone using the chosen pattern. */
export function formatDateTime(
  d: Date,
  fmt: DateFormatId,
  kind: 'datetime' | 'date' | 'time' = 'datetime',
): string {
  if (fmt === 'auto') {
    if (kind === 'date') return d.toLocaleDateString();
    if (kind === 'time') return d.toLocaleTimeString();
    return d.toLocaleString();
  }
  if (kind === 'date') return dateStr(d, fmt);
  if (kind === 'time') return timeStr(d, fmt);
  return `${dateStr(d, fmt)} ${timeStr(d, fmt)}`;
}

/** Format a span of seconds as "3d 4h 23m 24s" / "3:04:23:24" / words. */
export function formatDuration(
  totalSeconds: number,
  style: DurationStyle,
  maxUnits = 4,
): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (style === 'colon') {
    const core = `${pad(h)}:${pad(m)}:${pad(sec)}`;
    return d > 0 ? `${d}:${core}` : core;
  }

  const units: [number, string, string][] = [
    [d, 'd', 'day'],
    [h, 'h', 'hr'],
    [m, 'm', 'min'],
    [sec, 's', 'sec'],
  ];
  const first = units.findIndex((u) => u[0] > 0);
  if (first === -1) return style === 'long' ? '0 sec' : '0s';
  const slice = units.slice(first, first + maxUnits);
  while (slice.length > 1 && slice[slice.length - 1][0] === 0) slice.pop();
  return style === 'long'
    ? slice.map(([v, , l]) => `${v} ${l}${v !== 1 ? 's' : ''}`).join(' ')
    : slice.map(([v, sh]) => `${v}${sh}`).join(' ');
}

const DUR_UNITS: Record<string, number> = {
  s: 1, sec: 1, secs: 1, second: 1, seconds: 1,
  min: 60, mins: 60, minute: 60, minutes: 60,
  h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
  d: 86400, day: 86400, days: 86400,
};

interface MiniEntity {
  state?: string;
  entity_id?: string;
  attributes?: Record<string, unknown>;
}

/** Parse a state into a Date if it is (or declares itself) a timestamp. */
function parseTimestamp(e: MiniEntity): Date | null {
  const raw = e.state;
  if (!raw) return null;
  const isTs =
    e.attributes?.device_class === 'timestamp' ||
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(raw);
  if (!isTs) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parse a numeric duration state into seconds, honoring its unit. */
function parseDurationSeconds(e: MiniEntity): number | null {
  const n = Number(e.state);
  if (!Number.isFinite(n)) return null;
  const unit = String(e.attributes?.unit_of_measurement ?? '').toLowerCase();
  if (e.attributes?.device_class === 'duration') return n * (DUR_UNITS[unit] ?? 1);
  if (unit in DUR_UNITS) return n * DUR_UNITS[unit];
  return null;
}

function looksLikeUptime(e: MiniEntity): boolean {
  const hint = `${e.attributes?.friendly_name ?? ''} ${e.entity_id ?? ''}`.toLowerCase();
  return /uptime|\bboot|last.?boot|\bsince\b|started|powered.?on/.test(hint);
}

/**
 * Render an entity's state intelligently.
 *
 * `mode` (per-field override): 'auto' detects the value's nature; an uptime/boot
 * *timestamp* becomes elapsed time (the real uptime). 'datetime'/'date'/'time'
 * force absolute formatting; 'elapsed' forces "time since"; 'duration' forces a
 * span; 'raw' leaves the state untouched. Returns null when the value isn't a
 * date/duration so callers can fall back to their normal formatting.
 */
export function smartFormatState(
  e: MiniEntity | undefined,
  mode: NocValueFormat = 'auto',
  opts: { isUptimeField?: boolean } = {},
): string | null {
  if (!e || e.state === undefined || e.state === null) return null;
  if (mode === 'raw') return e.state;

  const s = getSettings();
  const ts = parseTimestamp(e);
  const durSecs = parseDurationSeconds(e);
  const elapsed = (d: Date) => formatDuration((Date.now() - d.getTime()) / 1000, s.durationStyle, 2);

  switch (mode) {
    case 'date':
    case 'time':
    case 'datetime':
      return ts ? formatDateTime(ts, s.dateFormat, mode) : null;
    case 'elapsed':
      if (ts) return elapsed(ts);
      if (durSecs != null) return formatDuration(durSecs, s.durationStyle);
      return null;
    case 'duration':
      if (durSecs != null) return formatDuration(durSecs, s.durationStyle);
      if (ts) return elapsed(ts);
      return null;
    default: {
      // auto
      if (ts) {
        return opts.isUptimeField || looksLikeUptime(e)
          ? elapsed(ts)
          : formatDateTime(ts, s.dateFormat);
      }
      if (durSecs != null) return formatDuration(durSecs, s.durationStyle);
      return null;
    }
  }
}
