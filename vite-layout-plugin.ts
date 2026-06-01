import type { Plugin, ViteDevServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const LAYOUT_FILE = resolve(process.cwd(), 'layouts.json');
const ROUTE = '/layout';
const MAX_BYTES = 512 * 1024;

/**
 * Tiny dev/preview middleware that lets the dashboard read and write its
 * custom layout to a JSON file in the project root (shared across devices).
 *   GET  /layout  -> 200 { ...layout } | 204 (no saved layout yet)
 *   POST /layout  -> 200 { ok: true }  (body is the layout JSON)
 *   DELETE /layout -> 200 { ok: true } (reset to defaults)
 */
export function layoutApi(): Plugin {
  const handler = (server: ViteDevServer) => {
    server.middlewares.use(async (req, res, next) => {
      const url = (req.url || '').split('?')[0];
      if (url !== ROUTE) return next();

      if (req.method === 'GET') {
        try {
          const data = await readFile(LAYOUT_FILE, 'utf8');
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
            await writeFile(LAYOUT_FILE, JSON.stringify(parsed, null, 2), 'utf8');
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
          await writeFile(LAYOUT_FILE, '', 'utf8');
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
