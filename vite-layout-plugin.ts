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
const MAX_BYTES = 512 * 1024;

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
