import { useCallback, useEffect, useRef } from 'react';

/**
 * Pointer-tracking 3D tilt for "layered parallax glass" tiles (issue #11).
 *
 * Returns a ref callback to attach to the tile element. While a fine pointer
 * (mouse/trackpad) hovers, the element is rotated slightly toward the cursor and
 * a glare hotspot follows it, driven entirely through CSS custom properties so
 * the effect composes with the existing hover lift / active press transforms:
 *   --tilt-rx / --tilt-ry  → rotateX / rotateY in degrees
 *   --tilt-gx / --tilt-gy  → glare center as a percentage
 *
 * It deliberately does nothing for coarse pointers (touch) so it never fights
 * the slide-to-dim drag gestures on wall tablets, and it honors
 * `prefers-reduced-motion`.
 *
 * @param max Maximum rotation in degrees at the tile's corners.
 */
export function useTilt(max = 10) {
  const elRef = useRef<HTMLElement | null>(null);
  const frame = useRef<number | null>(null);

  const enabled = useRef(true);
  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      enabled.current = finePointer.matches && !reduced.matches;
    };
    update();
    finePointer.addEventListener('change', update);
    reduced.addEventListener('change', update);
    return () => {
      finePointer.removeEventListener('change', update);
      reduced.removeEventListener('change', update);
    };
  }, []);

  const reset = useCallback((el: HTMLElement) => {
    el.style.setProperty('--tilt-rx', '0deg');
    el.style.setProperty('--tilt-ry', '0deg');
    el.style.setProperty('--tilt-gx', '50%');
    el.style.setProperty('--tilt-gy', '50%');
    el.classList.remove('tilting');
  }, []);

  const onMove = useCallback(
    (e: PointerEvent) => {
      const el = elRef.current;
      if (!el || !enabled.current || e.pointerType !== 'mouse') return;
      if (frame.current != null) cancelAnimationFrame(frame.current);
      const { clientX, clientY } = e;
      frame.current = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        // Pointer position within the tile, normalized to -0.5…0.5.
        const px = (clientX - r.left) / r.width - 0.5;
        const py = (clientY - r.top) / r.height - 0.5;
        // Tilt toward the cursor: top pulls back (+rotateX), right pushes in.
        el.style.setProperty('--tilt-rx', `${(-py * max).toFixed(2)}deg`);
        el.style.setProperty('--tilt-ry', `${(px * max).toFixed(2)}deg`);
        el.style.setProperty('--tilt-gx', `${((px + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty('--tilt-gy', `${((py + 0.5) * 100).toFixed(1)}%`);
        el.classList.add('tilting');
      });
    },
    [max],
  );

  const onLeave = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    if (frame.current != null) cancelAnimationFrame(frame.current);
    reset(el);
  }, [reset]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (elRef.current) {
        elRef.current.removeEventListener('pointermove', onMove);
        elRef.current.removeEventListener('pointerleave', onLeave);
        elRef.current.removeEventListener('pointercancel', onLeave);
      }
      elRef.current = node;
      if (node) {
        node.addEventListener('pointermove', onMove);
        node.addEventListener('pointerleave', onLeave);
        node.addEventListener('pointercancel', onLeave);
      }
    },
    [onMove, onLeave],
  );

  useEffect(() => {
    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
    };
  }, []);

  return ref;
}
