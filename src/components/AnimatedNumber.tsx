import { useEffect, useRef, useState } from 'react';

interface Props {
  /** Target numeric value to animate toward. */
  value: number;
  /** Decimal places to display. */
  decimals?: number;
  /** Animation duration in ms. */
  duration?: number;
  /** Optional text rendered after the number (e.g. "°"). */
  suffix?: string;
}

/**
 * Smoothly counts from the previous value to the new one whenever `value`
 * changes, using an eased rAF tween. Respects reduced-motion (snaps instantly).
 */
export function AnimatedNumber({ value, decimals = 0, duration = 600, suffix = '' }: Props) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    const to = value;
    if (reduced || from === to) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      fromRef.current = to;
    };
  }, [value, duration]);

  return <>{display.toFixed(decimals)}{suffix}</>;
}
