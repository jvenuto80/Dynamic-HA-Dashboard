import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  callService,
  type HassEntities,
  type Connection,
} from 'home-assistant-js-websocket';
import { HA_URL, HA_TOKEN } from '../config';

export function useHomeAssistant() {
  const [entities, setEntities] = useState<HassEntities>({});
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connRef = useRef<Connection | null>(null);

  useEffect(() => {
    if (!HA_TOKEN) {
      setError('No HA token configured. Set VITE_HA_TOKEN in .env');
      return;
    }

    let cancelled = false;

    async function connect() {
      try {
        const wsUrl = HA_URL.replace(/^http/, 'ws') + '/api/websocket';
        const auth = createLongLivedTokenAuth(HA_URL, HA_TOKEN);
        const conn = await createConnection({ auth });

        if (cancelled) {
          conn.close();
          return;
        }

        connRef.current = conn;
        setConnected(true);
        setError(null);

        conn.addEventListener('disconnected', () => setConnected(false));
        conn.addEventListener('ready', () => setConnected(true));

        subscribeEntities(conn, (ents) => {
          if (!cancelled) setEntities(ents);
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Connection failed');
          setConnected(false);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      connRef.current?.close();
    };
  }, []);

  const callHA = useCallback(
    async (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => {
      if (!connRef.current) return;
      await callService(connRef.current, domain, service, data, target);
    },
    [],
  );

  const getState = useCallback(
    (entityId: string) => entities[entityId] ?? null,
    [entities],
  );

  const getHistory = useCallback(
    async (entityId: string, hours = 24): Promise<number[]> => {
      if (!connRef.current) return [];
      try {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 3600 * 1000);
        const res = (await connRef.current.sendMessagePromise({
          type: 'history/history_during_period',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          entity_ids: [entityId],
          minimal_response: true,
          no_attributes: true,
        })) as Record<string, Array<{ s?: string }>>;
        const points = res?.[entityId] ?? [];
        return points
          .map((p) => parseFloat(p.s ?? ''))
          .filter((n) => Number.isFinite(n));
      } catch {
        return [];
      }
    },
    [],
  );

  const getForecast = useCallback(
    async (entityId: string, type: 'daily' | 'hourly' = 'daily') => {
      if (!connRef.current) return [];
      try {
        const res = (await callService(
          connRef.current,
          'weather',
          'get_forecasts',
          { type },
          { entity_id: entityId },
          true,
        )) as { response?: Record<string, { forecast?: unknown[] }> };
        return res?.response?.[entityId]?.forecast ?? [];
      } catch {
        return [];
      }
    },
    [],
  );

  return { entities, connected, error, callHA, getState, getForecast, getHistory };
}
