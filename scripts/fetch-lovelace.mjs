// One-off: pull all Lovelace dashboards + their configs from HA via the WS API.
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const URL_HA = (env.match(/VITE_HA_URL=(.*)/) || [])[1].trim();
const TOKEN = (env.match(/VITE_HA_TOKEN=(.*)/) || [])[1].trim();
const WS = URL_HA.replace(/^http/, 'ws') + '/api/websocket';

const ws = new WebSocket(WS);
let id = 1;
const pending = new Map();

function send(msg) {
  const mid = id++;
  ws.send(JSON.stringify({ id: mid, ...msg }));
  return new Promise((res) => pending.set(mid, res));
}

ws.addEventListener('message', async (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.type === 'auth_required') {
    ws.send(JSON.stringify({ type: 'auth', access_token: TOKEN }));
    return;
  }
  if (msg.type === 'auth_invalid') {
    console.error('AUTH FAILED:', msg.message);
    process.exit(1);
  }
  if (msg.type === 'auth_ok') {
    // List dashboards
    const dash = await send({ type: 'lovelace/dashboards/list' });
    const dashboards = dash.result || [];
    const out = { dashboards: [] };

    // Default (overview) dashboard has url_path null
    const targets = [{ id: null, title: 'Overview (default)', url_path: 'lovelace' }, ...dashboards];

    for (const d of targets) {
      try {
        const cfg = await send({
          type: 'lovelace/config',
          url_path: d.url_path === 'lovelace' ? null : d.url_path,
        });
        out.dashboards.push({
          title: d.title,
          url_path: d.url_path,
          mode: d.mode,
          config: cfg.result,
        });
      } catch (e) {
        out.dashboards.push({ title: d.title, url_path: d.url_path, error: String(e) });
      }
    }

    console.log(JSON.stringify(out, null, 2));
    ws.close();
    process.exit(0);
  }
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});

ws.addEventListener('error', (e) => {
  console.error('WS ERROR', e.message || e);
  process.exit(1);
});
