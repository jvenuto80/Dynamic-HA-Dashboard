import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import type { NocMetric, NocNode, NocPort, NocPortSpeed } from '../types';
import { smartFormatState } from './format';

export type NocStatus = 'ok' | 'warn' | 'crit' | 'unknown' | 'info';

/** States that mean a binary/container entity is healthy / running. */
const RUNNING_STATES = new Set(['on', 'running', 'home', 'active', 'connected', 'ok']);
/** States that mean an entity is explicitly in a bad/problem state. */
const PROBLEM_STATES = new Set(['off', 'unavailable', 'unknown', 'problem', 'stopped', 'not_running', 'dead', 'exited']);

/** Pull a numeric value out of an entity state (e.g. "63" or "12.4 ms"). */
export function numericState(e?: HassEntity): number | undefined {
  if (!e) return undefined;
  const n = parseFloat(e.state);
  return Number.isFinite(n) ? n : undefined;
}

/** A metric's unit: explicit override, else the entity's unit_of_measurement. */
export function metricUnit(metric: NocMetric, e?: HassEntity): string {
  if (metric.unit !== undefined) return metric.unit;
  return (e?.attributes?.unit_of_measurement as string | undefined) ?? '';
}

/** Evaluate a metric's status against its warn/crit thresholds. */
export function metricStatus(metric: NocMetric, value: number | undefined): NocStatus {
  if (value === undefined) return 'unknown';
  // Informational metrics (e.g. an NVR's continuous-recording disk that's meant
  // to stay full) display a gauge but never raise an alert.
  if (metric.informational) return 'info';
  const higherWorse = metric.higherIsWorse !== false;
  const hit = (t?: number) => {
    if (t === undefined) return false;
    return higherWorse ? value >= t : value <= t;
  };
  if (hit(metric.crit)) return 'crit';
  if (hit(metric.warn)) return 'warn';
  return 'ok';
}

