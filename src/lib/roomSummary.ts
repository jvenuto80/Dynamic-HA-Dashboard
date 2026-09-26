/**
 * Room Summary engine (issue #47).
 *
 * Pure helpers: resolve entities in an HA Area, average climate sensors,
 * count lights on, detect room-level problems. No React / UI — consumed by
 * `useAreaRegistry` and (later) the Room tile (#48).
 */
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  RoomClimateValue,
  RoomProblem,
  RoomProblemReason,
  RoomSummary,
  RoomSummaryOptions,
} from '../types';

export type ClimateDeviceClass = 'temperature' | 'humidity';

const SAFETY_DEVICE_CLASSES = new Set(['smoke', 'gas', 'moisture', 'problem']);

const IMPORTANT_UNAVAILABLE_DOMAINS = new Set(['light', 'lock', 'climate']);

/** Normalize unit strings so "°C" / "C" / "℃" compare equal. */
export function normalizeTempUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace(/\s+/g, '');
  if (u === 'c' || u === '°c' || u === '℃' || u === 'celsius') return '°C';
  if (u === 'f' || u === '°f' || u === '℉' || u === 'fahrenheit') return '°F';
  return unit.trim() || '';
}

function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? '';
}

function isUnavailable(state: string): boolean {
  return state === 'unavailable' || state === 'unknown';
}

function parseNumericState(entity: HassEntity): number | null {
  const n = typeof entity.state === 'number' ? entity.state : parseFloat(String(entity.state));
  return Number.isFinite(n) ? n : null;
}

function deviceClassOf(entity: HassEntity): string {
  return String(entity.attributes.device_class ?? '');
}

function unitOf(entity: HassEntity): string {
  return String(entity.attributes.unit_of_measurement ?? '');
}

/**
 * Entity IDs that belong to an area: entity.area_id match, or (when entity has
 * no area) the parent device's area_id match. Disabled/hidden rows and
 * diagnostic/config entities are skipped.
 */
export function entityIdsInArea(
  areaId: string,
  entityReg: EntityRegistryEntry[],
  deviceReg: DeviceRegistryEntry[],
): string[] {
  const deviceArea = new Map<string, string | null | undefined>();
  for (const d of deviceReg) deviceArea.set(d.id, d.area_id);

  const out: string[] = [];
  for (const e of entityReg) {
    if (e.disabled_by || e.hidden_by || e.entity_category) continue;
    const area =
      e.area_id != null && e.area_id !== ''
        ? e.area_id
        : e.device_id
          ? deviceArea.get(e.device_id)
          : null;
    if (area === areaId) out.push(e.entity_id);
  }
  return out;
}

/** Live HassEntity objects for an area (order follows registry resolution). */
export function entitiesInArea(
  areaId: string,
  entityReg: EntityRegistryEntry[],
  deviceReg: DeviceRegistryEntry[],
  states: HassEntities,
  exclude: string[] = [],
): HassEntity[] {
  const skip = new Set(exclude);
  return entityIdsInArea(areaId, entityReg, deviceReg)
    .filter((id) => !skip.has(id))
    .map((id) => states[id])
    .filter((e): e is HassEntity => !!e);
}

/**
 * Mean of finite numeric sensors matching `deviceClass`, same unit only.
 * Picks the dominant unit (most sensors); returns undefined if none.
 */
export function averageByDeviceClass(
  entities: HassEntity[],
  deviceClass: ClimateDeviceClass,
): RoomClimateValue | undefined {
  const candidates = entities.filter((e) => {
    if (domainOf(e.entity_id) !== 'sensor') return false;
    if (deviceClassOf(e) !== deviceClass) return false;
    if (isUnavailable(e.state)) return false;
    return parseNumericState(e) != null;
  });
  if (!candidates.length) return undefined;

  // Group by normalized unit; prefer the largest group.
  const byUnit = new Map<string, HassEntity[]>();
  for (const e of candidates) {
    const key =
      deviceClass === 'temperature' ? normalizeTempUnit(unitOf(e)) : unitOf(e).trim() || '';
    const list = byUnit.get(key) ?? [];
    list.push(e);
    byUnit.set(key, list);
  }

  let best: HassEntity[] = [];
  let bestUnit = '';
  for (const [unit, list] of byUnit) {
    if (list.length > best.length) {
      best = list;
      bestUnit = unit;
    }
  }

  const values = best.map((e) => parseNumericState(e)!);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    value: mean,
    unit:
      deviceClass === 'temperature'
        ? bestUnit || '°C'
        : bestUnit || String(best[0]?.attributes.unit_of_measurement ?? '%'),
  };
}

