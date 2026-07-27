/**
 * Room Summary tile helpers (issue #48).
 *
 * Room tiles are special (non-entity) cards stored as `glance.room.<areaId>`
 * so multiple rooms can sit on the same page (unlike the singleton calendar card).
 */
import type { RoomClimateValue, RoomEntity, RoomShowOptions, RoomSummary } from '../types';

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

export function makeRoomTile(areaId: string, areaName?: string): RoomEntity {
  return {
    entity_id: roomTileId(areaId),
    areaId,
    name: areaName,
    size: '2x1',
    type: 'room',
  };
}