/** The bar fill fraction (0–1) for a metric, clamped. */
export function metricFraction(metric: NocMetric, value: number | undefined): number {
  if (value === undefined) return 0;
  const max = metric.max ?? 100;
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/** True when a container/binary entity is considered "running/up". */
export function isUp(e?: HassEntity): boolean {
  if (!e) return false;
  const s = e.state.toLowerCase();
  if (RUNNING_STATES.has(s)) return true;
  if (PROBLEM_STATES.has(s)) return false;
  // Fallback: anything non-empty that isn't a known problem reads as up.
  return s !== '';
}

const ORDER: Record<NocStatus, number> = { ok: 0, info: 0, unknown: 1, warn: 2, crit: 3 };
export function worst(a: NocStatus, b: NocStatus): NocStatus {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/** How many watched containers are down on a node (0 when none configured). */
export function dockerDownCount(node: NocNode, entities: HassEntities): number {
  if (!node.dockerWatch?.length) return 0;
  return node.dockerWatch.filter((id) => !isUp(entities[id])).length;
}

/** Inspect a node's statusEntity for keyword-based alerts (e.g. a UPS's NUT
 *  status flags). Returns the alert level + the raw state text, or null. When
 *  no keywords are configured this returns null (callers fall back to isUp). */
export function statusAlert(
  node: NocNode,
  entities: HassEntities,
): { level: 'warn' | 'crit'; text: string } | null {
  if (!node.statusEntity) return null;
  const e = entities[node.statusEntity];
  if (!e) return null;
  const low = e.state.toLowerCase();
  for (const k of node.statusCrit ?? []) {
    if (k && low.includes(k.toLowerCase())) return { level: 'crit', text: e.state };
  }
  for (const k of node.statusWarn ?? []) {
    if (k && low.includes(k.toLowerCase())) return { level: 'warn', text: e.state };
  }
  return null;
}

/** Roll a node's overall status up from its metrics, status entity and Docker watch. */
export function nodeStatus(node: NocNode, entities: HassEntities): NocStatus {
  let status: NocStatus = 'ok';
  let anyKnown = false;
  for (const m of node.metrics) {
    const s = metricStatus(m, numericState(entities[m.entity_id]));
    if (s !== 'unknown') anyKnown = true;
    status = worst(status, s === 'unknown' ? 'ok' : s);
  }
  if (node.statusEntity) {
    const e = entities[node.statusEntity];
    if (e) {
      anyKnown = true;
      const hasKeywords = (node.statusCrit?.length ?? 0) + (node.statusWarn?.length ?? 0) > 0;
      if (hasKeywords) {
        const a = statusAlert(node, entities);
        if (a) status = worst(status, a.level);
      } else if (!isUp(e)) {
        status = worst(status, 'crit');
      }
    }
  }
  if (dockerDownCount(node, entities) > 0) {
    anyKnown = true;
    status = worst(status, 'crit');
  }
  return anyKnown ? status : 'unknown';
}

/** Format a metric value with its unit for display. */
export function formatMetric(value: number | undefined, unit: string): string {
  if (value === undefined) return '—';
  const rounded = Math.abs(value) >= 100 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return unit ? `${rounded} ${unit}` : `${rounded}`;
}

/** Friendly name for an entity, falling back to its id. */
export function entityName(entities: HassEntities, id?: string): string {
  if (!id) return '';
  const e = entities[id];
  return String(e?.attributes?.friendly_name ?? id);
}

// ── Auto-detect: build NOC nodes from existing sensor entities ──
// Grouping is heuristic (HA gives us no device registry here) so results are
// always presented as editable suggestions, never silently committed.

const ACRONYMS: Record<string, string> = {
  udm: 'UDM', usw: 'USW', poe: 'PoE', ups: 'UPS', se: 'SE', unvr: 'UNVR', pi: 'Pi', nvr: 'NVR',
};

interface SuffixMeta {
  label: string;
  max?: number;
  warn?: number;
  crit?: number;
  unit?: string;
  higherIsWorse?: boolean;
  temp?: boolean;
}

/** Metric suffixes, longest-first, mapped to a label + sensible thresholds. */
const METRIC_SUFFIXES: [string, SuffixMeta][] = [
  ['cpu_temperature', { label: 'CPU Temp', max: 90, warn: 70, crit: 85, unit: '°C', temp: true }],
  ['cpu_utilization', { label: 'CPU', max: 100, warn: 80, crit: 95, unit: '%' }],
  ['memory_utilization', { label: 'Memory', max: 100, warn: 85, crit: 95, unit: '%' }],
  ['storage_utilization', { label: 'Storage', max: 100, warn: 80, crit: 92, unit: '%' }],
  ['array_used_space', { label: 'Array Used', max: 100, warn: 80, crit: 92, unit: '%' }],
  ['recording_capacity_days', { label: 'Recording', unit: 'days' }],
  ['battery_runtime', { label: 'Runtime', max: 120, warn: 15, crit: 5, unit: 'min', higherIsWorse: false }],
  ['cpu_usage', { label: 'CPU', max: 100, warn: 80, crit: 95, unit: '%' }],
  ['memory_usage', { label: 'Memory', max: 100, warn: 85, crit: 95, unit: '%' }],
  ['used_space', { label: 'Storage', max: 100, warn: 80, crit: 92, unit: '%' }],
  ['temperature', { label: 'Temp', max: 90, warn: 70, crit: 85, unit: '°C', temp: true }],
  ['utilization', { label: 'Utilization', max: 100, warn: 80, crit: 95, unit: '%' }],
  ['storage', { label: 'Storage', max: 100, warn: 80, crit: 92, unit: '%' }],
  ['runtime', { label: 'Runtime', max: 120, warn: 15, crit: 5, unit: 'min', higherIsWorse: false }],
  ['battery', { label: 'Battery', max: 100, warn: 50, crit: 20, unit: '%', higherIsWorse: false }],
  ['load', { label: 'Load', max: 100, warn: 70, crit: 90, unit: '%' }],
  ['temp', { label: 'Temp', max: 90, warn: 70, crit: 85, unit: '°C', temp: true }],
  ['cpu', { label: 'CPU', max: 100, warn: 80, crit: 95, unit: '%' }],
  ['memory', { label: 'Memory', max: 100, warn: 85, crit: 95, unit: '%' }],
];

/** Collapse adjacent duplicate tokens and fold a fully-doubled prefix
 *  (e.g. ["udm","se","udm","se"] → ["udm","se"]). */
function collapseTokens(tokens: string[]): string[] {
  let out: string[] = [];
  for (const t of tokens) if (out[out.length - 1] !== t) out.push(t);
  if (out.length % 2 === 0) {
    const h = out.length / 2;
    if (out.slice(0, h).join('_') === out.slice(h).join('_')) out = out.slice(0, h);
  }
  return out;
}

function prettifyKey(key: string): string {
  return collapseTokens(key.split('_').filter(Boolean))
    .map((t) => ACRONYMS[t] ?? (/^\d+$/.test(t) ? t : t[0].toUpperCase() + t.slice(1)))
    .join(' ');
}

const ICON_BY_HINT: [RegExp, string, string][] = [
  [/udm|gateway|router|firewall/, 'mdi-shield-outline', '#3b82f6'],
  [/usw|switch/, 'mdi-switch', '#06b6d4'],
  [/unvr|nvr|protect|camera/, 'mdi-cctv', '#a855f7'],
  [/ups|battery|power/, 'mdi-battery-charging', '#f59e0b'],
  [/tower|unraid|nas|server|synology/, 'mdi-server', '#10b981'],
];

function iconAccentFor(key: string): { icon: string; accent: string } {
  for (const [re, icon, accent] of ICON_BY_HINT) if (re.test(key)) return { icon, accent };
  return { icon: 'mdi-server', accent: '#3b82f6' };
}

export interface NocSuggestion {
  nodes: NocNode[];
  wanLatency: string[];
}

/** Inspect the live entities and propose a NOC layout: one node per detected
 *  device with thresholded metrics, plus any WAN-latency sensors for the banner.
 *  Always returned as editable suggestions. */
export function suggestNocNodes(entities: HassEntities): NocSuggestion {
  const groups = new Map<string, { metrics: NocMetric[]; temp?: string }>();
  const wanLatency: string[] = [];
  let seq = 0;

  const sensorIds = Object.keys(entities)
    .filter((id) => id.startsWith('sensor.'))
    .sort();

  for (const id of sensorIds) {
    const obj = id.split('.')[1].replace(/_\d+$/, '');
    if (/(^|_)wan_latency$|(^|_)latency$/.test(obj)) {
      wanLatency.push(id);
      continue;
    }
    let found: { suf: string; meta: SuffixMeta } | null = null;
    for (const [suf, meta] of METRIC_SUFFIXES) {
      if (obj === suf || obj.endsWith('_' + suf)) {
        found = { suf, meta };
        break;
      }
    }
    if (!found) continue;
    const key = collapseTokens(obj.slice(0, obj.length - found.suf.length).replace(/_$/, '').split('_').filter(Boolean)).join('_');
    if (!key) continue;
    const grp = groups.get(key) ?? { metrics: [] };
    if (found.meta.temp && !grp.temp) {
      grp.temp = id;
    } else {
      grp.metrics.push({
        id: `m-sug-${seq++}`,
        entity_id: id,
        label: found.meta.label,
        unit: found.meta.unit,
        max: found.meta.max,
        warn: found.meta.warn,
        crit: found.meta.crit,
        higherIsWorse: found.meta.higherIsWorse,
        primary: grp.metrics.filter((m) => m.primary).length < 3,
      });
    }
    groups.set(key, grp);
  }

  const nodes: NocNode[] = [...groups.entries()].map(([key, grp]) => {
    const { icon, accent } = iconAccentFor(key);
    return {
      id: `node-sug-${key}`,
      name: prettifyKey(key),
      icon,
      accent,
      metrics: grp.metrics,
      tempEntity: grp.temp,
    };
  });

  return { nodes, wanLatency };
}


/** Slugify a node name for entity-id matching (e.g. "Tower" → "tower"). */
export function nodeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Find candidate Docker-container entities that are currently running.
 *  Containers surface as switch.* / binary_sensor.* in HA; we match those that
 *  are on/running and whose id or name relates to the node (by `hint` slug).
 *  When `hint` is empty, every running switch/binary_sensor is a candidate.
 *  Results are suggestions the user can prune — never auto-committed. */
export function runningContainers(entities: HassEntities, hint: string): string[] {
  const slug = hint.trim();
  return Object.values(entities)
    .filter((e) => {
      const domain = e.entity_id.split('.')[0];
      if (domain !== 'switch' && domain !== 'binary_sensor') return false;
      if (!isUp(e)) return false;
      if (!slug) return true;
      const obj = e.entity_id.split('.')[1];
      const name = String(e.attributes?.friendly_name ?? '').toLowerCase();
      return obj.includes(slug) || name.includes(slug.replace(/_/g, ' '));
    })
    .map((e) => e.entity_id)
    .sort();
}

/** Render a user-defined footer pill's text from its entity + options. */
export function formatPill(pill: import('../types').NocPill, entities: HassEntities): string {
  const e = entities[pill.entity_id];
  if (!e) return '—';
  // Dates/durations (e.g. a "last seen" timestamp or an uptime counter) render
  // via the smart formatter; everything else keeps the numeric/unit treatment.
  const smart = smartFormatState(e, pill.format ?? 'auto');
  const num = numericState(e);
  const unit = pill.unit ?? (e.attributes?.unit_of_measurement as string | undefined) ?? '';
  const value = smart ?? (num !== undefined ? formatMetric(num, unit) : e.state);
  const label = pill.label ?? '';
  if (!label) return value;
  return pill.prefix ? `${label} ${value}` : `${value} ${label}`;
}

/** Human label + ordering for each port speed/state class (UniFi legend). */
export const PORT_SPEED_META: Record<NocPortSpeed, { label: string; short: string }> = {
  fe: { label: 'Fast Ethernet (100M)', short: 'FE' },
  gbe: { label: 'Gigabit (1G)', short: 'GbE' },
  '2.5gbe': { label: '2.5 Gigabit', short: '2.5G' },
  '5gbe': { label: '5 Gigabit', short: '5G' },
  '10gbe': { label: '10 Gigabit', short: '10G' },
  sfp: { label: 'SFP', short: 'SFP' },
  'sfp+': { label: 'SFP+', short: 'SFP+' },
  disconnected: { label: 'Disconnected', short: 'Down' },
  disabled: { label: 'Disabled', short: 'Off' },
};

/** Map a link rate in Mbps to a speed class. */
export function speedClassFromMbps(mbps: number): NocPortSpeed {
  if (mbps <= 0) return 'disconnected';
  if (mbps < 1000) return 'fe';
  if (mbps < 2500) return 'gbe';
  if (mbps < 5000) return '2.5gbe';
  if (mbps < 10000) return '5gbe';
  return '10gbe';
}

/** The effective state of a port: connectivity overrides speed, a live Mbps
 *  sensor overrides the manual class, otherwise the manual class is used. */
export function portSpeedClass(port: NocPort, entities: HassEntities): NocPortSpeed {
  // An explicit connectivity entity wins: an "off"/unavailable link is down.
  if (port.linkEntity) {
    const e = entities[port.linkEntity];
    if (e && !isUp(e)) return 'disconnected';
  }
  // A bound speed sensor drives the color live (0 / unavailable = disconnected).
  if (port.speedEntity) {
    const e = entities[port.speedEntity];
    const n = numericState(e);
    if (n !== undefined) return speedClassFromMbps(n);
    if (e && !isUp(e)) return 'disconnected';
  }
  return port.speed ?? 'disconnected';
}

/** Whether a port's PoE is currently delivering power (its switch is on). */
export function portPoeOn(port: NocPort, entities: HassEntities): boolean | undefined {
  if (!port.poeEntity) return undefined;
  const e = entities[port.poeEntity];
  if (!e) return undefined;
  return isUp(e);
}

/** Whether a port is an SFP/SFP+ uplink slot — based on its *configured* speed
 *  class (a disconnected SFP still groups with the SFP cage). Drives the visual
 *  one-port gap between the RJ45 bank and the SFP bank, like a real switch. */
export function isSfpPort(port: NocPort): boolean {
  return port.speed === 'sfp' || port.speed === 'sfp+';
}

/** The friendly-name suffixes UniFi appends per port metric, longest first so
 *  "poe power" is matched before "poe". */
const PORT_FN_SUFFIXES: { suffix: string; kind: 'speed' | 'poePower' | 'cycle' | 'poe' }[] = [
  { suffix: ' link speed', kind: 'speed' },
  { suffix: ' poe power', kind: 'poePower' },
  { suffix: ' power cycle', kind: 'cycle' },
  { suffix: ' poe', kind: 'poe' },
];

interface PortGroup {
  identity: string;
  physNum?: number;
  speedEntity?: string;
  speedState?: number;
  cycleEntity?: string;
  poeSwitch?: string;
  poeCapable?: boolean;
}

/** Inspect the live entities and propose the full set of switch ports for a
 *  node — every physical port, connected or not, plus SFP cages.
 *
 *  Home Assistant's UniFi integration names port entities
 *  `<device> <port identity> <metric>` (e.g. "USW Pro Max 16 PoE  Garage AP
 *  link speed"). The identity is either a connected client's name or "Port N".
 *  Crucially the same physical port can surface as both a client-named and a
 *  port-numbered entity, so we group by the friendly-name identity (not the
 *  entity id) to avoid duplicates, recover the physical port number from any
 *  member entity id, read the live link speed, and bind the per-port
 *  power-cycle button + PoE switch. Disconnected ports (no entities) are padded
 *  in up to the switch's port count, which we parse from its model name.
 *  Everything returned is an editable suggestion, never auto-committed. */
export function suggestPorts(entities: HassEntities, hint: string): NocPort[] {
  const slug = hint.trim();
  const matched: { id: string; domain: string; ident: string; kind: 'speed' | 'poePower' | 'cycle' | 'poe'; state: number | undefined }[] = [];

  for (const e of Object.values(entities)) {
    const [domain, obj] = e.entity_id.split('.');
    if (!obj) continue;
    const fn = String(e.attributes?.friendly_name ?? '');
    if (!fn) continue;
    if (slug && !obj.startsWith(slug) && !fn.toLowerCase().startsWith(slug.replace(/_/g, ' '))) continue;
    const low = fn.toLowerCase();
    const hit = PORT_FN_SUFFIXES.find((s) => low.endsWith(s.suffix));
    if (!hit) continue;
    // Require the matching domain so unrelated entities that merely *end* in
    // "poe" (e.g. a device_tracker named "…16 PoE") don't masquerade as ports.
    const okDomain =
      (hit.kind === 'speed' && domain === 'sensor') ||
      (hit.kind === 'poePower' && domain === 'sensor') ||
      (hit.kind === 'cycle' && domain === 'button') ||
      (hit.kind === 'poe' && domain === 'switch');
    if (!okDomain) continue;
    matched.push({ id: e.entity_id, domain, ident: fn.slice(0, fn.length - hit.suffix.length), kind: hit.kind, state: numericState(e) });
  }
  if (!matched.length) return [];

  // Device-name prefix = the longest common leading words across identities, so
  // the trailing per-port identity (client name / "Port N") is left over.
  const wordLists = matched.map((m) => m.ident.trim().split(/\s+/));
  const devWords: string[] = [];
  const minLen = Math.min(...wordLists.map((w) => w.length));
  for (let i = 0; i < minLen; i++) {
    const w = wordLists[0][i];
    if (wordLists.every((list) => list[i] === w)) devWords.push(w);
    else break;
  }
  // On all-numbered switches every identity is "… Port N", so "Port" leaks into
  // the common prefix; drop it so the identity stays "Port N" (→ numbered).
  while (devWords.length && /^ports?$/i.test(devWords[devWords.length - 1])) devWords.pop();
  const devLen = devWords.join(' ').length;
  const deviceName = devWords.join(' ');

  // Parse the switch's port count from its model name (USW Pro Max 16, US-8…).
  const countMatch = deviceName.match(/\b(4|8|10|16|24|48|52)\b/);
  const portCount = countMatch ? parseInt(countMatch[1], 10) : undefined;

  const groups = new Map<string, PortGroup>();
  for (const m of matched) {
    const identity = m.ident.slice(devLen).trim();
    if (!identity) continue; // guards the bare-device phantom row
    const g = groups.get(identity) ?? { identity };
    const numM = m.id.match(/_port_(\d+)(?:_|$)/);
    if (numM) g.physNum ??= parseInt(numM[1], 10);
    if (m.kind === 'speed') {
      g.speedEntity ??= m.id;
      if (m.state !== undefined) g.speedState = m.state;
    } else if (m.kind === 'cycle') g.cycleEntity ??= m.id;
    else if (m.kind === 'poe') g.poeSwitch ??= m.id;
    else if (m.kind === 'poePower') g.poeCapable = true;
    if (m.kind === 'cycle' || m.kind === 'poe') g.poeCapable = true;
    groups.set(identity, g);
  }

  const mkPort = (g: PortGroup, id: string, num: string): NocPort => {
    const isSfp = /sfp/i.test(g.identity);
    let speed: NocPortSpeed;
    if (isSfp) speed = /\+/.test(g.identity) || (g.speedState ?? 0) >= 10000 ? 'sfp+' : 'sfp';
    else if (g.speedState !== undefined) speed = speedClassFromMbps(g.speedState);
    else speed = 'disconnected';
    const port: NocPort = { id, num, speed };
    // Use the client name as the port label unless it's just "Port N" or the
    // bare port number (redundant with the cell's own number).
    if (g.identity && !/^port\s*\d+$/i.test(g.identity) && g.identity !== num && !isSfp) port.client = g.identity;
    if (g.speedEntity) port.speedEntity = g.speedEntity;
    if (g.cycleEntity) port.poeCycleEntity = g.cycleEntity;
    if (g.poeSwitch) port.poeEntity = g.poeSwitch;
    if (g.poeCapable) port.poe = 'poe+';
    return port;
  };

  const all = [...groups.values()];
  const sfpGroups = all.filter((g) => /sfp/i.test(g.identity)).sort((a, b) => a.identity.localeCompare(b.identity));
  const rjGroups = all.filter((g) => !/sfp/i.test(g.identity));

  // Lay RJ45 ports onto a 1..portCount faceplate: numbered ports at their slot,
  // unknown-number (client-named) active ports into the lowest free slots, and
  // any remaining slots as disconnected placeholders so every port is shown.
  const stamp = Date.now().toString(36);
  const slots = portCount ?? Math.max(0, ...rjGroups.map((g) => g.physNum ?? 0), rjGroups.length);
  const placed = new Array<NocPort | null>(slots).fill(null);
  const unplaced: PortGroup[] = [];
  for (const g of rjGroups) {
    if (g.physNum && g.physNum >= 1 && g.physNum <= slots && !placed[g.physNum - 1]) {
      placed[g.physNum - 1] = mkPort(g, `port-${stamp}-${g.physNum}`, String(g.physNum));
    } else unplaced.push(g);
  }
  for (let i = 0; i < slots && unplaced.length; i++) {
    if (placed[i]) continue;
    const g = unplaced.shift()!;
    placed[i] = mkPort(g, `port-${stamp}-s${i + 1}`, String(i + 1));
  }
  // Any client-named ports beyond the faceplate count still get shown.
  for (const g of unplaced) placed.push(mkPort(g, `port-${stamp}-x${placed.length}`, String(placed.length + 1)));
  for (let i = 0; i < placed.length; i++) {
    if (!placed[i]) placed[i] = { id: `port-${stamp}-e${i + 1}`, num: String(i + 1), speed: 'disconnected' };
  }

  const rjPorts = placed as NocPort[];
  const sfpPorts = sfpGroups.map((g, i) => {
    const p = mkPort(g, `port-${stamp}-sfp${i + 1}`, g.identity.replace(/^.*?(\d+)\s*$/, 'SFP$1') || `SFP${i + 1}`);
    p.num = /\d/.test(g.identity) ? `SFP${g.identity.match(/(\d+)\s*$/)?.[1] ?? i + 1}` : `SFP${i + 1}`;
    return p;
  });

  return [...rjPorts, ...sfpPorts];
}
