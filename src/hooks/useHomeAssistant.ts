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

  // ── Music Assistant ──
  // The `music_assistant.search` service needs the integration's config entry id.
  // Resolve it lazily and cache it (undefined = not yet looked up, null = none).
  const maEntryId = useRef<string | null | undefined>(undefined);

  const getMaEntryId = useCallback(async (): Promise<string | null> => {
    if (maEntryId.current !== undefined) return maEntryId.current;
    if (!connRef.current) return null;
    try {
      const entries = (await connRef.current.sendMessagePromise({
        type: 'config_entries/get',
      })) as Array<{ entry_id: string; domain: string }>;
      maEntryId.current = entries.find((e) => e.domain === 'music_assistant')?.entry_id ?? null;
    } catch {
      maEntryId.current = null;
    }
    return maEntryId.current;
  }, []);

  /** Search Music Assistant; returns the raw grouped response (artists/albums/…). */
  const searchMusic = useCallback(
    async (opts: {
      term: string;
      mediaType?: string;
      limit?: number;
      libraryOnly?: boolean;
    }): Promise<Record<string, unknown>> => {
      if (!connRef.current) throw new Error('Not connected to Home Assistant.');
      const entryId = await getMaEntryId();
      if (!entryId) throw new Error('Music Assistant integration not found.');
      const data: Record<string, unknown> = {
        config_entry_id: entryId,
        name: opts.term,
        limit: opts.limit && opts.limit > 0 ? opts.limit : 5,
        library_only: !!opts.libraryOnly,
      };
      if (opts.mediaType) data.media_type = [opts.mediaType];
      const res = (await callService(
        connRef.current,
        'music_assistant',
        'search',
        data,
        undefined,
        true,
      )) as { response?: Record<string, unknown> };
      return res?.response ?? {};
    },
    [getMaEntryId],
  );

  /** Play a Music Assistant media uri on a media_player. */
  const playMusic = useCallback(
    async (playerEntityId: string, mediaId: string, mediaType?: string) => {
      const data: Record<string, unknown> = { media_id: mediaId };
      if (mediaType) data.media_type = mediaType;
      await callHA('music_assistant', 'play_media', data, { entity_id: playerEntityId });
    },
    [callHA],
  );

  // The media players you can play to are the ones provided by the Music
  // Assistant integration. Resolve them from the entity registry
  // (platform === 'music_assistant') and cache the result. Throws if the
  // registry can't be read so callers can decide on a fallback.
  const maPlayerIds = useRef<string[] | undefined>(undefined);
  const getMaPlayers = useCallback(async (): Promise<string[]> => {
    if (maPlayerIds.current !== undefined) return maPlayerIds.current;
    if (!connRef.current) throw new Error('Not connected to Home Assistant.');
    const reg = (await connRef.current.sendMessagePromise({
      type: 'config/entity_registry/list',
    })) as Array<{ entity_id: string; platform: string }>;
    maPlayerIds.current = reg
      .filter((r) => r.platform === 'music_assistant' && r.entity_id.startsWith('media_player.'))
      .map((r) => r.entity_id);
    return maPlayerIds.current;
  }, []);

  return { entities, connected, error, callHA, getState, getForecast, getHistory, searchMusic, playMusic, getMaPlayers };
}
