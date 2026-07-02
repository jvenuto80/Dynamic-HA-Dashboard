import { getSettings } from '../settings';

/** How the scene-activation color wash plays (issue #17). */
export type SceneWashStyle = 'burst' | 'curtain' | 'glow' | 'off';

export const SCENE_WASH_STYLES: SceneWashStyle[] = ['burst', 'curtain', 'glow', 'off'];

// Current style, read once from settings then kept fresh by the Settings
// modal's live-preview event — same idiom as the other appearance toggles.
let current: SceneWashStyle | null = null;
function activeStyle(): SceneWashStyle {
  if (current === null) {
    current = getSettings().sceneWash;
    window.addEventListener('ha:scene-wash', (e) => {
      current = (e as CustomEvent<SceneWashStyle>).detail;
    });
  }
  return current;
}

/** Where a burst emanates from, in viewport coordinates (the tapped pill). */
export interface WashOrigin {
  x: number;
  y: number;
}

/**
 * Play a quick full-screen color wash in the scene's color (issue #17).
 *
 * Fire-and-forget: builds a pointer-events-none overlay, animates it with the
 * Web Animations API, and removes it when done — nothing re-renders and nothing
 * persists. Rapid taps overlap harmlessly (each wash cleans itself up).
 * No-op when the style is 'off' or the user prefers reduced motion.
 */
export function playSceneWash(color: string, origin?: WashOrigin, styleOverride?: SceneWashStyle): void {
  const style = styleOverride ?? activeStyle();
  if (style === 'off') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const layer = document.createElement('div');
  layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:500;overflow:hidden;';
  document.body.appendChild(layer);
  const done = () => layer.remove();
  // Safety net: never leave a stray overlay if an animation is interrupted.
  setTimeout(done, 1600);

  const w = window.innerWidth;
  const h = window.innerHeight;

  if (style === 'burst') {
    const x = origin?.x ?? w / 2;
    const y = origin?.y ?? h / 2;
    // Big enough to cover the far corner from the tap point.
    const d = Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) * 2.2;
    const ring = document.createElement('div');
    ring.style.cssText =
      `position:absolute;left:${x - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px;` +
      `border-radius:50%;background:radial-gradient(circle, ${color}cc 0%, ${color}55 35%, transparent 68%);`;
    layer.appendChild(ring);
    ring.animate(
      [
        { transform: 'scale(0.02)', opacity: 0.95 },
        { transform: 'scale(0.55)', opacity: 0.5, offset: 0.55 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      { duration: 750, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    ).onfinish = done;
    tint(layer, color);
    return;
  }

  if (style === 'curtain') {
    const sheet = document.createElement('div');
    sheet.style.cssText =
      `position:absolute;inset:0;background:linear-gradient(180deg, ${color}e6 0%, ${color}88 45%, transparent 100%);`;
    layer.appendChild(sheet);
    sheet.animate(
      [
        { transform: 'translateY(-101%)', opacity: 1 },
        { transform: 'translateY(0)', opacity: 0.75, offset: 0.45 },
        { transform: 'translateY(35%)', opacity: 0 },
      ],
      { duration: 800, easing: 'cubic-bezier(0.3, 0.9, 0.35, 1)' },
    ).onfinish = done;
    return;
  }

  // 'glow' — the screen edges pulse in the scene color, like bias lighting.
  const vignette = document.createElement('div');
  vignette.style.cssText = `position:absolute;inset:0;box-shadow:inset 0 0 12vmax 4vmax ${color};`;
  layer.appendChild(vignette);
  vignette.animate(
    [{ opacity: 0 }, { opacity: 0.9, offset: 0.3 }, { opacity: 0 }],
    { duration: 900, easing: 'ease-in-out' },
  ).onfinish = done;
  tint(layer, color);
}

/** Faint full-screen tint that rides under the burst/glow so the whole frame
 *  breathes in the scene color for a beat. Cleans up with the parent layer. */
function tint(layer: HTMLElement, color: string): void {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute;inset:0;background:${color};mix-blend-mode:screen;`;
  layer.appendChild(el);
  el.animate([{ opacity: 0 }, { opacity: 0.14, offset: 0.3 }, { opacity: 0 }], {
    duration: 650,
    easing: 'ease-out',
  });
}
