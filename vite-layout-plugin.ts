import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for the /fetch-json proxy. The proxy is meant for the user's own
 * LAN services, so private ranges (10/8, 172.16–31, 192.168, ULA v6) stay
 * allowed — but loopback, link-local/cloud-metadata, the unspecified address,
 * and the Supervisor/hassio internal network (172.30.32.0/23) must never be
 * reachable through an unauthenticated proxy from inside the HA network.
 */
function isBlockedIp(addr: string): boolean {
  // Unwrap IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) so it's checked as IPv4.
  const ip = addr.toLowerCase().startsWith('::ffff:') ? addr.slice(7) : addr;

  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    if (a === 0) return true; // 0.0.0.0/8 "this host"
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b === 30 && (c === 32 || c === 33)) return true; // hassio 172.30.32.0/23
    return false;
  }

  const v6 = ip.toLowerCase();
  if (v6 === '::1' || v6 === '::') return true; // loopback / unspecified
  if (v6.startsWith('fe80')) return true; // link-local
  // ULA (fc00::/7) is intentionally allowed — LAN IPv6 uses it.
  return false;
}

/** Resolve a hostname and return true if any resolved address is blocked, or if
 *  it can't be resolved (fail closed). Literal 'supervisor'/'localhost' are
 *  rejected outright. */
async function hostIsBlocked(hostname: string): Promise<boolean> {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'supervisor' || host === 'localhost') return true;
  if (isIP(host)) return isBlockedIp(host);
  try {
    const results = await lookup(host, { all: true });
    return results.length === 0 || results.some((r) => isBlockedIp(r.address));
  } catch {
    return true; // unresolvable — don't proxy
  }
}

function headerValue(req: IncomingMessage, name: string): string {
  const h = req.headers[name];
  return (Array.isArray(h) ? h[0] : h ?? '').trim();
}

/** The Home Assistant user id the Supervisor injects on ingress-proxied
 *  requests. Empty when the request didn't arrive through ingress (e.g. the
 *  optional direct host port), which we treat as unauthenticated. */
function ingressUserId(req: IncomingMessage): string {
  return headerValue(req, 'x-remote-user-id');
}

/** Loopback requests come from inside the container itself (local dev/preview),
 *  never from ingress or the published port — safe to treat as trusted so
 *  `npm run dev` keeps working without ingress headers. */
function isLoopback(req: IncomingMessage): boolean {
  const a = req.socket?.remoteAddress ?? '';
  return a === '::1' || a === '::ffff:127.0.0.1' || a.startsWith('127.');
}

/** Refuse obvious cross-site writes (CSRF). Modern browsers send
 *  Sec-Fetch-Site; when it's present and not same-origin we reject. Absent
 *  (older webviews) → allowed, so a legitimate kiosk is never broken. */
function isCrossSiteWrite(req: IncomingMessage): boolean {
  const site = headerValue(req, 'sec-fetch-site').toLowerCase();
  return site !== '' && site !== 'same-origin' && site !== 'none';
}

// Where the shared layout JSON lives. Override with LAYOUT_FILE so the HA
// add-on can point it at the persistent /data volume.
const LAYOUT_FILE = process.env.LAYOUT_FILE
  ? resolve(process.env.LAYOUT_FILE)
  : resolve(process.cwd(), 'layouts.json');
// Optional shared connection (URL + token) for the opt-in "remember connection
// on the server" feature. Override with CONNECTION_FILE (add-on → /data).
const CONNECTION_FILE = process.env.CONNECTION_FILE
  ? resolve(process.env.CONNECTION_FILE)
  : resolve(process.cwd(), 'connection.json');
// Shared (non-credential) app settings synced across devices (issue #8).
// Override with SETTINGS_FILE (add-on → /data).
const SETTINGS_FILE = process.env.SETTINGS_FILE
  ? resolve(process.env.SETTINGS_FILE)
  : resolve(process.cwd(), 'settings.json');
const ROUTE = '/layout';
const CONNECTION_ROUTE = '/connection';
const SETTINGS_ROUTE = '/settings';
const PROXY_ROUTE = '/fetch-json';
const MAX_BYTES = 512 * 1024;
const PROXY_MAX_BYTES = 256 * 1024;

/**
 * Tiny dev/preview middleware that lets the dashboard read and write its
 * custom layout to a JSON file in the project root (shared across devices).
 *   GET  /layout  -> 200 { ...layout } | 204 (no saved layout yet)
 *   POST /layout  -> 200 { ok: true }  (body is the layout JSON)
 *   DELETE /layout -> 200 { ok: true } (reset to defaults)
 *
 * It also exposes an opt-in shared connection so new devices can auto-connect.
 * This route stores/returns the HA token, so it is gated behind an ingress-
 * authenticated Home Assistant user (the Supervisor's X-Remote-User-Id header);
 * requests over the optional direct host port are refused:
 *   GET  /connection  -> 200 { haUrl, haToken } | 204 (not stored) | 401
 *   POST /connection  -> 200 { ok: true } | 401
 *   DELETE /connection -> 200 { ok: true } | 401
 *
 * And the shared (non-credential) app settings, synced across devices (#8):
 *   GET  /settings  -> 200 { ...settings } | 204 (none stored)
 *   POST /settings  -> 200 { ok: true }
 *   DELETE /settings -> 200 { ok: true }
 */
