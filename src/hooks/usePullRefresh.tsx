import { useEffect, useRef } from 'react';
import { haptic } from '../lib/haptics';

interface Options {
  /** Master switch (Settings toggle; also off while editing). */
  enabled: boolean;
  /** Indicator travel, in px, at which releasing triggers a refresh. */
  threshold?: number;
  /** Called when the user releases past the threshold. */
  onRefresh: () => void;
}

/** Ignore this much initial downward travel so taps and tiny scroll nudges
 *  never wiggle the indicator. */
const SLOP = 12;
/** The indicator's asymptotic max travel — the rubber band never quite gets
 *  here, which is what makes the stretch feel elastic. */
const MAX_PULL = 150;

/** iOS-style rubber-band resistance: early pixels track the finger ~1:1,
 *  later ones fight back harder, approaching MAX_PULL asymptotically. */
function rubber(dy: number): number {
  return MAX_PULL * (1 - Math.exp(-dy / 210));
}

/**
 * Pull-to-refresh for the main scroll area (issue #21).
 *
 * Touch-only by design: dragging down while the container is scrolled to the
 * very top stretches a floating indicator with rubber-band resistance; release
 * past the threshold reloads the app (fresh code + a clean HA socket — the
 * kiosk/tablet "unstick it" gesture), release earlier and it springs back.
 *
 * The gesture drives the indicator element directly (CSS var + classes) instead
 * of going through React state — touchmove fires every frame and re-rendering
 * App at that rate would jank the very animation being drawn.
 */
export function usePullRefresh(
  scrollRef: React.RefObject<HTMLElement | null>,
  indicatorRef: React.RefObject<HTMLElement | null>,
  { enabled, threshold = 80, onRefresh }: Options,
) {
  // Keep latest values without re-binding listeners each render.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    // 'idle' → not eligible; 'watching' → touch began at top, direction not yet
    // known; 'pulling' → vertical pull established, we own the gesture.
    let phase: 'idle' | 'watching' | 'pulling' = 'idle';
    let armed = false;
    let refreshing = false;

    const indicator = () => indicatorRef.current;

    const setPull = (px: number) => {
      indicator()?.style.setProperty('--ptr-pull', `${px}px`);
    };

    const reset = () => {
      phase = 'idle';
      armed = false;
      const ind = indicator();
      if (ind && !refreshing) {
        ind.classList.remove('pulling', 'armed');
        setPull(0);
      }
    };

    const onStart = (e: TouchEvent) => {
      if (!enabledRef.current || refreshing || e.touches.length !== 1) return;
      if (el.scrollTop > 0) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      phase = 'watching';
    };

    const onMove = (e: TouchEvent) => {
      if (phase === 'idle' || refreshing) return;
      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (phase === 'watching') {
        // Scrolled away, moved up, or clearly horizontal (page swipe) — let the
        // browser have it.
        if (el.scrollTop > 0 || dy < 0 || (Math.abs(dx) > SLOP && Math.abs(dx) > dy * 1.2)) {
          phase = 'idle';
          return;
        }
        if (dy <= SLOP) return; // not committed yet
        phase = 'pulling';
        indicator()?.classList.add('pulling');
      }

      // We own the gesture now: stop the native scroll/overscroll from moving.
      e.preventDefault();
      const pull = rubber(Math.max(0, dy - SLOP));
      setPull(pull);
      indicator()?.style.setProperty('--ptr-frac', String(Math.min(1, pull / threshold)));

      const nowArmed = pull >= threshold;
      if (nowArmed !== armed) {
        armed = nowArmed;
        indicator()?.classList.toggle('armed', nowArmed);
        haptic(nowArmed ? 12 : 6); // tick when crossing the line (both ways)
      }
    };

    const onEnd = () => {
      if (phase !== 'pulling') {
        phase = 'idle';
        return;
      }
      if (armed && !refreshing) {
        refreshing = true;
        const ind = indicator();
        ind?.classList.add('refreshing');
        setPull(threshold * 0.75); // settle the spinner to a resting spot
        haptic(18);
        // Let the spinner render a beat before the reload tears the page down.
        setTimeout(() => refreshRef.current(), 350);
      } else {
        reset();
      }
    };

    // A cancelled touch (incoming call, browser gesture takeover) must never
    // refresh — just spring back, however far the pull got.
    const onCancel = () => reset();

    // touchmove must be non-passive: owning the pull means preventDefault().
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onCancel);
    };
  }, [scrollRef, indicatorRef, threshold]);
}

/** The floating elastic indicator the gesture drives. Rendered once in App;
 *  all motion happens through --ptr-pull/--ptr-frac and the phase classes. */
export function PullRefreshIndicator({ innerRef }: { innerRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="ptr-indicator" ref={innerRef} aria-hidden="true">
      <span className="mdi mdi-arrow-down ptr-arrow" />
      <span className="mdi mdi-refresh ptr-spinner" />
    </div>
  );
}
