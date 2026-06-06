// Client helper for the server-side JSON fetch proxy (see vite-layout-plugin).
// Lets the dashboard pull values from a user-configured HTTP API (e.g. a
// Speedtest-Tracker container) without tripping browser CORS.

const PROXY_ENDPOINT = `${import.meta.env.BASE_URL}fetch-json`.replace(/\/\/+/g, '/');

/** Fetch a JSON document through the server proxy. Throws on failure. */
export async function proxyFetchJson(url: string, token?: string): Promise<unknown> {
  const res = await fetch(PROXY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, token: token || undefined }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data && typeof data === 'object' && 'error' in data) ? (data as { error: string }).error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

/** Extract a value from a JSON object via a dotted path ("data.download").
 *  Supports numeric array indices ("results.0.value"). */
export function getJsonPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const seg of path.split('.')) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(seg);
      cur = Number.isInteger(idx) ? cur[idx] : undefined;
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Coerce an extracted value to a number (handles "123.4 Mbps" strings). */
export function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}
