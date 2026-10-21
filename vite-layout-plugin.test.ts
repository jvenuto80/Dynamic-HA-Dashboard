import { EventEmitter } from 'node:events';
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup } from 'node:dns/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import type { ViteDevServer } from 'vite';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn(), writeFile: vi.fn() }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:http', () => ({ request: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));

const upstreamFixture = { status: 200, body: '{"value":1}' };
type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => unknown;

async function request(path: string, options: {
  address?: string;
  headers?: Record<string, string>;
  method?: string;
  body?: unknown;
} = {}) {
  const { layoutApi } = await import('./vite-layout-plugin');
  const handlers: Middleware[] = [];
  const plugin = layoutApi();
  const configure = plugin.configureServer as (server: ViteDevServer) => void;
  configure({ middlewares: { use: (handler: Middleware) => handlers.push(handler) } } as unknown as ViteDevServer);
  const req = Object.assign(new EventEmitter(), {
    url: path,
    method: options.method ?? 'GET',
    headers: options.headers ?? {},
    socket: { remoteAddress: options.address ?? '192.0.2.99' },
  }) as IncomingMessage;
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const response = {
      statusCode: 200,
      setHeader: vi.fn(),
      end(body = '') { resolve({ status: response.statusCode, body }); },
    };
    const res = response as unknown as ServerResponse;
    const dispatch = (index: number) => {
      if (index >= handlers.length) return reject(new Error('No middleware matched'));
      Promise.resolve(handlers[index](req, res, () => dispatch(index + 1))).catch(reject);
    };
    dispatch(0);
    queueMicrotask(() => {
      if (options.body !== undefined) req.emit('data', Buffer.from(JSON.stringify(options.body)));
      req.emit('end');
    });
  });
}

describe('layout API security', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ALLOW_LAN_CONNECTION', '');
    vi.mocked(readFile).mockResolvedValue('{"haToken":"fake-test-token"}');
    vi.mocked(writeFile).mockResolvedValue();
    vi.mocked(lookup).mockResolvedValue([{ address: '192.168.1.10', family: 4 }]);
    upstreamFixture.status = 200;
    upstreamFixture.body = '{"value":1}';
    for (const transport of [httpRequest, httpsRequest]) {
      vi.mocked(transport).mockImplementation((...args: unknown[]) => {
        const receive = args[2] as (response: PassThrough & { statusCode: number }) => void;
        return Object.assign(new EventEmitter(), {
          end() {
            queueMicrotask(() => {
              const response = Object.assign(new PassThrough(), { statusCode: upstreamFixture.status });
              receive(response);
              response.end(upstreamFixture.body);
            });
          },
        }) as ReturnType<typeof httpRequest>;
      });
    }
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each(['GET', 'POST', 'PUT', 'DELETE'])('rejects a forged ingress header on %s', async (method) => {
    const result = await request('/connection', {
      method, headers: { 'x-remote-user-id': 'forged' }, body: {},
    });
    expect(result.status).toBe(401);
    expect(readFile).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it.each(['172.30.32.2', '::ffff:172.30.32.2'])('accepts authenticated Supervisor ingress from %s', async (address) => {
    const result = await request('/connection', { address, headers: { 'x-remote-user-id': 'test-user' } });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).haToken).toBe('fake-test-token');
  });

  it('requires a user header even from the Supervisor', async () => {
    expect((await request('/connection', { address: '172.30.32.2' })).status).toBe(401);
  });

  it('preserves local development access', async () => {
    expect((await request('/connection', { address: '127.0.0.1' })).status).toBe(200);
  });

  it('preserves explicit LAN sharing', async () => {
    vi.stubEnv('ALLOW_LAN_CONNECTION', '1');
    expect((await request('/connection')).status).toBe(200);
  });

  it.each([
    '127.0.0.1', '[::1]', '[::ffff:127.0.0.1]', '[::ffff:7f00:1]',
    '[0:0:0:0:0:ffff:7f00:1]', '[::ffff:169.254.169.254]',
    '[::ffff:172.30.32.2]', '[::ffff:172.30.33.1]', '[::ffff:0.0.0.0]',
    '[fe80::1]', '[febf::1]',
  ])('blocks proxy access to %s', async (host) => {
    const result = await request('/fetch-json', { method: 'POST', body: { url: `http://${host}/` } });
    expect(result.status).toBe(403);
    expect(httpRequest).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it.each(['10.0.30.159', '192.168.1.10', '[::ffff:192.168.1.10]', '[fd00::1234]'])('allows LAN APIs at %s', async (host) => {
    const result = await request('/fetch-json', { method: 'POST', body: { url: `http://${host}/api` } });
    expect(result.status).toBe(200);
    expect(httpRequest).toHaveBeenCalledTimes(1);
    expect(JSON.parse(result.body)).toEqual({ value: 1 });
  });

  it('pins the connection lookup to the validated DNS addresses', async () => {
    const result = await request('/fetch-json', { method: 'POST', body: { url: 'https://lan-service.test/api' } });
    expect(result.status).toBe(200);
    expect(lookup).toHaveBeenCalledTimes(1);
    vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    const options = vi.mocked(httpsRequest).mock.calls[0][1] as { lookup: (...args: unknown[]) => void };
    const callback = vi.fn();
    options.lookup('lan-service.test', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [{ address: '192.168.1.10', family: 4 }]);
    options.lookup('lan-service.test', {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, '192.168.1.10', 4);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('rejects a hostname with any blocked DNS address', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '192.168.1.10', family: 4 }, { address: '127.0.0.1', family: 4 },
    ]);
    const result = await request('/fetch-json', { method: 'POST', body: { url: 'http://lan-service.test/api' } });
    expect(result.status).toBe(403);
    expect(httpRequest).not.toHaveBeenCalled();
  });

  it.each([301, 302, 307, 308])('does not follow HTTP %s redirects', async (status) => {
    upstreamFixture.status = status;
    const result = await request('/fetch-json', { method: 'POST', body: { url: 'http://192.168.1.10/api' } });
    expect(result.status).toBe(502);
    expect(httpRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized upstream response while reading it', async () => {
    upstreamFixture.body = 'x'.repeat(256 * 1024 + 1);
    const result = await request('/fetch-json', { method: 'POST', body: { url: 'http://192.168.1.10/api' } });
    expect(result.status).toBe(502);
    expect(JSON.parse(result.body).detail).toContain('upstream response too large');
  });

  it('rejects cross-site writes', async () => {
    const result = await request('/layout', {
      method: 'POST', headers: { 'sec-fetch-site': 'cross-site' }, body: [],
    });
    expect(result.status).toBe(403);
    expect(writeFile).not.toHaveBeenCalled();
  });
});