/**
 * Prefer an explicit override, then the area's configured temperature/humidity
 * entity, when present and readable; otherwise fall back to `averageByDeviceClass`.
 */
export function preferAreaDefaultSensor(
  area: AreaRegistryEntry,
  entities: HassEntity[],
  states: HassEntities,
  deviceClass: ClimateDeviceClass,
  overrideId?: string,
): RoomClimateValue | undefined {
  const areaDefault =
    deviceClass === 'temperature' ? area.temperature_entity_id : area.humidity_entity_id;

  for (const preferredId of [overrideId, areaDefault]) {
    if (!preferredId) continue;
    const preferred = states[preferredId];
    if (preferred && !isUnavailable(preferred.state)) {
      const n = parseNumericState(preferred);
      if (n != null) {
        const rawUnit = unitOf(preferred);
        return {
          value: n,
          unit:
            deviceClass === 'temperature'
              ? normalizeTempUnit(rawUnit) || '°C'
              : rawUnit.trim() || '%',
          sourceEntityId: preferredId,
        };
      }
    }
  }

  return averageByDeviceClass(entities, deviceClass);
}

/** Member entity_ids of an HA group entity (group helper / old-style group), else null. */
export function groupMembers(entity: HassEntity | undefined): string[] | null {
  // Scenes also expose `entity_id` (the entities they set), but aren't groups.
  if (!entity || domainOf(entity.entity_id) === 'scene') return null;
  const members = entity.attributes.entity_id;
  return Array.isArray(members) && members.length && members.every((m) => typeof m === 'string')
    ? (members as string[])
    : null;
}

/**
 * Groups in `ids` that expand (recursively) to at least one non-group entity also
 * in `ids` — their members already represent them, so counting both double-counts.
 * A group whose members all live elsewhere is kept as a stand-in.
 */
export function redundantGroups(ids: string[], states: HassEntities): Set<string> {
  const inRoom = new Set(ids);
  const leavesOf = (id: string, seen: Set<string>): string[] => {
    const members = groupMembers(states[id]);
    if (!members) return [id];
    return members.flatMap((m) => {
      if (seen.has(m)) return [];
      seen.add(m);
      return leavesOf(m, seen);
    });
  };
  const out = new Set<string>();
  for (const id of ids) {
    if (!groupMembers(states[id])) continue;
    if (leavesOf(id, new Set([id])).some((leaf) => leaf !== id && inRoom.has(leaf))) out.add(id);
  }
  return out;
}

/** Count light.* entities that are currently on (excludes already applied). */
export function countLightsOn(entities: HassEntity[]): number {
  return entities.filter((e) => domainOf(e.entity_id) === 'light' && e.state === 'on').length;
}

/**
 * Fold sub-entities under a main entity of the same device and domain when the
 * sub-entity's name extends the main one ("Hexa Segment 001" under "Hexa").
 * Returns main entities in input order, each with its folded children.
 */
export function collapseSubEntities(
  ids: string[],
  states: HassEntities,
  deviceIds: Record<string, string>,
): { id: string; children: string[] }[] {
  const nameOf = (id: string) =>
    String(states[id]?.attributes.friendly_name ?? id).trim().toLowerCase();
  const parentOf = new Map<string, string>();
  const byGroup = new Map<string, string[]>();
  for (const id of ids) {
    const device = deviceIds[id];
    if (!device) continue;
    const key = `${device}|${domainOf(id)}`;
    const list = byGroup.get(key) ?? [];
    list.push(id);
    byGroup.set(key, list);
  }
  for (const list of byGroup.values()) {
    const mains: string[] = [];
    for (const id of [...list].sort((a, b) => nameOf(a).length - nameOf(b).length)) {
      const main = mains.find((m) => nameOf(id).startsWith(`${nameOf(m)} `));
      if (main) parentOf.set(id, main);
      else mains.push(id);
    }
  }
  const out = new Map<string, string[]>();
  for (const id of ids) {
    const parent = parentOf.get(id);
    if (parent) continue;
    out.set(id, []);
  }
  for (const [child, parent] of parentOf) out.get(parent)?.push(child);
  return [...out].map(([id, children]) => ({ id, children }));
}

