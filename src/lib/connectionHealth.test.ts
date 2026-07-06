import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pingAlive, PING_TIMEOUT_MS, type PingableConnection } from './connectionHealth';

function makeConn(ping: () => Promise<unknown>): PingableConnection & { reconnect: ReturnType<typeof vi.fn> } {
  return { ping, reconnect: vi.fn() };
}

describe('pingAlive', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true on a pong and does not reconnect', async () => {
    const conn = makeConn(() => Promise.resolve('pong'));
    await expect(pingAlive(conn)).resolves.toBe(true);
    expect(conn.reconnect).not.toHaveBeenCalled();
  });

  it('declares a zombie on timeout: resolves false and force-reconnects', async () => {
    // A zombie socket accepts the send but no pong ever arrives.
    const conn = makeConn(() => new Promise(() => {}));
    const result = pingAlive(conn);
    await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS);
    await expect(result).resolves.toBe(false);
    expect(conn.reconnect).toHaveBeenCalledWith(true);
  });

  it('does not reconnect if the pong lands just before the timeout', async () => {
    let pong!: (v: unknown) => void;
    const conn = makeConn(() => new Promise((resolve) => { pong = resolve; }));
    const result = pingAlive(conn);
    await vi.advanceTimersByTimeAsync(PING_TIMEOUT_MS - 1);
    pong('pong');
    await expect(result).resolves.toBe(true);
    expect(conn.reconnect).not.toHaveBeenCalled();
  });

  it('resolves false and reconnects when the ping itself rejects', async () => {
    const conn = makeConn(() => Promise.reject(new Error('socket closed')));
    await expect(pingAlive(conn)).resolves.toBe(false);
    expect(conn.reconnect).toHaveBeenCalledWith(true);
  });

  it('swallows a reconnect throw (socket already torn down)', async () => {
    const conn = makeConn(() => Promise.reject(new Error('socket closed')));
    conn.reconnect.mockImplementation(() => {
      throw new Error('already closed');
    });
    await expect(pingAlive(conn)).resolves.toBe(false);
  });
});
