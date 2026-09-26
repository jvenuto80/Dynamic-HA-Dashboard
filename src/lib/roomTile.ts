/**
 * Room Summary tile helpers (issue #48).
 *
 * Room tiles are special (non-entity) cards stored as `glance.room.<areaId>`
 * so multiple rooms can sit on the same page (unlike the singleton calendar card).
 */
import type {
  RoomClimateValue,
  RoomEntity,
  RoomShowOptions,
  RoomSummary,
  RoomSummaryOptions,
} from '../types';

export const ROOM_TILE_PREFIX = 'glance.room.';
/** Sentinel id offered in the entity picker; picking it opens the area chooser. */
export const ROOM_TILE_PICKER_ID = 'glance.room';

export function isRoomTile(entityId: string): boolean {
  return entityId.startsWith(ROOM_TILE_PREFIX) && entityId.length > ROOM_TILE_PREFIX.length;
}

export function roomTileId(areaId: string): string {
  return `${ROOM_TILE_PREFIX}${areaId}`;
}

export function areaIdFromRoomTile(entityId: string): string | null {
  if (!isRoomTile(entityId)) return null;
  return entityId.slice(ROOM_TILE_PREFIX.length);
}

/** Resolve the HA area id for a room tile config. */
export function roomAreaId(re: RoomEntity): string | null {
  return re.areaId || areaIdFromRoomTile(re.entity_id);
}

export function defaultRoomShow(): Required<RoomShowOptions> {
  return {
    avgTemp: true,
    avgHumidity: true,
    lightsOn: true,
    problems: true,
  };
}

export function roomShow(re: RoomEntity): Required<RoomShowOptions> {
  const d = defaultRoomShow();
  return { ...d, ...(re.show ?? {}) };
}

function fmtTemp(c: RoomClimateValue): string {
  const v = Number.isInteger(c.value) ? String(c.value) : c.value.toFixed(1);
  return `${v}${c.unit}`;
}

function fmtHumidity(c: RoomClimateValue): string {
  return `${Math.round(c.value)}${c.unit}`;
}

/** Compact face line: `22.4°C · 41% · 3 lights` (honors show toggles). */
export function formatRoomFaceStats(
  summary: RoomSummary,
  show: RoomShowOptions = {},
  lightsLabel: (n: number) => string = (n) => `${n} lights`,
): string {
  const s = { ...defaultRoomShow(), ...show };
  const parts: string[] = [];
  if (s.avgTemp && summary.temperature) parts.push(fmtTemp(summary.temperature));
  if (s.avgHumidity && summary.humidity) parts.push(fmtHumidity(summary.humidity));
  if (s.lightsOn) parts.push(lightsLabel(summary.lightsOn));
  return parts.join(' · ');
}

/** New room tile. The name is left unset so the live HA area name shows (and follows renames). */
export function makeRoomTile(areaId: string): RoomEntity {
  return {
    entity_id: roomTileId(areaId),
    areaId,
    size: '2x1',
    type: 'room',
  };
}

/** Engine options derived from a room tile's saved settings. */
export function roomSummaryOpts(re: RoomEntity): RoomSummaryOptions {
  return {
    exclude: re.exclude,
    temperatureEntity: re.tempSource,
    humidityEntity: re.humiditySource,
    flagImportantUnavailable: re.flagUnavailable,
    collapseSubEntities: re.collapseSegments,
  };
}

/** Domains offered as filters for the flyout devices list, in display order. */
export const ROOM_DEVICE_DOMAINS = [
  'light', 'switch', 'fan', 'cover', 'lock', 'climate', 'media_player', 'vacuum',
  'camera', 'scene', 'script', 'button', 'sensor', 'binary_sensor', 'other',
] as const;

/** Controllable domains shown by default; sensors etc. are opt-in. */
export const ROOM_DEFAULT_DEVICE_DOMAINS: string[] = [
  'light', 'switch', 'fan', 'cover', 'lock', 'climate', 'media_player', 'vacuum',
];

export function roomDeviceDomains(re: RoomEntity): string[] {
  return re.deviceDomains ?? ROOM_DEFAULT_DEVICE_DOMAINS;
}

const KNOWN_DOMAINS = new Set<string>(ROOM_DEVICE_DOMAINS);

/** Filter bucket for an entity: its domain, or 'other' when not individually listed. */
export function roomDomainKey(entityId: string): string {
  const domain = entityId.split('.')[0] ?? '';
  return KNOWN_DOMAINS.has(domain) ? domain : 'other';
}

/** Group entity ids by domain (in ROOM_DEVICE_DOMAINS order), keeping only enabled domains. */
export function groupRoomDevices(
  entityIds: string[],
  enabled: string[],
): { groups: { domain: string; ids: string[] }[]; hidden: number } {
  const on = new Set(enabled);
  const byDomain = new Map<string, string[]>();
  let hidden = 0;
  for (const id of entityIds) {
    const key = roomDomainKey(id);
    if (!on.has(key)) {
      hidden++;
      continue;
    }
    const list = byDomain.get(key) ?? [];
    list.push(id);
    byDomain.set(key, list);
  }
  const groups = ROOM_DEVICE_DOMAINS.filter((d) => byDomain.has(d)).map((domain) => ({
    domain,
    ids: byDomain.get(domain)!,
  }));
  return { groups, hidden };
}