function safetyReason(deviceClass: string): RoomProblemReason | null {
  if (deviceClass === 'smoke') return 'smoke';
  if (deviceClass === 'gas') return 'gas';
  if (deviceClass === 'moisture') return 'moisture';
  if (deviceClass === 'problem') return 'problem';
  return null;
}

/**
 * Strict v1 problem detection:
 * - critical: binary_sensor smoke/gas/moisture/problem when active (`on`)
 * - warning: light/lock/climate unavailable (when flagImportantUnavailable),
 *   collapsed to one row per device so an offline multi-segment light counts once
 */
export function detectRoomProblems(
  entities: HassEntity[],
  opts: Pick<RoomSummaryOptions, 'flagImportantUnavailable'> = {},
  deviceOf: (entityId: string) => DeviceRegistryEntry | undefined = () => undefined,
): RoomProblem[] {
  const flagUnavailable = opts.flagImportantUnavailable !== false;
  const problems: RoomProblem[] = [];
  const byDevice = new Map<string, RoomProblem>();

  for (const e of entities) {
    const domain = domainOf(e.entity_id);
    const dc = deviceClassOf(e);

    if (domain === 'binary_sensor' && SAFETY_DEVICE_CLASSES.has(dc) && e.state === 'on') {
      const reason = safetyReason(dc);
      if (reason) {
        problems.push({ entity_id: e.entity_id, reason, severity: 'critical' });
      }
      continue;
    }

    if (flagUnavailable && IMPORTANT_UNAVAILABLE_DOMAINS.has(domain) && isUnavailable(e.state)) {
      const device = deviceOf(e.entity_id);
      const existing = device ? byDevice.get(device.id) : undefined;
      if (existing) {
        existing.count = (existing.count ?? 1) + 1;
        existing.label = device!.name_by_user || device!.name || undefined;
        continue;
      }
      const problem: RoomProblem = {
        entity_id: e.entity_id,
        reason: 'unavailable',
        severity: 'warning',
      };
      if (device) byDevice.set(device.id, problem);
      problems.push(problem);
    }
  }

  return problems;
}

export interface BuildRoomSummaryInput {
  areaId: string;
  areas: AreaRegistryEntry[];
  entityReg: EntityRegistryEntry[];
  deviceReg: DeviceRegistryEntry[];
  states: HassEntities;
  opts?: RoomSummaryOptions;
}

/** Compose a full RoomSummary for one area. Safe on empty / missing areas. */
export function buildRoomSummary(input: BuildRoomSummaryInput): RoomSummary {
  const { areaId, areas, entityReg, deviceReg, states, opts } = input;
  const exclude = opts?.exclude ?? [];
  const area = areas.find((a) => a.area_id === areaId);
  const areaName = area?.name ?? areaId;

  const entities = entitiesInArea(areaId, entityReg, deviceReg, states, exclude);
  const entityIds = entities.map((e) => e.entity_id);
  const devicesById = new Map(deviceReg.map((d) => [d.id, d]));
  const deviceIdByEntity = new Map(entityReg.map((e) => [e.entity_id, e.device_id]));
  const deviceOf = (id: string) => {
    const deviceId = deviceIdByEntity.get(id);
    return deviceId ? devicesById.get(deviceId) : undefined;
  };
  const deviceIds: Record<string, string> = {};
  for (const id of entityIds) {
    const deviceId = deviceIdByEntity.get(id);
    if (deviceId) deviceIds[id] = deviceId;
  }
  const redundant = redundantGroups(entityIds, states);
  const physical = entities.filter((e) => !redundant.has(e.entity_id));
  const lightEntities =
    opts?.collapseSubEntities === false
      ? physical
      : collapseSubEntities(
          physical.map((e) => e.entity_id),
          states,
          deviceIds,
        ).map((m) => states[m.id]!);

  if (!area) {
    return {
      areaId,
      areaName,
      lightsOn: 0,
      problems: [],
      entityIds,
      deviceIds,
    };
  }

  return {
    areaId,
    areaName,
    temperature: preferAreaDefaultSensor(area, entities, states, 'temperature', opts?.temperatureEntity),
    humidity: preferAreaDefaultSensor(area, entities, states, 'humidity', opts?.humidityEntity),
    lightsOn: countLightsOn(lightEntities),
    problems: detectRoomProblems(
      physical,
      { flagImportantUnavailable: opts?.flagImportantUnavailable },
      deviceOf,
    ),
    entityIds,
    deviceIds,
    groupIds: [...redundant],
  };
}
