import type { Plugin, ViteDevServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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
const ROUTE = '/layout';
const CONNECTION_ROUTE = '/connection';
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
 * It also exposes an opt-in shared connection so new devices can auto-connect:
 *   GET  /connection  -> 200 { haUrl, haToken } | 204 (not stored)
 *   POST /connection  -> 200 { ok: true }
 *   DELETE /connection -> 200 { ok: true }
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
      const file = url === ROUTE ? LAYOUT_FILE : url === CONNECTION_ROUTE ? CONNECTION_FILE : null;
      if (!file) return next();

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
