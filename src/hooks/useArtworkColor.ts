import { useEffect, useState } from 'react';
import { extractArtworkColor } from '../lib/colorExtract';

/**
 * Resolve a vibrant dominant color (as an `r, g, b` string) for an artwork URL.
 * Returns `null` until loaded, or if extraction fails (tainted/cross-origin).
 */
export function useArtworkColor(url: string | undefined): string | null {
  const [rgb, setRgb] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setRgb(null);
      return;
    }
    let active = true;
    extractArtworkColor(url).then((c) => {
      if (active) setRgb(c ? `${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]}` : null);
    });
    return () => {
      active = false;
    };
  }, [url]);

  return rgb;
}
