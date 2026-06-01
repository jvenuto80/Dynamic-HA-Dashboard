import { flushSync } from 'react-dom';

/** Whether shared-element View Transitions should be used right now. */
export function viewTransitionsAvailable(): boolean {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return typeof document.startViewTransition === 'function' && !reduced;
}

/**
 * Run a React state update inside a View Transition so the browser can morph
 * shared elements (those given a matching `view-transition-name`).
 *
 * `flushSync` forces React to apply the DOM change synchronously inside the
 * transition callback, which the API requires. `afterUpdate` runs immediately
 * after the new DOM is committed but before the browser snapshots the new
 * state — use it to clear transient `view-transition-name`s so the same name
 * never appears twice in a single state.
 *
 * Returns the transition's `finished` promise (or a resolved promise on the
 * fallback path) so callers can clean up afterwards.
 */
export function runViewTransition(update: () => void, afterUpdate?: () => void): Promise<void> {
  if (!viewTransitionsAvailable() || !document.startViewTransition) {
    update();
    afterUpdate?.();
    return Promise.resolve();
  }

  // Flag the transition so entrance animations (e.g. the flyout spring) can be
  // suppressed — otherwise the panel would be mid-slide when the browser
  // snapshots the "new" state, giving the shared element a wrong morph target.
  // The flag stays on while the panel is open (cleared by the panel's owner on
  // close) so the spring entrance doesn't replay once the morph finishes.
  document.documentElement.classList.add('vt-active');
  const transition = document.startViewTransition(() => {
    flushSync(update);
    afterUpdate?.();
  });
  return transition.finished;
}
