import { useEffect, useState } from 'react';

/**
 * True once there has been no user input (pointer, touch, key, wheel) for
 * `timeoutMs`. Any activity flips back to false immediately. A `timeoutMs` of
 * 0 disables detection entirely (never idle).
 *
 * Re-arming the timer is throttled to once a second so a continuously moving
 * pointer doesn't thrash clearTimeout/setTimeout on every mousemove — at the
 * minutes-scale timeouts this is used with, firing up to 1s early is harmless.
 */
export function useIdle(timeoutMs: number): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!timeoutMs) {
      setIdle(false);
      return;
    }
    let timer: number | undefined;
    let lastArm = 0;
    const reset = () => {
      setIdle(false);
      const now = Date.now();
      if (now - lastArm < 1000) return;
      lastArm = now;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), timeoutMs);
    };
    const events = ['pointerdown', 'pointermove', 'touchstart', 'keydown', 'wheel'] as const;
    for (const ev of events) window.addEventListener(ev, reset, { passive: true });
    reset();
    return () => {
      window.clearTimeout(timer);
      for (const ev of events) window.removeEventListener(ev, reset);
    };
  }, [timeoutMs]);

  return idle;
}
