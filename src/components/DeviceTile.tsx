import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { entityIcon, entitySummary, isActiveState, resolveArtwork } from '../lib/entityInfo';
import { useArtworkColor } from '../hooks/useArtworkColor';
import { runViewTransition, viewTransitionsAvailable } from '../lib/viewTransition';
import { useTilt } from '../hooks/useTilt';
import { useCameraFeed } from '../hooks/useCameraFeed';
import { Sparkline } from './Sparkline';
import { HA_URL } from '../config';
import { getSettings } from '../settings';

type CallHA = (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => Promise<void>;

interface Props {
  entity: HassEntity;
  name: string;
  callHA: CallHA;
  onToggle: (entityId: string) => void;
  onOpenDetail: (entityId: string) => void;
  /** Full-bleed now-playing takeover (issue #18). When provided, tapping a
   *  playing media tile that shows artwork opens it instead of the flyout
   *  (the ⋯ button still opens the flyout). */
  onOpenTakeover?: (entityId: string) => void;
  span?: boolean;
  tall?: boolean;
  graph?: boolean;
  getHistory?: (entityId: string, hours?: number, attribute?: string) => Promise<number[]>;
  /** When set, a live camera thumbnail is shown in the tile's empty space. */
  cameraUrl?: string;
  /** Optional custom MDI icon (e.g. "mdi-garage") overriding the domain default. */
  icon?: string;
  /** Drag horizontally across the tile to dim the light (brightness shown as fill). */
  slideDim?: boolean;
  /** Reverse the cover position slider direction. */
  reverseSlider?: boolean;
  /** Show now-playing artwork as the tile background (media players). */
  mediaArtwork?: boolean;
  /** Companion media_player entity to pull now-playing artwork from. */
  artworkEntity?: string;
  /** All entities, used to resolve companion artwork for media tiles. */
  entities?: HassEntities;
  /** Position index used to stagger the tile's entrance animation. */
  enterIndex?: number;
}

const TOGGLEABLE = ['light', 'switch', 'input_boolean', 'fan', 'lock'];
// Momentary one-shot tiles: a tap runs the action (script.turn_on /
// scene.turn_on / button.press, handled by toggleEntity) but they have no
// persistent on/off state, so they skip the optimistic toggle flip.
const ACTIVATABLE = ['script', 'scene', 'button'];

// ── Quiet status dots (issue #15) ──
// A near-invisible dot on each participating tile that pulses once when the
// entity meaningfully changes, then goes quiet again — ambient "what just
// changed" awareness without a constantly animating dashboard.

/** The value whose *transition* deserves a pulse, or null for tiles that stay
 *  quiet. Deliberately restrained: discrete changes only (on/off, open/closed,
 *  locked/unlocked, motion, play state, hvac mode / target temp). Numeric
 *  sensors and cameras tick continuously and would turn the dashboard into a
 *  slot machine, so they don't participate at all. */
function statusSignature(entity: HassEntity): string | null {
  const domain = entity.entity_id.split('.')[0];
  switch (domain) {
    case 'light':
    case 'switch':
    case 'input_boolean':
    case 'fan':
    case 'lock':
    case 'cover':
    case 'binary_sensor':
    case 'vacuum':
    case 'media_player':
    case 'person':
    case 'script':
    case 'button':
    case 'scene':
      return entity.state;
    case 'climate':
      // Mode changes and target-temperature changes are both deliberate acts.
      return `${entity.state}|${entity.attributes.temperature ?? ''}`;
    default:
      return null;
  }
}

/** Live-updating "status dots enabled" preference (Settings → Appearance). */
function useStatusDots(): boolean {
  const [on, setOn] = useState(() => getSettings().statusDots);
  useEffect(() => {
    const onChange = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener('ha:status-dots', onChange);
    return () => window.removeEventListener('ha:status-dots', onChange);
  }, []);
  return on;
}

/** Pulse once whenever the signature changes (never on mount/remount). */
function useStatusPulse(signature: string | null, enabled: boolean): boolean {
  const [pulsing, setPulsing] = useState(false);
  const prev = useRef(signature);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const changed = signature != null && prev.current != null && prev.current !== signature;
    prev.current = signature;
    if (!changed || !enabled) return;
    setPulsing(false);
    // Restart the CSS animation on back-to-back changes: drop the class for a
    // frame, then re-add it.
    requestAnimationFrame(() => setPulsing(true));
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPulsing(false), 2000);
  }, [signature, enabled]);
  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );
  return pulsing;
}

