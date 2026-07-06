/** Minimal slice of home-assistant-js-websocket's Connection we depend on. */
export interface PingableConnection {
  ping(): Promise<unknown>;
  reconnect(force?: boolean): void;
}

/** How long a ping may go unanswered before the socket is declared a zombie.
 *  Generous enough for a tablet re-associating with WiFi after screen-on. */
export const PING_TIMEOUT_MS = 4000;

/** Tab hidden longer than this and cached signed URLs are treated as suspect:
 *  the embedded tokens may have rotated out while the page was frozen (HA
 *  honors the last two tokens, so short gaps are safe). */
export const STALE_AFTER_MS = 30_000;

/** After a pong proves the socket alive, wait this long before trusting cached
 *  URLs again so React can flush any token-rotation pushes that were queued
 *  while the tab was frozen. */
export const RESYNC_FLUSH_MS = 300;

/**
 * Round-trip a ping over the socket to prove it is genuinely alive.
 *
 * A tablet waking from screen-off often holds a "zombie" WebSocket: the OS
 * froze the page, the TCP connection silently died, but no close/error event
 * has fired yet — so connection state still reads as connected. Resolves true
 * on a pong; on timeout or error, forces a reconnect (tearing the zombie down
 * so the library's auto-reconnect and state resync can run) and resolves
 * false. Never rejects.
 */
export async function pingAlive(conn: PingableConnection, timeoutMs = PING_TIMEOUT_MS): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      conn.ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('ping timeout')), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    try {
      conn.reconnect(true);
    } catch {
      // Socket already torn down — a reconnect is underway anyway.
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}