export function layoutApi(): Plugin {
  const handler = (server: ViteDevServer) => {
    // Prevent kiosks/browsers from caching the HTML entry point. index.html
    // references content-hashed assets, so a stale cached index.html keeps the
    // old bundle alive after an add-on update. The hashed JS/CSS stay cacheable.
    server.middlewares.use((req, res, next) => {
      const accept = req.headers.accept || '';
      const path = (req.url || '').split('?')[0];
      const isDocument =
        accept.includes('text/html') || path === '/' || path.endsWith('.html');
      if (isDocument) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
      next();
    });

    // Server-side JSON fetch proxy. Lets the dashboard pull data from a
    // user-configured HTTP API (e.g. a Speedtest-Tracker container) without
    // tripping browser CORS. The browser POSTs { url, token? }; the server
    // fetches it and streams back the JSON. Only http/https, size-capped, with
    // a short timeout. Intended for the user's own LAN services.
    server.middlewares.use(async (req, res, next) => {
      const path = (req.url || '').split('?')[0];
      if (path !== PROXY_ROUTE) return next();
      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'method not allowed' }));
        return;
      }
      if (isCrossSiteWrite(req)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'cross-site request blocked' }));
        return;
      }
      let body = '';
      let tooBig = false;
      req.on('data', (chunk) => {
        body += chunk;
        if (body.length > 8 * 1024) {
          tooBig = true;
          req.destroy();
        }
      });
      req.on('end', async () => {
        if (tooBig) {
          res.statusCode = 413;
          res.end(JSON.stringify({ error: 'request too large' }));
          return;
        }
        let target = '';
        let token = '';
        try {
          const parsed = JSON.parse(body || '{}');
          target = String(parsed.url || '');
          token = String(parsed.token || '');
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'invalid JSON body' }));
          return;
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(target);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'invalid url' }));
          return;
        }
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'only http/https allowed' }));
          return;
        }
        // SSRF guard: never let this unauthenticated proxy reach loopback,
        // link-local/metadata, or the Supervisor/hassio internal network.
        if (await hostIsBlocked(parsedUrl.hostname)) {
          res.statusCode = 403;
          res.end(JSON.stringify({ error: 'target host not allowed' }));
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        try {
          const headers: Record<string, string> = { Accept: 'application/json' };
          if (token) headers.Authorization = `Bearer ${token}`;
          const upstream = await fetch(target, { headers, signal: controller.signal });
          const text = await upstream.text();
          if (text.length > PROXY_MAX_BYTES) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: 'upstream response too large' }));
            return;
          }
          res.statusCode = upstream.ok ? 200 : 502;
          res.setHeader('Content-Type', 'application/json');
          // Pass the body through verbatim; the client extracts via JSON path.
          res.end(upstream.ok ? text : JSON.stringify({ error: `upstream ${upstream.status}`, body: text.slice(0, 500) }));
        } catch (err) {
          res.statusCode = 502;
          res.end(JSON.stringify({ error: 'fetch failed', detail: String(err).slice(0, 200) }));
        } finally {
          clearTimeout(timer);
        }
      });
    });

    server.middlewares.use(async (req, res, next) => {
      const url = (req.url || '').split('?')[0];
      const file =
        url === ROUTE
          ? LAYOUT_FILE
          : url === CONNECTION_ROUTE
            ? CONNECTION_FILE
            : url === SETTINGS_ROUTE
              ? SETTINGS_FILE
              : null;
      if (!file) return next();

      // Block cross-site (CSRF) attempts before any state change.
      const method = req.method || 'GET';
      if ((method === 'POST' || method === 'PUT' || method === 'DELETE') && isCrossSiteWrite(req)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: 'cross-site request blocked' }));
        return;
      }

      // The connection route stores/serves the HA token: gate it behind an
      // ingress-authenticated Home Assistant user and never cache it. Requests
      // that didn't come through ingress (e.g. the optional direct host port)
      // carry no user header and are refused — the token stays ingress-only.
      if (url === CONNECTION_ROUTE) {
        res.setHeader('Cache-Control', 'no-store');
        if (!isLoopback(req) && !ingressUserId(req)) {
          res.statusCode = 401;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'authentication required' }));
          return;
        }
      }

      if (req.method === 'GET') {
        try {
          const data = await readFile(file, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(data);
        } catch {
          res.statusCode = 204;
          res.end();
        }
        return;
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        let body = '';
        let tooBig = false;
        req.on('data', (chunk) => {
          body += chunk;
          if (body.length > MAX_BYTES) {
            tooBig = true;
            req.destroy();
          }
        });
        req.on('end', async () => {
          if (tooBig) {
            res.statusCode = 413;
            res.end(JSON.stringify({ error: 'payload too large' }));
            return;
          }
          try {
            const parsed = JSON.parse(body); // validate it's JSON
            await writeFile(file, JSON.stringify(parsed, null, 2), 'utf8');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'invalid JSON' }));
          }
        });
        return;
      }

      if (req.method === 'DELETE') {
        try {
          await writeFile(file, '', 'utf8');
        } catch {
          /* ignore */
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      next();
    });
  };

  return {
    name: 'ha-dashboard-layout-api',
    configureServer: handler,
    configurePreviewServer: handler as Plugin['configurePreviewServer'],
  };
}