/** Approximate an RGB triplet for a color temperature in Kelvin (1000–12000). */
function kelvinToRgb(kelvin: number): [number, number, number] {
  const t = Math.max(1000, Math.min(12000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
  }
  if (t >= 66) b = 255;
  else if (t <= 19) b = 0;
  else b = 138.52 * Math.log(t - 10) - 305.04;
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return [clamp(r), clamp(g), clamp(b)];
}

/** Derive the on-screen color for a light from its current attributes. */
function lightColorRgb(attrs: HassEntity['attributes']): [number, number, number] {
  const rgb = attrs.rgb_color as [number, number, number] | undefined;
  if (rgb && rgb.length === 3) return rgb;
  const kelvin = attrs.color_temp_kelvin as number | undefined;
  if (kelvin) return kelvinToRgb(kelvin);
  const mireds = attrs.color_temp as number | undefined;
  if (mireds) return kelvinToRgb(1_000_000 / mireds);
  // Default warm bulb tone.
  return [255, 170, 90];
}

/** Build the proxy URL for a vacuum's companion map camera (`camera.<base>_map`),
 *  if the integration exposes one. Returns undefined for vacuums without a map. */
function vacuumMapUrl(entities: HassEntities | undefined, base: string): string | undefined {
  if (!entities) return undefined;
  const cam = entities[`camera.${base}_map`];
  if (!cam || cam.state === 'unavailable') return undefined;
  const pic = cam.attributes.entity_picture as string | undefined;
  if (pic) {
    const url = pic.startsWith('http') ? pic : `${HA_URL}${pic}`;
    // Strip the volatile `&v=<timestamp>` cache-buster HA appends on every map
    // frame so the tile background stays stable instead of reloading (and
    // flashing) every few seconds. The signed `token` is preserved, and the
    // tile still refreshes when that token rotates. The flyout map keeps the
    // live, per-frame URL.
    return url.replace(/[?&]v=\d+/, '');
  }
  const token = cam.attributes.access_token as string | undefined;
  if (!token) return undefined;
  return `${HA_URL}/api/camera_proxy/camera.${base}_map?token=${token}`;
}

export function DeviceTile({ entity, name, callHA, onToggle, onOpenDetail, onOpenTakeover, span, tall, graph, getHistory, cameraUrl, icon, slideDim, reverseSlider, mediaArtwork, artworkEntity, entities, enterIndex }: Props) {
  const { t } = useTranslation();
  const id = entity.entity_id;
  const domain = id.split('.')[0];
  const active = isActiveState(entity.state);
  // A custom per-tile icon overrides the domain/state default everywhere the
  // tile draws its glyph.
  const tileIcon = icon || entityIcon(id, entity.state);
  // Pointer-tracking parallax tilt (mouse only; no-op on touch / reduced-motion).
  const tiltRef = useTilt();

  // Quiet status dot (issue #15): pulses once on a meaningful change.
  const dotsEnabled = useStatusDots();
  const statusSig = statusSignature(entity);
  const pulsing = useStatusPulse(statusSig, dotsEnabled);
  const statusDot =
    dotsEnabled && statusSig != null ? (
      <span className={`tile-status-dot ${pulsing ? 'pulse' : ''}`} aria-hidden="true" />
    ) : null;

  const brightness = entity.attributes.brightness as number | undefined;
  const dimmable = domain === 'light' && active && brightness != null;
  const position = entity.attributes.current_position as number | undefined;
  const isCover = domain === 'cover' && position != null;
  const isVacuum = domain === 'vacuum';

  // local slider value for smooth dragging
  const [local, setLocal] = useState<number | null>(null);
  useEffect(() => {
    setLocal(null);
  }, [brightness, position]);

  // ── Optimistic toggle feedback ──
  // On tap we flip the glow immediately, before Home Assistant confirms, so the
  // tile feels instant. The override clears as soon as the real state streams in
  // (the effect below), with a timeout fallback in case the call fails.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const optimisticTimer = useRef<number | null>(null);
  useEffect(() => {
    setOptimistic(null);
    if (optimisticTimer.current != null) {
      window.clearTimeout(optimisticTimer.current);
      optimisticTimer.current = null;
    }
  }, [entity.state]);
  useEffect(
    () => () => {
      if (optimisticTimer.current != null) window.clearTimeout(optimisticTimer.current);
    },
    [],
  );
  const effectiveActive = optimistic ?? active;

  // Live camera thumbnail. `cameraUrl` carries HA's signed `entity_picture`
  // token, which HA rotates every few minutes and pushes over the WebSocket —
  // useCameraFeed owns the refresh loop, pausing on failed frames, hidden tabs,
  // sleep/wake gaps, and socket drops so we never spam HA with a rotated-out
  // token (each such request is logged as "invalid authentication" by http.ban).
  const { src: liveCamUrl, onLoad: onCamLoad, onError: onCamError } = useCameraFeed(cameraUrl, 2000);

  // Now-playing artwork background for media tiles (on by default; opt out via
  // `mediaArtwork: false`). Resolves the configured entity's own picture, an
  // explicit companion entity, or a matching companion player on the same device.
  const artworkUrl =
    mediaArtwork !== false && domain === 'media_player' && !['off', 'unavailable', 'standby'].includes(entity.state)
      ? resolveArtwork(entity, id, entities ?? {}, artworkEntity)
      : undefined;
  // Ambient tint pulled from the artwork's dominant color.
  const artTint = useArtworkColor(artworkUrl);

  // Live emitted color for light tiles — drives the tile glow to match the bulb.
  const liveLight =
    domain === 'light' && entity.state === 'on'
      ? lightColorRgb(entity.attributes).join(', ')
      : undefined;

  // Shared-element transition: morph the tile artwork into the flyout artwork.
  const artworkRef = useRef<HTMLDivElement | null>(null);
  const openDetail = (eid: string) => {
    const el = artworkRef.current;
    if (!el || !viewTransitionsAvailable()) {
      onOpenDetail(eid);
      return;
    }
    // Name the tile artwork so it pairs with the flyout artwork during the
    // transition, then clear it inside the transition (before the new snapshot)
    // so the name isn't duplicated by the flyout's own copy.
    el.style.viewTransitionName = 'media-artwork';
    runViewTransition(
      () => onOpenDetail(eid),
      () => { el.style.viewTransitionName = ''; },
    );
  };

  // history for sensor graph tiles
  const [history, setHistory] = useState<number[]>([]);
  useEffect(() => {
    if (!graph || !getHistory) return;
    let cancelled = false;
    getHistory(id, 24).then((data) => {
      if (!cancelled) setHistory(data);
    });
    return () => {
      cancelled = true;
    };
  }, [graph, getHistory, id, entity.state]);

  // ── Mini trend sparkline for regular sensor/climate tiles (issue #14) ──
  // Numeric sensors plot their state; climates plot the `current_temperature`
  // attribute (their state is the hvac mode, not a number). Rendered as a faint
  // background behind the tile content. Skipped for the big server-tab graph
  // tile and when no history fetcher is available. Refreshed on a slow timer
  // rather than on every state change to keep history calls light.
  const sparkAttr =
    domain === 'climate' && typeof entity.attributes.current_temperature === 'number'
      ? 'current_temperature'
      : undefined;
  const sparkEligible =
    !graph &&
    !!getHistory &&
    (sparkAttr != null ||
      (domain === 'sensor' && Number.isFinite(parseFloat(entity.state))));
  const [spark, setSpark] = useState<number[]>([]);
  useEffect(() => {
    if (!sparkEligible || !getHistory) {
      setSpark([]);
      return;
    }
    let cancelled = false;
    const load = () =>
      getHistory(id, 24, sparkAttr).then((data) => {
        if (!cancelled) setSpark(data);
      });
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sparkEligible, getHistory, id, sparkAttr]);

  const sliderVal = local ?? (dimmable ? Math.round((brightness! / 255) * 100) : isCover ? position! : 0);

  // For covers we can optionally flip the slider so it visually matches how the
  // cover moves (e.g. left = open). The displayed/range value is flipped, but the
  // value we read & write to HA is always the true position percent.
  const coverReverse = isCover && !!reverseSlider;
  const sliderDisplay = coverReverse ? 100 - sliderVal : sliderVal;
  const fromSlider = (raw: number) => (coverReverse ? 100 - raw : raw);

  // ── Slide across the tile: lights dim, covers set position ──
  // Enabled by default for dimmable lights and (non-tall) covers; users can opt a
  // specific tile out by setting slideDim to false in tile settings.
  const slideLight = slideDim !== false && domain === 'light' && active;
  const slideCover = slideDim !== false && isCover && !tall;
  const slideEnabled = slideLight || slideCover;
  const dragRef = useRef<{ startX: number; startY: number; width: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const holdTimer = useRef<number | null>(null);
  const heldRef = useRef(false);
  const [dragPct, setDragPct] = useState<number | null>(null);
  const brightnessPct = dimmable ? Math.round((brightness! / 255) * 100) : 100;
  // Resting fill: brightness for lights, displayed position for covers.
  const slideRestPct = slideCover ? sliderDisplay : brightnessPct;
  const dimFillPct = dragPct ?? slideRestPct;

  // Light fill takes the bulb's real color and tracks brightness; cover fill uses
  // a cool neutral tint and tracks the open position. Both keep the glass look.
  const [lr, lg, lb] = slideLight ? lightColorRgb(entity.attributes) : [255, 170, 90];
  const dimIntensity = 0.1 + (dimFillPct / 100) * 0.28; // 0.10 → 0.38 alpha
  const coverIntensity = 0.14 + (dimFillPct / 100) * 0.26;
  const slideFill = slideCover
    ? `rgba(150, 192, 236, ${coverIntensity})`
    : `rgba(${lr}, ${lg}, ${lb}, ${dimIntensity})`;
  const slideEdge = slideCover
    ? `rgba(176, 210, 245, ${Math.min(0.75, coverIntensity + 0.25)})`
    : `rgba(${lr}, ${lg}, ${lb}, ${Math.min(0.7, dimIntensity + 0.22)})`;

  const HOLD_MS = 450; // press-and-hold (no movement) opens the flyout
  const MOVE_THRESHOLD = 6; // px of travel before a press becomes a drag

  const clearHold = () => {
    if (holdTimer.current != null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  // Universal press-and-hold → open flyout. Works on every tile; a quick tap
  // still runs the primary action and a horizontal drag still dims (when enabled).
  const onSlidePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, width: rect.width, left: rect.left, moved: false };
    if (slideEnabled) e.currentTarget.setPointerCapture(e.pointerId);
    heldRef.current = false;
    clearHold();
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      suppressClick.current = true; // the click that follows release shouldn't toggle
      onOpenDetail(id);
    }, HOLD_MS);
  };
  const onSlidePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (!d.moved) {
      const dx = Math.abs(e.clientX - d.startX);
      const dy = Math.abs(e.clientY - d.startY);
      if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
        d.moved = true;
        clearHold(); // any movement cancels the pending hold
      }
    }
    if (d.moved && slideEnabled) {
      const pct = Math.round(((e.clientX - d.left) / d.width) * 100);
      setDragPct(Math.max(1, Math.min(100, pct)));
    }
  };
  const onSlidePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    dragRef.current = null;
    clearHold();
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (slideEnabled && d && d.moved && dragPct != null) {
      suppressClick.current = true;
      if (slideCover) {
        callHA('cover', 'set_cover_position', { position: fromSlider(dragPct) }, { entity_id: id });
      } else {
        callHA('light', 'turn_on', { brightness_pct: dragPct }, { entity_id: id });
      }
      // Keep the dragged fill visible briefly until the new state streams in.
      window.setTimeout(() => setDragPct(null), 500);
    }
  };
  const onSlidePointerCancel = () => {
    dragRef.current = null;
    clearHold();
  };

  // Make sure a pending hold timer never fires after the tile unmounts.
  useEffect(() => () => clearHold(), []);

  const tappable = TOGGLEABLE.includes(domain);
  const activatable = ACTIVATABLE.includes(domain);
  // Active (but calm) glass for on lights/switches/fans/media — matches the reference.
  const on = effectiveActive && (domain === 'light' || domain === 'switch' || domain === 'input_boolean' || domain === 'fan' || domain === 'media_player');
  const warmIcon = effectiveActive && (domain === 'light' || domain === 'switch');

  // Security tint: green = secure (locked/closed), red = open/unlocked.
  // Covers: only garage/door/gate types (not blinds, shades, curtains).
  let secClass = '';
  if (domain === 'lock') {
    secClass = entity.state === 'locked' ? 'sec-secure' : entity.state === 'unlocked' ? 'sec-open' : '';
  } else if (domain === 'cover') {
    const deviceClass = entity.attributes.device_class as string | undefined;
    if (deviceClass === 'garage' || deviceClass === 'door' || deviceClass === 'gate') {
      secClass = entity.state === 'closed' ? 'sec-secure' : entity.state === 'open' ? 'sec-open' : '';
    }
  }

  // ── Vacuum feature tile (live map, status, quick actions) ──
  if (isVacuum) {
    const battery = entity.attributes.battery_level as number | undefined;
    const area = entity.attributes.cleaned_area as number | undefined;
    const fan = entity.attributes.fan_speed as string | undefined;
    const status = (entity.attributes.status as string | undefined) || entity.state;
    const cleaning = entity.state === 'cleaning';
    const base = id.split('.')[1];
    const mapUrl = vacuumMapUrl(entities, base);
    const quick = (e: React.MouseEvent, service: string) => {
      e.stopPropagation();
      callHA('vacuum', service, undefined, { entity_id: id });
    };
    return (
      <div
        className={`tile tall vacuum-tile ${mapUrl ? 'has-map' : ''} ${cleaning ? 'is-cleaning' : ''}`}
        onClick={() => onOpenDetail(id)}
        style={mapUrl ? ({ '--vac-map': `url("${mapUrl}")` } as React.CSSProperties) : undefined}
      >
        {mapUrl && <div className="vacuum-map-bg" />}
        <div className="tile-top">
          <span className="mdi mdi-robot-vacuum tile-icon" />
          {battery != null && <span className="vacuum-batt">{battery}% Batt.</span>}
        </div>
        {!mapUrl && (
          <div className="vacuum-ring">
            <span className="mdi mdi-robot-vacuum-variant" />
          </div>
        )}
        <div className="vacuum-quick">
          <button
            className="vacuum-quick-btn"
            title={cleaning ? 'Pause' : 'Clean'}
            onClick={(e) => quick(e, cleaning ? 'pause' : 'start')}
          >
            <span className={`mdi ${cleaning ? 'mdi-pause' : 'mdi-play'}`} />
          </button>
          <button className="vacuum-quick-btn" title="Dock" onClick={(e) => quick(e, 'return_to_base')}>
            <span className="mdi mdi-home-import-outline" />
          </button>
        </div>
        <div className="tile-info">
          <div className="tile-name">{name}</div>
          <div className="tile-sub">{status}</div>
        </div>
        <div className="vacuum-chips">
          {area != null && <span className="chip">{area} m²</span>}
          {fan && <span className="chip">{fan}</span>}
        </div>
      </div>
    );
  }

  // ── Cover tile (tall, vertical fill) ──
  if (isCover && tall) {
    return (
      <div
        className={`tile tall cover-tile ${liveCamUrl ? 'has-cam-inline' : ''} ${secClass}`}
        onClick={() => onOpenDetail(id)}
        style={{ '--fill': `${sliderDisplay}%` } as React.CSSProperties}
      >
        {!liveCamUrl && <div className="cover-fill" />}
        {statusDot}
        <div className="tile-top">
          <span className={`mdi ${tileIcon} tile-icon`} />
          <button
            className="tile-more"
            onClick={(e) => { e.stopPropagation(); onOpenDetail(id); }}
            aria-label={t('tile_details')}
          >
            <span className="mdi mdi-dots-horizontal" />
          </button>
        </div>
        {liveCamUrl && (
          <div className="tile-cam-inline">
            <img src={liveCamUrl} alt="" onError={onCamError} onLoad={onCamLoad} />
          </div>
        )}
        <div className="tile-info">
          <div className="tile-name">{name}</div>
          <div className="tile-sub">{entitySummary(entity)}</div>
        </div>
        <input
          type="range"
          className="cover-range"
          min={0}
          max={100}
          value={sliderDisplay}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setLocal(fromSlider(parseInt(e.target.value)))}
          onPointerUp={(e) => {
            const v = fromSlider(parseInt((e.target as HTMLInputElement).value));
            callHA('cover', 'set_cover_position', { position: v }, { entity_id: id });
          }}
        />
      </div>
    );
  }

  // ── Sensor graph tile (servers tab) ──
  if (graph) {
    return (
      <div className="tile graph-tile span" onClick={() => onOpenDetail(id)}>
        <div className="graph-area">
          <Sparkline data={history} />
        </div>
        <div className="tile-top">
          <span className={`mdi ${tileIcon} tile-icon`} />
          <span className="graph-value">{entitySummary(entity)}</span>
        </div>
        <div className="tile-info">
          <div className="tile-name">{name}</div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={tiltRef as React.Ref<HTMLDivElement>}
      className={`tile tile-enter tile-tilt ${on ? 'on' : ''} ${liveLight ? 'live-light' : ''} ${span ? 'span' : ''} ${tall ? 'tall' : ''} ${cameraUrl ? 'has-cam' : ''} ${artworkUrl ? 'has-artwork' : ''} ${artTint ? 'art-tinted' : ''} ${secClass} ${slideEnabled ? 'slide-dim' : ''}`}
      style={{
        ...(slideEnabled
          ? {
              '--dim': `${dimFillPct}%`,
              '--dim-fill': slideFill,
              '--dim-edge': slideEdge,
              touchAction: 'pan-y',
            }
          : {}),
        ...(artTint ? { '--art-tint': artTint } : {}),
        ...(liveLight ? { '--light-rgb': liveLight } : {}),
        ...(enterIndex != null ? { '--enter-i': enterIndex } : {}),
      } as React.CSSProperties}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        if (tappable) {
          setOptimistic(!effectiveActive);
          if (optimisticTimer.current != null) window.clearTimeout(optimisticTimer.current);
          optimisticTimer.current = window.setTimeout(() => setOptimistic(null), 2200);
          onToggle(id);
        } else if (activatable) {
          // Momentary: fire the action, no optimistic on/off flip.
          onToggle(id);
        } else if (slideCover) {
          onToggle(id);
        } else if (onOpenTakeover && domain === 'media_player' && artworkUrl) {
          // A now-playing tile (artwork showing) taps into the full-bleed
          // lock-screen takeover; the ⋯ button still opens the flyout.
          onOpenTakeover(id);
        } else {
          openDetail(id);
        }
      }}
      onContextMenu={(e) => { e.preventDefault(); openDetail(id); }}
      onPointerDown={onSlidePointerDown}
      onPointerMove={onSlidePointerMove}
      onPointerUp={onSlidePointerUp}
      onPointerCancel={onSlidePointerCancel}
      onPointerLeave={onSlidePointerCancel}
    >
      <span className="tile-glare" aria-hidden="true" />
      {statusDot}
      {spark.length > 1 && (
        <div className="tile-spark" aria-hidden="true">
          <Sparkline data={spark} width={120} height={40} />
        </div>
      )}
      {slideEnabled && <div className="tile-dim-fill" />}
      {artworkUrl && (
        <div ref={artworkRef} key={artworkUrl} className="tile-artwork" style={{ backgroundImage: `url("${artworkUrl}")` }} />
      )}
      {liveCamUrl && (
        <div className="tile-cam">
          <img src={liveCamUrl} alt="" onError={onCamError} onLoad={onCamLoad} />
        </div>
      )}
      <div className="tile-top">
        <span className={`mdi ${tileIcon} tile-icon ${warmIcon ? 'warm' : ''}`} />
        <button
          className="tile-more"
          onClick={(e) => { e.stopPropagation(); openDetail(id); }}
          aria-label="Details"
        >
          <span className="mdi mdi-dots-horizontal" />
        </button>
      </div>
      <div className="tile-info">
        <div className="tile-name">{name}</div>
        <div className="tile-sub">{slideEnabled && dragPct != null ? `${dragPct}%` : entitySummary(entity)}</div>
      </div>
      {domain === 'media_player' && entity.state === 'playing' && (
        <div className="tile-eq" aria-hidden="true">
          <span /><span /><span /><span />
        </div>
      )}
      {(dimmable || isCover) && !slideEnabled && (
        <input
          type="range"
          className="tile-slider"
          min={0}
          max={100}
          value={sliderDisplay}
          style={{ '--fill': `${sliderDisplay}%` } as React.CSSProperties}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setLocal(fromSlider(parseInt(e.target.value)))}
          onPointerUp={(e) => {
            const v = fromSlider(parseInt((e.target as HTMLInputElement).value));
            if (dimmable) {
              callHA('light', 'turn_on', { brightness_pct: v }, { entity_id: id });
            } else {
              callHA('cover', 'set_cover_position', { position: v }, { entity_id: id });
            }
          }}
        />
      )}
    </div>
  );
}
