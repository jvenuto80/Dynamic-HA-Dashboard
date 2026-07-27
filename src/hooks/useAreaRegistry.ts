/**
 * Area registry hook (issue #47).
 *
 * Loads area/device/entity registries over an existing HA WebSocket connection
 * and exposes `getEntitiesInArea` / `getRoomSummary` for the Room tile (#48).
 *
 * Usage (from App / future Room tile):
 *   const conn = useHaConnection();
 *   const { entities } = useHomeAssistant();
 *   const { getRoomSummary, areas, ready } = useAreaRegistry(conn, entities);
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Connection, HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { fetchAreaRegistries } from '../lib/areaRegistry';
import { buildRoomSummary, entitiesInArea } from '../lib/roomSummary';
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  RoomSummary,
  RoomSummaryOptions,
} from '../types';

export interface UseAreaRegistryResult {
  areas: AreaRegistryEntry[];
  devices: DeviceRegistryEntry[];
  entityReg: EntityRegistryEntry[];
  /** True after a successful fetch (may still be empty arrays). */
  ready: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getEntitiesInArea: (areaId: string, exclude?: string[]) => HassEntity[];
  getRoomSummary: (areaId: string, opts?: RoomSummaryOptions) => RoomSummary;
}

/**
 * @param conn Active HA connection (null while disconnected).
 * @param states Live entity states from `subscribeEntities`.
 */
export function useAreaRegistry(
  conn: Connection | null,
  states: HassEntities,
): UseAreaRegistryResult {
  const [areas, setAreas] = useState<AreaRegistryEntry[]>([]);
  const [devices, setDevices] = useState<DeviceRegistryEntry[]>([]);
  const [entityReg, setEntityReg] = useState<EntityRegistryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const statesRef = useRef(states);
  statesRef.current = states;

  const refresh = useCallback(async () => {
    if (!conn) {
      setReady(false);
      return;
    }
    try {
      const regs = await fetchAreaRegistries(conn);
      setAreas(regs.areas);
      setDevices(regs.devices);
      setEntityReg(regs.entities);
      setError(null);
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load area registries');
      setReady(false);
    }
  }, [conn]);

  useEffect(() => {
    if (!conn) {
      setAreas([]);
      setDevices([]);
      setEntityReg([]);
      setReady(false);
      setError(null);
      return;
    }
    void refresh();
  }, [conn, refresh]);

  const getEntitiesInArea = useCallback(
    (areaId: string, exclude: string[] = []): HassEntity[] =>
      entitiesInArea(areaId, entityReg, devices, states, exclude),
    [entityReg, devices, states],
  );

  const getRoomSummary = useCallback(
    (areaId: string, opts?: RoomSummaryOptions): RoomSummary =>
      buildRoomSummary({
        areaId,
        areas,
        entityReg,
        deviceReg: devices,
        states,
        opts,
      }),
    [areas, entityReg, devices, states],
  );

  // Dev-only console probe so reviewers can call:
  //   __glanceRoomSummary('living_room')
  useEffect(() => {
    if (!import.meta.env.DEV || !ready) return;
    const api = (areaId: string, opts?: RoomSummaryOptions) =>
      buildRoomSummary({
        areaId,
        areas,
        entityReg,
        deviceReg: devices,
        states: statesRef.current,
        opts,
      });
    (window as unknown as { __glanceRoomSummary?: typeof api }).__glanceRoomSummary = api;
    return () => {
      delete (window as unknown as { __glanceRoomSummary?: unknown }).__glanceRoomSummary;
    };
  }, [ready, areas, entityReg, devices]);

  return {
    areas,
    devices,
    entityReg,
    ready,
    error,
    refresh,
    getEntitiesInArea,
    getRoomSummary,
  };
}
