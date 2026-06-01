/**
 * Lightweight haptic feedback. `navigator.vibrate` only does anything on
 * devices that expose the Vibration API (Android / some tablets); it's a no-op
 * elsewhere, so this is safe to call unconditionally.
 */
export function haptic(ms = 8): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  navigator.vibrate(ms);
}

/** Interactive surfaces that should buzz on press. */
const HAPTIC_SELECTOR =
  '.tile, button, [role="button"], .scene-pill, .room-nav-pill, .sidebar-btn, .glance-stat, input[type="range"]';

/**
 * Install a single delegated pointerdown listener so any tap on an interactive
 * surface gives a tiny physical buzz — no need to wire every handler.
 * Returns a disposer.
 */
export function installHaptics(): () => void {
  if (typeof document === 'undefined') return () => {};
  const onDown = (e: PointerEvent) => {
    // Only react to real touch / pen taps; mouse clicks shouldn't buzz.
    if (e.pointerType === 'mouse') return;
    const target = e.target as Element | null;
    if (target?.closest(HAPTIC_SELECTOR)) haptic(8);
  };
  document.addEventListener('pointerdown', onDown, { passive: true });
  return () => document.removeEventListener('pointerdown', onDown);
}
