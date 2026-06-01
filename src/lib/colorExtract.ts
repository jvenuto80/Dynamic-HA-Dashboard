// Extract a vibrant dominant color from an image URL for ambient tinting.
//
// Loads the image with CORS, downsamples it onto a tiny offscreen canvas, then
// buckets the pixels and picks the bucket with the best "vibrancy" (saturation
// weighted, avoiding near-black/near-white). Results are cached per URL.
//
// If the image is cross-origin without CORS headers the canvas becomes tainted
// and pixel reads throw — in that case we resolve to `null` and callers simply
// skip the tint.

export interface ArtworkColor {
  /** `r, g, b` triplet, 0–255. */
  rgb: [number, number, number];
}

const cache = new Map<string, ArtworkColor | null>();
const inflight = new Map<string, Promise<ArtworkColor | null>>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function analyze(img: HTMLImageElement): ArtworkColor | null {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, size, size);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, size, size).data;
  } catch {
    // Tainted canvas (cross-origin without CORS) — give up gracefully.
    return null;
  }

  // Bucket colors into a coarse grid and score each by vibrancy * frequency.
  const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    const [, s, l] = rgbToHsl(r, g, b);
    // Skip near-black, near-white, and washed-out greys.
    if (l < 0.12 || l > 0.92 || s < 0.18) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const prev = buckets.get(key);
    // Favor mid-bright, saturated colors.
    const vibrancy = s * (1 - Math.abs(l - 0.55));
    if (prev) {
      prev.r += r;
      prev.g += g;
      prev.b += b;
      prev.n += 1;
      prev.score += vibrancy;
    } else {
      buckets.set(key, { r, g, b, n: 1, score: vibrancy });
    }
  }

  let best: { r: number; g: number; b: number; n: number; score: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.score > best.score) best = bucket;
  }
  if (!best) return null;

  return { rgb: [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] };
}

/** Extract (and cache) the dominant color for an artwork URL. */
export function extractArtworkColor(url: string): Promise<ArtworkColor | null> {
  if (cache.has(url)) return Promise.resolve(cache.get(url) ?? null);
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = new Promise<ArtworkColor | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const result = analyze(img);
      cache.set(url, result);
      inflight.delete(url);
      resolve(result);
    };
    img.onerror = () => {
      cache.set(url, null);
      inflight.delete(url);
      resolve(null);
    };
    img.src = url;
  });
  inflight.set(url, p);
  return p;
}
