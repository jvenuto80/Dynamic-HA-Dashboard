import { useCallback, useEffect, useRef, useState } from 'react';
import type { HassEntity } from 'home-assistant-js-websocket';
import { HA_URL } from '../config';
import { isHaConnected, verifyHaConnection } from './useHomeAssistant';
import { RESYNC_FLUSH_MS, STALE_AFTER_MS } from '../lib/connectionHealth';

/** Build the base (un-busted) proxy URL for a camera entity, preferring HA's
 *  signed `entity_picture` over the raw `access_token` fallback. Both embed a
 *  signed token HA rotates every few minutes and pushes over the WebSocket —
 *  requesting with a rotated-out token gets a 401 that HA logs as a "Login
 *  attempt or request with invalid authentication" (http.ban), and can trip
 *  `ip_ban_enabled`. */
export function cameraProxyUrl(entity: HassEntity | undefined, entityId: string): string | undefined {
  if (!entity || entity.state === 'unavailable') return undefined;
  const pic = entity.attributes.entity_picture as string | undefined;
  if (pic) return pic.startsWith('http') ? pic : `${HA_URL}${pic}`;
  const token = entity.attributes.access_token as string | undefined;
  return token ? `${HA_URL}/api/camera_proxy/${entityId}?token=${token}` : undefined;
}

function bustUrl(base: string | undefined): string | undefined {
  if (!base) return undefined;
  return `${base}${base.includes('?') ? '&' : '?'}_=${Date.now()}`;
}

/** After a reconnect, resume anyway once the resync has had this long to land —
 *  if it didn't rotate the URL, the cached token is genuinely still current
 *  (the socket is fresh and live), so resuming is safe. */
const HOLD_FALLBACK_MS = 15_000;

/**
 * Live camera feed polling that never knowingly fires a stale signed token.
 *
 * The naive setInterval + cache-buster approach 401s against HA whenever the
 * cached token has rotated out (laptop sleep, throttled tab, HA restart), and
 * a free-running interval can fire a second stale request before the first
 * frame's error event lands. Instead:
 *
 *  - Frames are load-chained: the next request is scheduled only after the
 *    previous one resolves, so at most one is in flight.
 *  - A failed frame pauses the loop until HA pushes a rotated signed URL
 *    (a new `baseUrl`), which retries once.
 *  - Hiding the tab stops the loop. Resuming after a long gap first proves the
 *    socket is alive (verifyHaConnection ping) — a tablet waking from
 *    screen-off often holds a zombie socket that still reads as connected, and
 *    firing the frozen token it left behind is exactly the 401 HA logs. A pong
 *    resumes with the cached URL (guaranteed current, since rotations arrive
 *    in-order before it); a dead socket is force-reconnected and the loop
 *    stays held until the resync delivers a fresh `baseUrl`.
 *  - Losing the WebSocket holds the loop until reconnect; after reconnect, a
 *    fallback resume covers the case where the token never rotated and no new
 *    URL is coming.
 *
 * While held, `src` keeps its last value so the `<img>` shows the last frame
 * (the browser won't re-request an unchanged URL).
 */
export function useCameraFeed(
  baseUrl: string | undefined,
  refreshMs: number,
): { src: string | undefined; onLoad: () => void; onError: () => void } {
  const [src, setSrc] = useState<string | undefined>(() => bustUrl(baseUrl));
  const baseRef = useRef(baseUrl);
  // 'error' resumes only on a rotated baseUrl; 'stale' also resumes via the
  // fallback timer once we're connected again.
  const hold = useRef<'none' | 'stale' | 'error'>('none');
  const nextTimer = useRef<number | null>(null);
  const fallbackTimer = useRef<number | null>(null);
  const hiddenAt = useRef<number | null>(null);

  const clearNext = () => {
    if (nextTimer.current != null) {
      window.clearTimeout(nextTimer.current);
      nextTimer.current = null;
    }
  };
  const clearFallback = () => {
    if (fallbackTimer.current != null) {
      window.clearTimeout(fallbackTimer.current);
      fallbackTimer.current = null;
    }
  };

  const fire = useCallback(() => {
    if (document.hidden || !isHaConnected() || hold.current !== 'none') return;
    setSrc(bustUrl(baseRef.current));
  }, []);

  /** Stop polling and wait for a fresh signed URL (or an explicit resume). */
  const holdForFresh = useCallback(() => {
    if (hold.current === 'error') return;
    hold.current = 'stale';
    clearNext();
    clearFallback();
  }, []);

  // A new signed URL (token rotation or post-reconnect resync) clears any hold
  // and drives a single fresh attempt.
  useEffect(() => {
    if (baseRef.current === baseUrl) return;
    baseRef.current = baseUrl;
    hold.current = 'none';
    clearFallback();
    clearNext();
    if (!baseUrl) {
      setSrc(undefined);
      return;
    }
    fire();
  }, [baseUrl, fire]);

  useEffect(() => {
    let disposed = false;
    const onVis = () => {
      if (document.hidden) {
        hiddenAt.current = Date.now();
        clearNext();
        return;
      }
      const gap = hiddenAt.current != null ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      if (hold.current !== 'none') return;
      if (gap > STALE_AFTER_MS) {
        // The cached token may have rotated out while we were away. Hold, and
        // only resume once a pong proves the socket was alive the whole time
        // (so every rotation was received). A dead socket resolves false after
        // force-reconnecting; the resync's fresh baseUrl (or the onConn
        // fallback below) resumes us instead.
        holdForFresh();
        void verifyHaConnection().then((alive) => {
          if (disposed || !alive || hold.current !== 'stale') return;
          clearFallback();
          fallbackTimer.current = window.setTimeout(() => {
            if (hold.current !== 'stale') return;
            hold.current = 'none';
            fire();
          }, RESYNC_FLUSH_MS);
        });
      } else {
        fire();
      }
    };
    const onConn = (e: Event) => {
      const connected = (e as CustomEvent<boolean>).detail;
      if (!connected) {
        // Socket down: stop; nothing can succeed until we reconnect.
        holdForFresh();
      } else if (hold.current === 'stale') {
        // Reconnected: the resync usually rotates baseUrl within a second; if
        // the token never rotated, resume blind after the fallback.
        clearFallback();
        fallbackTimer.current = window.setTimeout(() => {
          if (hold.current !== 'stale') return;
          hold.current = 'none';
          fire();
        }, HOLD_FALLBACK_MS);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('ha:connection', onConn);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('ha:connection', onConn);
      clearNext();
      clearFallback();
    };
  }, [fire, holdForFresh]);

  const onLoad = useCallback(() => {
    hold.current = 'none';
    clearNext();
    nextTimer.current = window.setTimeout(fire, refreshMs);
  }, [fire, refreshMs]);

  const onError = useCallback(() => {
    hold.current = 'error';
    clearNext();
    clearFallback();
  }, []);

  return { src, onLoad, onError };
}
