import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  subscribeConfig,
  callService,
  type HassEntities,
  type Connection,
} from 'home-assistant-js-websocket';
import { HA_URL, HA_TOKEN } from '../config';
import { pingAlive, RESYNC_FLUSH_MS, STALE_AFTER_MS } from '../lib/connectionHealth';

// Module-level mirror of the WebSocket connection state, so leaf hooks (e.g.
// useCameraFeed) can gate work on connectivity without prop-drilling. Changes
// are broadcast as `ha:connection` CustomEvent<boolean> on window, matching
// the app's existing cross-cutting event idiom.
let haConnected = false;
export function isHaConnected(): boolean {
  return haConnected;
}
function broadcastConnected(value: boolean) {
  if (haConnected === value) return;
  haConnected = value;
  window.dispatchEvent(new CustomEvent('ha:connection', { detail: value }));
}

// The live connection object, so verifyHaConnection can ping it.
let haConnection: Connection | null = null;
let verifyInflight: Promise<boolean> | null = null;

/** Prove the socket is genuinely alive before trusting cached signed URLs —
 *  a tablet waking from screen-off often holds a zombie socket that still
 *  reads as connected. Round-trips a ping; a dead socket is force-reconnected
 *  (resolving false), and the reconnect resync then rotates the URLs. Because
 *  WebSocket messages are ordered, a pong also guarantees any token-rotation
 *  pushes queued while the tab was frozen have been received. Concurrent
 *  callers (every camera tile wakes at once) share a single ping. */
export function verifyHaConnection(): Promise<boolean> {
  if (verifyInflight) return verifyInflight;
  const conn = haConnection;
  if (!conn || !haConnected) return Promise.resolve(false);
  verifyInflight = pingAlive(conn).finally(() => {
    verifyInflight = null;
  });
  return verifyInflight;
}

// Whether cached signed URLs (camera_proxy / media_player_proxy tokens baked
// into entity attributes) can be trusted right now. Goes false when the socket
// drops or the tab wakes from a long freeze (the tokens may have rotated out
// while entity state was frozen); back true once a pong proves the socket was
// alive all along, or a post-reconnect resync delivers current state. Static
// renders (e.g. the camera grid) gate on this so a stale-token request is
// never fired — HA logs each one as "invalid authentication" (http.ban).
let signedUrlsFresh = true;
// Set when a reconnect is underway: the next entities push is the resync that
// makes signed URLs trustworthy again.
let resyncPending = false;
function broadcastSignedFresh(value: boolean) {
  if (signedUrlsFresh === value) return;
  signedUrlsFresh = value;
  window.dispatchEvent(new CustomEvent('ha:signed-fresh', { detail: value }));
}

/** Reactive mirror of signed-URL trustworthiness (see above). */
export function useSignedUrlsFresh(): boolean {
  const [fresh, setFresh] = useState(signedUrlsFresh);
  useEffect(() => {
    const onFresh = (e: Event) => setFresh((e as CustomEvent<boolean>).detail);
    window.addEventListener('ha:signed-fresh', onFresh);
    return () => window.removeEventListener('ha:signed-fresh', onFresh);
  }, []);
  return fresh;
}

// Module-level mirror of the server's temperature unit (°C/°F), same idiom as
// haConnected above. Climate entities don't publish `temperature_unit` as a
// state attribute — their values arrive converted to the server's configured
// unit — so displays must read the unit from the HA config.
let haTempUnit = '';
function broadcastTempUnit(value: string) {
  if (haTempUnit === value) return;
  haTempUnit = value;
  window.dispatchEvent(new CustomEvent('ha:temp-unit', { detail: value }));
}

