/**
 * Fetch HA area / device / entity registries (issue #47).
 * Pure async helpers — the React hook lives in `useAreaRegistry.ts`.
 */
import type { Connection } from 'home-assistant-js-websocket';
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
} from '../types';

export interface AreaRegistries {
  areas: AreaRegistryEntry[];
  devices: DeviceRegistryEntry[];
  entities: EntityRegistryEntry[];
}

/** Normalize a raw area_registry list row into our minimal shape. */
export function normalizeAreaEntry(raw: Record<string, unknown>): AreaRegistryEntry {
  return {
    area_id: String(raw.area_id ?? ''),
    name: String(raw.name ?? raw.area_id ?? ''),
    icon: (raw.icon as string | null | undefined) ?? null,
    picture: (raw.picture as string | null | undefined) ?? null,
    floor_id: (raw.floor_id as string | null | undefined) ?? null,
    temperature_entity_id: (raw.temperature_entity_id as string | null | undefined) ?? null,
    humidity_entity_id: (raw.humidity_entity_id as string | null | undefined) ?? null,
  };
}

export function normalizeDeviceEntry(raw: Record<string, unknown>): DeviceRegistryEntry {
  return {
    id: String(raw.id ?? ''),
    area_id: (raw.area_id as string | null | undefined) ?? null,
    name: (raw.name as string | null | undefined) ?? null,
    name_by_user: (raw.name_by_user as string | null | undefined) ?? null,
  };
}

export function normalizeEntityEntry(raw: Record<string, unknown>): EntityRegistryEntry {
  return {
    entity_id: String(raw.entity_id ?? ''),
    area_id: (raw.area_id as string | null | undefined) ?? null,
    device_id: (raw.device_id as string | null | undefined) ?? null,
    platform: raw.platform as string | undefined,
    disabled_by: (raw.disabled_by as string | null | undefined) ?? null,
    hidden_by: (raw.hidden_by as string | null | undefined) ?? null,
    entity_category: (raw.entity_category as string | null | undefined) ?? null,
  };
}

/**
 * Normalize a compact `config/entity_registry/list_for_display` row
 * (`ei` entity_id, `ai` area, `di` device, `ec` category index, `hb` hidden).
 * That endpoint already omits disabled entities.
 */
export function normalizeDisplayEntity(
  raw: Record<string, unknown>,
  categories: Record<string, string>,
): EntityRegistryEntry {
  const ec = raw.ec;
  return {
    entity_id: String(raw.ei ?? ''),
    area_id: (raw.ai as string | undefined) ?? null,
    device_id: (raw.di as string | undefined) ?? null,
    platform: raw.pl as string | undefined,
    disabled_by: null,
    hidden_by: raw.hb ? 'hidden' : null,
    entity_category: ec == null ? null : (categories[String(ec)] ?? 'unknown'),
  };
}

interface DisplayListResult {
  entity_categories: Record<string, string>;
  entities: Record<string, unknown>[];
}

/** Entity registry via the compact display list (~7x smaller); full list on older HA. */
async function fetchEntityRegistry(conn: Connection): Promise<EntityRegistryEntry[]> {
  try {
    const res = (await conn.sendMessagePromise({
      type: 'config/entity_registry/list_for_display',
    })) as DisplayListResult;
    return res.entities.map((e) => normalizeDisplayEntity(e, res.entity_categories ?? {}));
  } catch {
    const raw = (await conn.sendMessagePromise({
      type: 'config/entity_registry/list',
    })) as Record<string, unknown>[];
    return raw.map(normalizeEntityEntry);
  }
}

/** Parallel fetch of the three registries needed for room membership. */
export async function fetchAreaRegistries(conn: Connection): Promise<AreaRegistries> {
  const [areasRaw, devicesRaw, entities] = await Promise.all([
    conn.sendMessagePromise({ type: 'config/area_registry/list' }) as Promise<
      Record<string, unknown>[]
    >,
    conn.sendMessagePromise({ type: 'config/device_registry/list' }) as Promise<
      Record<string, unknown>[]
    >,
    fetchEntityRegistry(conn),
  ]);

  return {
    areas: areasRaw.map(normalizeAreaEntry).filter((a) => a.area_id),
    devices: devicesRaw.map(normalizeDeviceEntry).filter((d) => d.id),
    entities: entities.filter((e) => e.entity_id),
  };
}

/** Registry change events that should trigger a re-fetch. */
export const REGISTRY_UPDATE_EVENTS = [
  'area_registry_updated',
  'device_registry_updated',
  'entity_registry_updated',
] as const;