/** The HA server's configured temperature unit; '°C' until the config arrives. */
export function useHaTempUnit(): string {
  const [unit, setUnit] = useState(haTempUnit);
  useEffect(() => {
    const onUnit = (e: Event) => setUnit((e as CustomEvent<string>).detail);
    window.addEventListener('ha:temp-unit', onUnit);
    return () => window.removeEventListener('ha:temp-unit', onUnit);
  }, []);
  return unit || '°C';
}

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
        haConnection = conn;
        setConnected(true);
        broadcastConnected(true);
        setError(null);

        conn.addEventListener('disconnected', () => {
          setConnected(false);
          broadcastConnected(false);
          // Entity state is now frozen; its signed URLs will rot as HA keeps
          // rotating tokens.
          broadcastSignedFresh(false);
        });
        conn.addEventListener('ready', () => {
          setConnected(true);
          broadcastConnected(true);
          // The re-subscription's full state fetch is on its way; the next
          // entities push carries current tokens.
          resyncPending = true;
        });

        subscribeEntities(conn, (ents) => {
          if (resyncPending) {
            resyncPending = false;
            broadcastSignedFresh(true);
          }
          if (!cancelled) setEntities(ents);
        });

        subscribeConfig(conn, (config) => {
          if (!cancelled) broadcastTempUnit(config.unit_system?.temperature ?? '');
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Connection failed');
          setConnected(false);
          broadcastConnected(false);
        }
      }
    }

    connect();

    // Global wake guard. A tablet waking from screen-off often holds a zombie
    // socket that still reads as connected while entity state — and every
    // signed URL in it — is hours old. Mark signed URLs suspect immediately,
    // then ping: a pong proves the socket (and thus the cached tokens) was
    // live all along; a dead socket is force-reconnected by pingAlive, and
    // the resync push above flips freshness back.
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const gap = hiddenAt != null ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      if (gap <= STALE_AFTER_MS) return;
      broadcastSignedFresh(false);
      void verifyHaConnection().then((alive) => {
        if (!alive) return;
        window.setTimeout(() => {
          // Skip if the socket dropped in the interim — the resync will re-arm.
          if (haConnected) broadcastSignedFresh(true);
        }, RESYNC_FLUSH_MS);
      });
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (haConnection === connRef.current) haConnection = null;
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
    async (entityId: string, hours = 24, attribute?: string): Promise<number[]> => {
      if (!connRef.current) return [];
      try {
        const end = new Date();
        const start = new Date(end.getTime() - hours * 3600 * 1000);
        // For an attribute series (e.g. a climate's `current_temperature`) we
        // must keep attributes in the response; the default state-only path stays
        // lean with minimal_response + no_attributes.
        const res = (await connRef.current.sendMessagePromise({
          type: 'history/history_during_period',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          entity_ids: [entityId],
          minimal_response: !attribute,
          no_attributes: !attribute,
        })) as Record<string, Array<{ s?: string; a?: Record<string, unknown> }>>;
        const points = res?.[entityId] ?? [];
        return points
          .map((p) => {
            const raw = attribute ? p.a?.[attribute] : p.s;
            return typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
          })
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

  /** Fetch events for the given calendars over the next `days` days via the
   *  response-returning `calendar.get_events` service (same pattern as
   *  `weather.get_forecasts`). The window starts at local midnight so ongoing
   *  and all-day events are included. Returns the raw per-calendar response. */
  const getCalendarEvents = useCallback(
    async (entityIds: string[], days = 7): Promise<Record<string, { events?: unknown[] }>> => {
      if (!connRef.current || !entityIds.length) return {};
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + days * 86_400_000);
      try {
        const res = (await callService(
          connRef.current,
          'calendar',
          'get_events',
          { start_date_time: start.toISOString(), end_date_time: end.toISOString() },
          { entity_id: entityIds },
          true,
        )) as { response?: Record<string, { events?: unknown[] }> };
        return res?.response ?? {};
      } catch {
        return {};
      }
    },
    [],
  );

  /** Send a natural-language command/question to HA Assist (issue #19).
   *  Uses the same `conversation/process` WebSocket command the HA frontend's
   *  Assist text box uses, so it works with whatever conversation agent the
   *  server has configured (built-in Assist, cloud, LLM…). Pass the previous
   *  result's `conversation_id` to keep follow-ups in context. */
  const converse = useCallback(
    async (text: string, opts?: { conversationId?: string; language?: string }): Promise<ConversationResult> => {
      if (!connRef.current) throw new Error('Not connected to Home Assistant.');
      return (await connRef.current.sendMessagePromise({
        type: 'conversation/process',
        text,
        ...(opts?.conversationId ? { conversation_id: opts.conversationId } : {}),
        ...(opts?.language ? { language: opts.language } : {}),
      })) as ConversationResult;
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

  return { entities, connected, error, callHA, getState, getForecast, getHistory, getCalendarEvents, searchMusic, playMusic, getMaPlayers, converse };
}

/** Shape of a `conversation/process` result (the fields Glance uses). */
export interface ConversationResult {
  conversation_id?: string | null;
  response: {
    response_type: 'action_done' | 'query_answer' | 'error';
    speech?: { plain?: { speech?: string } };
  };
}
