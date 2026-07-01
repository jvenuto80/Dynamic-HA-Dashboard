import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { HassEntities } from 'home-assistant-js-websocket';
import { cameraProxyUrl, useCameraFeed } from '../hooks/useCameraFeed';
import { useHaTempUnit } from '../hooks/useHomeAssistant';
import { resolveArtwork } from '../lib/entityInfo';
import { useArtworkColor } from '../hooks/useArtworkColor';
import type { TileAction, FlyoutConfig } from '../types';

interface Props {
  entityId: string | null;
  entities: HassEntities;
  /** Optional camera entity to show a live feed for in the flyout. */
  cameraEntityId?: string;
  /** Related entity_ids to show as mini-controls in this flyout. */
  links?: string[];
  /** Custom quick-action buttons to render in this flyout. */
  actions?: TileAction[];
  /** Per-tile flyout visibility customization. */
  flyoutConfig?: FlyoutConfig;
  /** Reverse the cover position slider direction. */
  reverseSlider?: boolean;
  /** Companion media_player entity to pull now-playing artwork from. */
  artworkEntity?: string;
  /** When true, the flyout renders inline edit controls (show/hide toggles). */
  editing?: boolean;
  /** Persist a change to this tile's flyout config (edit mode only). */
  onFlyoutConfigChange?: (patch: Partial<FlyoutConfig>) => void;
  /** Open another entity's flyout (used by linked-entity rows). */
  onOpenDetail?: (entityId: string) => void;
  onClose: () => void;
  callHA: (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => Promise<void>;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
}

const HIDDEN_ATTR_KEYS = ['friendly_name', 'icon', 'entity_picture', 'supported_features', 'supported_color_modes'];

/** Convert an [r,g,b] triplet to a #rrggbb hex string for <input type="color">. */
function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Convert a #rrggbb hex string to an [r,g,b] triplet for the HA service call. */
function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function DetailPanel({
  entityId,
  entities,
  cameraEntityId,
  links,
  actions,
  flyoutConfig,
  reverseSlider,
  artworkEntity,
  editing = false,
  onFlyoutConfigChange,
  onOpenDetail,
  onClose,
  callHA,
  getHistory,
}: Props) {
  const { t } = useTranslation();
  const isOpen = entityId !== null;
  const entity = entityId ? entities[entityId] : null;
  const domain = entityId?.split('.')[0] || '';
  const name = entity?.attributes?.friendly_name as string || entityId || '';
  const isNumeric = entity != null && Number.isFinite(parseFloat(entity.state));

  const cfg = flyoutConfig ?? {};
  const hiddenAttrs = cfg.hiddenAttributes ?? [];
  const toggle = (key: keyof FlyoutConfig) => onFlyoutConfigChange?.({ [key]: !cfg[key] });
  const toggleAttr = (key: string) => {
    const next = hiddenAttrs.includes(key)
      ? hiddenAttrs.filter((k) => k !== key)
      : [...hiddenAttrs, key];
    onFlyoutConfigChange?.({ hiddenAttributes: next });
  };

  // A small eye toggle shown next to each section header while editing.
  const EyeToggle = ({ hidden, onClick }: { hidden: boolean; onClick: () => void }) => (
    <button
      type="button"
      className={`flyout-eye ${hidden ? 'is-hidden' : ''}`}
      title={hidden ? t('detail_show_flyout') : t('detail_hide_flyout')}
      onClick={onClick}
    >
      <span className={`mdi ${hidden ? 'mdi-eye-off' : 'mdi-eye'}`} />
    </button>
  );

  return (
    <>
      <div className={`detail-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`detail-panel ${isOpen ? 'open' : ''} ${editing ? 'editing' : ''}`}>
        {entity && (
          <>
            <div className="detail-header">
              <h2>{name}</h2>
              {editing && <span className="flyout-edit-badge"><span className="mdi mdi-pencil" /> {t('detail_editing_flyout')}</span>}
              <button className="detail-close" onClick={onClose}>
                <span className="mdi mdi-close" />
              </button>
            </div>

            {cameraEntityId && (
              <DetailCamera cameraEntityId={cameraEntityId} entities={entities} />
            )}

            {actions && actions.length > 0 && (
              <div className="glass-card detail-actions">
                {actions.map((a, i) => (
                  <button
                    key={i}
                    className="detail-action-btn"
                    onClick={() =>
                      callHA(
                        a.domain,
                        a.service,
                        a.data,
                        a.target ? { entity_id: a.target } : undefined,
                      )
                    }
                  >
                    {a.icon && <span className={`mdi ${a.icon}`} />}
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {links && links.length > 0 && (
              <div className="glass-card detail-links">
                <h4>{t('detail_linked')}</h4>
                {links.map((id) => {
                  const le = entities[id];
                  if (!le) return null;
                  const ln = (le.attributes.friendly_name as string) || id;
                  const ld = id.split('.')[0];
                  return (
                    <div className="detail-link-row" key={id}>
                      <button
                        className="detail-link-name"
                        onClick={() => onOpenDetail?.(id)}
                      >
                        <span className={`mdi ${getDetailIcon(ld, le.state)}`} />
                        {ln}
                      </button>
                      <span className="detail-link-state">{le.state}</span>
                      {['light', 'switch', 'input_boolean', 'fan', 'lock'].includes(ld) && (
                        <button
                          className="detail-link-toggle"
                          onClick={() =>
                            ld === 'lock'
                              ? callHA('lock', le.state === 'locked' ? 'unlock' : 'lock', undefined, { entity_id: id })
                              : callHA('homeassistant', 'toggle', undefined, { entity_id: id })
                          }
                        >
                          <span className="mdi mdi-power" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {domain !== 'climate' && domain !== 'vacuum' && (!cfg.hideState || editing) && (
              <div className={`glass-card flyout-section ${cfg.hideState ? 'flyout-dim' : ''}`} style={{ marginBottom: 16, textAlign: 'center', padding: 24, position: 'relative' }}>
                {editing && <EyeToggle hidden={!!cfg.hideState} onClick={() => toggle('hideState')} />}
                <div style={{ fontSize: 48, marginBottom: 8, color: getStateColor(entity.state, domain) }}>
                  <span className={`mdi ${getDetailIcon(domain, entity.state)}`} />
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, textTransform: 'capitalize' }}>
                  {entity.state}
                </div>
              </div>
            )}

            {(!cfg.hideControls || editing) && (
              <div className={`flyout-section ${cfg.hideControls ? 'flyout-dim' : ''}`} style={{ position: 'relative' }}>
                {editing && (['light', 'climate', 'cover', 'vacuum', 'media_player'].includes(domain)) && (
                  <EyeToggle hidden={!!cfg.hideControls} onClick={() => toggle('hideControls')} />
                )}
                {domain === 'light' && <LightDetail entity={entity} entityId={entityId!} callHA={callHA} />}
                {domain === 'climate' && <ClimateDetail entity={entity} entityId={entityId!} callHA={callHA} />}
                {domain === 'cover' && <CoverDetail entity={entity} entityId={entityId!} callHA={callHA} reverse={!!reverseSlider} />}
                {domain === 'vacuum' && <VacuumDetail entity={entity} entityId={entityId!} callHA={callHA} entities={entities} />}
                {domain === 'media_player' && <MediaDetail entity={entity} entityId={entityId!} callHA={callHA} entities={entities} artworkEntity={artworkEntity} />}
              </div>
            )}

            {isNumeric && getHistory && (!cfg.hideHistory || editing) && (
              <div className={`flyout-section ${cfg.hideHistory ? 'flyout-dim' : ''}`} style={{ position: 'relative' }}>
                {editing && <EyeToggle hidden={!!cfg.hideHistory} onClick={() => toggle('hideHistory')} />}
                <DetailGraph
                  entityId={entityId!}
                  unit={(entity.attributes.unit_of_measurement as string) || ''}
                  getHistory={getHistory}
                />
              </div>
            )}

            {(!cfg.hideAttributes || editing) && (
              <div className={`glass-card flyout-section ${cfg.hideAttributes ? 'flyout-dim' : ''}`} style={{ marginTop: 16, position: 'relative' }}>
                <h4 style={{ marginBottom: 12, fontSize: 14, color: 'var(--text-muted)' }}>{t('detail_attributes')}</h4>
                {editing && <EyeToggle hidden={!!cfg.hideAttributes} onClick={() => toggle('hideAttributes')} />}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {Object.entries(entity.attributes)
                    .filter(([k]) => !HIDDEN_ATTR_KEYS.includes(k))
                    .filter(([k]) => editing || !hiddenAttrs.includes(k))
                    .slice(0, 30)
                    .map(([key, val]) => {
                      const attrHidden = hiddenAttrs.includes(key);
                      return (
                        <div key={key} className={attrHidden ? 'flyout-dim' : ''} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-glass)' }}>
                          {editing && (
                            <button
                              type="button"
                              className={`flyout-attr-eye ${attrHidden ? 'is-hidden' : ''}`}
                              title={attrHidden ? t('detail_show_attribute') : t('detail_hide_attribute')}
                              onClick={() => toggleAttr(key)}
                            >
                              <span className={`mdi ${attrHidden ? 'mdi-eye-off' : 'mdi-eye'}`} />
                            </button>
                          )}
                          <span>{key}</span>
                          <span style={{ color: 'var(--text-primary)', maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function DetailCamera({ cameraEntityId, entities }: { cameraEntityId: string; entities: HassEntities }) {
  const { t } = useTranslation();
  const cam = entities[cameraEntityId];
  // useCameraFeed owns the refresh loop: it pauses on failed frames, hidden
  // tabs, and socket drops so a stale signed token never gets hammered against
  // HA (each attempt is logged as "invalid authentication" by http.ban).
  const { src, onLoad, onError } = useCameraFeed(cameraProxyUrl(cam, cameraEntityId), 1000);
  if (!src) return null;

  return (
    <div className="detail-camera glass-card">
      <img
        src={src}
        alt={(cam?.attributes.friendly_name as string) || t('detail_camera')}
        onLoad={onLoad}
        onError={onError}
      />
    </div>
  );
}

function getStateColor(state: string, domain: string): string {
  if (['on', 'open', 'playing', 'cleaning', 'home'].includes(state)) return 'var(--accent-orange)';
  if (state === 'cool') return 'var(--accent-cyan)';
  if (state === 'heat') return 'var(--accent-orange)';
  if (state === 'locked') return 'var(--accent-green)';
  if (state === 'unlocked') return 'var(--accent-red)';
  return 'var(--text-muted)';
}

function getDetailIcon(domain: string, state: string): string {
  const map: Record<string, string> = {
    light: state === 'on' ? 'mdi-lightbulb-on' : 'mdi-lightbulb-off',
    switch: state === 'on' ? 'mdi-toggle-switch' : 'mdi-toggle-switch-off',
    cover: state === 'open' ? 'mdi-blinds-open' : 'mdi-blinds',
    lock: state === 'locked' ? 'mdi-lock' : 'mdi-lock-open-variant',
    climate: state === 'cool' ? 'mdi-snowflake' : state === 'heat' ? 'mdi-fire' : 'mdi-thermostat',
    vacuum: state === 'cleaning' ? 'mdi-robot-vacuum-variant' : 'mdi-robot-vacuum',
    media_player: state === 'playing' ? 'mdi-play-circle' : 'mdi-cast',
    camera: 'mdi-cctv',
  };
  return map[domain] || 'mdi-information';
}

type CallHA = Props['callHA'];
interface EntityProps {
  entity: HassEntities[string];
  entityId: string;
  callHA: CallHA;
}

function LightDetail({ entity, entityId, callHA }: EntityProps) {
  const { t } = useTranslation();
  const brightness = entity.attributes.brightness as number | undefined;
  const isOn = entity.state === 'on';

  // What this light supports.
  const colorModes = (entity.attributes.supported_color_modes as string[]) || [];
  const supportsColor = colorModes.some((m) => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(m));
  const supportsTemp = colorModes.includes('color_temp');
  const rgb = (entity.attributes.rgb_color as [number, number, number] | undefined);
  const currentHex = rgb ? rgbToHex(rgb) : '#ffffff';

  // Color-temperature range (Kelvin). Fall back to a sensible tunable-white range.
  const minK = (entity.attributes.min_color_temp_kelvin as number | undefined) ?? 2000;
  const maxK = (entity.attributes.max_color_temp_kelvin as number | undefined) ?? 6500;
  const currentK = (entity.attributes.color_temp_kelvin as number | undefined) ?? Math.round((minK + maxK) / 2);

  // When a light supports both, let the user flip between the color wheel and
  // the warm/cool (color temperature) slider. Default to whichever the bulb is in.
  const [mode, setMode] = useState<'color' | 'temp'>(
    entity.attributes.color_mode === 'color_temp' ? 'temp' : 'color',
  );
  const showSwitcher = supportsColor && supportsTemp;

  // Drag-local values so the sliders track smoothly and only send ONE service
  // call on release (otherwise every step queues a call and the bulb crawls).
  const [pendingBri, setPendingBri] = useState<number | null>(null);
  const [pendingK, setPendingK] = useState<number | null>(null);
  const briValue = pendingBri ?? brightness ?? 0;
  const kValue = pendingK ?? currentK;

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{t('detail_power')}</span>
        <button
          className="mode-btn"
          style={{ minWidth: 60 }}
          onClick={() => callHA('light', 'toggle', undefined, { entity_id: entityId })}
        >
          {isOn ? t('detail_on') : t('detail_off')}
        </button>
      </div>
      {isOn && brightness !== undefined && (
        <div className="light-slider-row">
          <label>
            <span>{t('detail_brightness')}</span>
            <span>{Math.round((briValue / 255) * 100)}%</span>
          </label>
          <input
            type="range"
            className="light-slider"
            min={1}
            max={255}
            value={briValue}
            onChange={(e) => setPendingBri(parseInt(e.target.value))}
            onPointerUp={(e) => {
              callHA('light', 'turn_on', { brightness: parseInt((e.target as HTMLInputElement).value) }, { entity_id: entityId });
              setPendingBri(null);
            }}
            onKeyUp={(e) => {
              callHA('light', 'turn_on', { brightness: parseInt((e.target as HTMLInputElement).value) }, { entity_id: entityId });
              setPendingBri(null);
            }}
          />
        </div>
      )}

      {isOn && showSwitcher && (
        <div className="light-mode-switch">
          <button
            className={`light-mode-btn ${mode === 'color' ? 'active' : ''}`}
            onClick={() => setMode('color')}
          >
            <span className="mdi mdi-palette" /> {t('detail_color')}
          </button>
          <button
            className={`light-mode-btn ${mode === 'temp' ? 'active' : ''}`}
            onClick={() => setMode('temp')}
          >
            <span className="mdi mdi-thermometer" /> {t('detail_warmth')}
          </button>
        </div>
      )}

      {isOn && supportsColor && (!showSwitcher || mode === 'color') && (
        <div className="light-color-row">
          <span>{t('detail_color')}</span>
          <label className="light-color-swatch" style={{ background: currentHex }} title={t('detail_pick_color')}>
            <input
              type="color"
              value={currentHex}
              onChange={(e) => callHA('light', 'turn_on', { rgb_color: hexToRgb(e.target.value) }, { entity_id: entityId })}
            />
          </label>
        </div>
      )}

      {isOn && supportsTemp && (!showSwitcher || mode === 'temp') && (
        <div className="light-slider-row">
          <label>
            <span>{t('detail_warmth')}</span>
            <span>{kValue}K</span>
          </label>
          <input
            type="range"
            className="light-slider light-temp-slider"
            min={minK}
            max={maxK}
            step={50}
            value={kValue}
            onChange={(e) => setPendingK(parseInt(e.target.value))}
            onPointerUp={(e) => {
              callHA('light', 'turn_on', { color_temp_kelvin: parseInt((e.target as HTMLInputElement).value) }, { entity_id: entityId });
              setPendingK(null);
            }}
            onKeyUp={(e) => {
              callHA('light', 'turn_on', { color_temp_kelvin: parseInt((e.target as HTMLInputElement).value) }, { entity_id: entityId });
              setPendingK(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

function ClimateDetail({ entity, entityId, callHA }: EntityProps) {
  const { t } = useTranslation();
  const haTempUnit = useHaTempUnit();
  const currentTemp = entity.attributes.current_temperature as number;
  const targetTemp = entity.attributes.temperature as number;
  const tempUnit = (entity.attributes.temperature_unit as string | undefined) ?? haTempUnit;
  const mode = entity.state;
  const modes = (entity.attributes.hvac_modes as string[]) || [];
  const fanModes = (entity.attributes.fan_modes as string[]) || [];
  const fanMode = entity.attributes.fan_mode as string;
  const presetModes = (entity.attributes.preset_modes as string[]) || [];
  const presetMode = entity.attributes.preset_mode as string | undefined;
  const minTemp = (entity.attributes.min_temp as number) || (tempUnit === '°F' ? 60 : 16);
  const maxTemp = (entity.attributes.max_temp as number) || (tempUnit === '°F' ? 90 : 35);
  const step = (entity.attributes.target_temp_step as number) || 1;

  // `pending` holds the temperature the user is dragging toward. While set we show
  // it instead of the live target and only send ONE set_temperature on release, so
  // the gauge doesn't fire a continuous stream of service calls mid-drag.
  const [pending, setPending] = useState<number | null>(null);
  const gaugeRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  // Clear the pending value once HA reports the target has caught up.
  useEffect(() => {
    if (pending === null || targetTemp === undefined) return;
    if (Math.abs(targetTemp - pending) < step / 2 + 0.01) setPending(null);
  }, [targetTemp, pending, step]);

  const displayTemp = pending ?? targetTemp;
  const fraction = displayTemp ? Math.max(0, Math.min(1, (displayTemp - minTemp) / (maxTemp - minTemp))) : 0;
  const circumference = 2 * Math.PI * 54;
  const arcLength = circumference * 0.75; // 270 degrees
  const fillClass = mode === 'cool' ? 'cool' : 'heat';

  const setTemp = (t: number) => callHA('climate', 'set_temperature', { temperature: t }, { entity_id: entityId });

  // Convert a pointer position over the gauge into a target temperature.
  // The SVG is rotated -135° in CSS, so the 270° track begins at the upper-left
  // (screen angle 225°, = min temp) and sweeps clockwise — over the top, down the
  // right, across the bottom — ending at the lower-left (135°, = max temp). The
  // remaining 90° gap sits on the left. atan2(dy, dx) gives a screen angle measured
  // clockwise from 3 o'clock (y points down), which matches that convention.
  const ARC_START = 225; // screen angle of the min-temp end
  const tempFromPointer = (clientX: number, clientY: number): number | null => {
    const el = gaugeRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let theta = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right, +down
    if (theta < 0) theta += 360; // 0..360 clockwise from 3 o'clock
    let a = (theta - ARC_START + 360) % 360; // 0 at min end, increases clockwise
    if (a > 270) {
      // Inside the bottom-left gap — snap to whichever end is closer.
      a = a < 315 ? 270 : 0;
    }
    const frac = a / 270;
    const raw = minTemp + frac * (maxTemp - minTemp);
    const stepped = Math.round(raw / step) * step;
    return Math.max(minTemp, Math.min(maxTemp, stepped));
  };

  const onGaugeDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const t = tempFromPointer(e.clientX, e.clientY);
    if (t !== null) setPending(t);
  };
  const onGaugeMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const t = tempFromPointer(e.clientX, e.clientY);
    if (t !== null) setPending(t);
  };
  const onGaugeUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const t = tempFromPointer(e.clientX, e.clientY);
    if (t !== null) setTemp(t);
  };

  return (
    <>
      <div className="glass-card climate-detail-card" style={{ marginBottom: 12 }}>
        <div
          ref={gaugeRef}
          className="climate-gauge climate-gauge-lg climate-gauge-interactive"
          onPointerDown={onGaugeDown}
          onPointerMove={onGaugeMove}
          onPointerUp={onGaugeUp}
          onPointerCancel={onGaugeUp}
        >
          <svg viewBox="0 0 120 120">
            <circle className="track" cx="60" cy="60" r="54"
              strokeDasharray={`${arcLength} ${circumference}`} />
            <circle className={`fill ${fillClass}`} cx="60" cy="60" r="54"
              strokeDasharray={`${fraction * arcLength} ${circumference}`} />
          </svg>
          <div className="climate-temp-display">
            <span className="value">{(displayTemp ?? currentTemp)?.toFixed(1) || '--'}</span>
            <span className="unit">{tempUnit}</span>
            <span className="label">{t('detail_current')} {currentTemp?.toFixed(1) ?? '--'}{tempUnit}</span>
          </div>
        </div>
        <div className="climate-controls">
          <button className="climate-btn" onClick={() => displayTemp && setTemp(displayTemp - step)}>
            <span className="mdi mdi-minus" />
          </button>
          <button className="align-btn" onClick={() => currentTemp && setTemp(Math.round(currentTemp))}>
            <span className="mdi mdi-target" /> {t('detail_align')}
          </button>
          <button className="climate-btn" onClick={() => displayTemp && setTemp(displayTemp + step)}>
            <span className="mdi mdi-plus" />
          </button>
        </div>
      </div>
      <div className="glass-card" style={{ marginBottom: 12 }}>
        <h4 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t('detail_mode')}</h4>
        <div className="climate-mode-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
          {modes.map((m) => (
            <button key={m} className={`mode-btn ${mode === m ? 'active' : ''}`}
              onClick={() => callHA('climate', 'set_hvac_mode', { hvac_mode: m }, { entity_id: entityId })}>
              {m}
            </button>
          ))}
        </div>
      </div>
      {presetModes.length > 0 && (
        <div className="glass-card" style={{ marginBottom: fanModes.length > 0 ? 12 : 0 }}>
          <h4 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t('detail_preset')}</h4>
          <div className="climate-mode-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {presetModes.map((m) => (
              <button key={m} className={`mode-btn ${presetMode === m ? 'active' : ''}`}
                onClick={() => callHA('climate', 'set_preset_mode', { preset_mode: m }, { entity_id: entityId })}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
      {fanModes.length > 0 && (
        <div className="glass-card">
          <h4 style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>{t('detail_fan_mode')}</h4>
          <div className="climate-mode-row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
            {fanModes.map((m) => (
              <button key={m} className={`mode-btn ${fanMode === m ? 'active' : ''}`}
                onClick={() => callHA('climate', 'set_fan_mode', { fan_mode: m }, { entity_id: entityId })}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function CoverDetail({ entity, entityId, callHA, reverse }: EntityProps & { reverse?: boolean }) {
  const { t } = useTranslation();
  const position = entity.attributes.current_position as number | undefined;
  // `pending` holds the value the user is dragging toward. While it is set we
  // show it instead of the live position so the thumb tracks the finger smoothly
  // and the slider doesn't snap back to the (slowly catching-up) reported value.
  // We only send ONE set_cover_position on release; the live position takes over
  // again once it settles near the target.
  const [pending, setPending] = useState<number | null>(null);

  // Clear the pending value once the cover has (roughly) reached the target.
  useEffect(() => {
    if (pending === null || position === undefined) return;
    if (Math.abs(position - pending) <= 1) setPending(null);
  }, [position, pending]);

  const actual = pending ?? position ?? 0;
  // Slider value is flipped when reversed, but the label always shows real %.
  const sliderValue = reverse ? 100 - actual : actual;

  const toPosition = (raw: number) => (reverse ? 100 - raw : raw);

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
        <button className="mode-btn" onClick={() => callHA('cover', 'open_cover', undefined, { entity_id: entityId })}>{t('detail_open')}</button>
        <button className="mode-btn" onClick={() => callHA('cover', 'stop_cover', undefined, { entity_id: entityId })}>{t('detail_stop')}</button>
        <button className="mode-btn" onClick={() => callHA('cover', 'close_cover', undefined, { entity_id: entityId })}>{t('detail_close')}</button>
      </div>
      {position !== undefined && (
        <div className="light-slider-row">
          <label>
            <span>{t('detail_position')}</span>
            <span>{actual}%</span>
          </label>
          <input
            type="range"
            className="light-slider"
            min={0}
            max={100}
            value={sliderValue}
            onChange={(e) => setPending(toPosition(parseInt(e.target.value)))}
            onPointerUp={(e) => callHA('cover', 'set_cover_position', { position: toPosition(parseInt((e.target as HTMLInputElement).value)) }, { entity_id: entityId })}
            onKeyUp={(e) => callHA('cover', 'set_cover_position', { position: toPosition(parseInt((e.target as HTMLInputElement).value)) }, { entity_id: entityId })}
          />
        </div>
      )}
    </div>
  );
}

/** Discover cleanable room segments from the Dreame integration's
 *  `select.<base>_room_<id>_name` entities (id = segment id). Only visible
 *  rooms are returned, sorted by segment id. Empty for non-Dreame vacuums. */
function discoverVacuumRooms(entities: HassEntities, base: string): { id: number; name: string }[] {
  const rooms: { id: number; name: string }[] = [];
  const re = new RegExp(`^select\\.${base}_room_(\\d+)_name$`);
  for (const eid of Object.keys(entities)) {
    const m = eid.match(re);
    if (!m) continue;
    const id = Number(m[1]);
    const e = entities[eid];
    const name = e?.state;
    if (!name || name === 'unavailable' || name === 'unknown') continue;
    const vis = entities[`select.${base}_room_${id}_visibility`]?.state;
    if (vis && vis !== 'visible') continue;
    rooms.push({ id, name });
  }
  return rooms.sort((a, b) => a.id - b.id);
}

/** Live vacuum map. Refreshes reactively when HA pushes a new frame (the camera
 *  entity's state is a timestamp) and polls every few seconds while cleaning. */
function VacuumMap({ cam, cameraId }: { cam: HassEntities[string]; cameraId: string }) {
  const [bust, setBust] = useState(() => Date.now());
  const ts = cam?.state;
  useEffect(() => { setBust(Date.now()); }, [ts]);

  const baseUrl = cameraProxyUrl(cam, cameraId);
  if (!baseUrl) return null;
  const src = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}_=${bust}`;
  return (
    <div className="vacuum-map glass-card">
      <img src={src} alt="Vacuum map" />
    </div>
  );
}

/** Small left/percentage bar for a consumable (brush, filter, sensor). */
function Consumable({ icon, label, pct }: { icon: string; label: string; pct: number }) {
  const low = pct <= 10;
  return (
    <div className={`vac-consumable ${low ? 'is-low' : ''}`}>
      <span className={`mdi ${icon}`} />
      <div className="vac-consumable-body">
        <div className="vac-consumable-top">
          <span className="vac-consumable-label">{label}</span>
          <span className="vac-consumable-pct">{pct}%</span>
        </div>
        <div className="vac-consumable-bar"><div style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>
      </div>
    </div>
  );
}

function VacuumDetail({ entity, entityId, callHA, entities }: EntityProps & { entities: HassEntities }) {
  const { t } = useTranslation();
  const a = entity.attributes;
  const base = entityId.split('.')[1];
  const state = entity.state;

  const status = (a.status as string) || state;
  const battery = a.battery_level as number | undefined;
  const errorRaw = a.error as string | undefined;
  const hasError = !!errorRaw && !/^(no error|none|)$/i.test(errorRaw);
  const currentRoom = entities[`sensor.${base}_current_room`]?.state;
  const area = a.cleaned_area as number | undefined;
  const time = a.cleaning_time as number | undefined;

  const cleaning = state === 'cleaning';
  const docked = state === 'docked';

  const fanList = (a.fan_speed_list as string[]) || [];
  const fan = a.fan_speed as string | undefined;

  const modeList = (a.cleaning_mode_list as string[]) || [];
  const mode = a.cleaning_mode as string | undefined;
  // Friendly, app-style labels for the Dreame cleaning modes. We render the
  // selector from the vacuum's own `cleaning_mode_list` attribute (always
  // present) rather than the `select.<base>_cleaning_mode` entity, which the
  // integration reports as `unavailable` whenever the mop pad isn't mounted.
  const MODE_LABELS: Record<string, string> = {
    'Sweeping and mopping': t('detail_vacuum_mode_vac_mop'),
    'Sweeping': t('detail_vacuum_mode_vac'),
    'Mopping': t('detail_vacuum_mode_mop'),
    'Mopping after sweeping': t('detail_vacuum_mode_vac_then_mop'),
  };
  const MODE_ORDER = ['Sweeping and mopping', 'Sweeping', 'Mopping', 'Mopping after sweeping'];
  const modes = [...modeList].sort((x, y) => MODE_ORDER.indexOf(x) - MODE_ORDER.indexOf(y));
  const setMode = (m: string) =>
    callHA('select', 'select_option', { option: m.toLowerCase().replace(/ /g, '_') }, { entity_id: `select.${base}_cleaning_mode` });

  const mapCam = entities[`camera.${base}_map`];
  const rooms = discoverVacuumRooms(entities, base);
  const [selRooms, setSelRooms] = useState<number[]>([]);
  const toggleRoom = (id: number) =>
    setSelRooms((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  const cleanSelected = () => {
    if (!selRooms.length) return;
    callHA('dreame_vacuum', 'vacuum_clean_segment', { segments: selRooms }, { entity_id: entityId });
    setSelRooms([]);
  };

  const batteryIcon =
    battery == null ? 'mdi-battery-unknown'
      : battery >= 95 ? 'mdi-battery'
        : battery <= 10 ? 'mdi-battery-alert-variant-outline'
          : `mdi-battery-${Math.round(battery / 10) * 10}`;

  const consumables = [
    { icon: 'mdi-broom', label: t('detail_main_brush'), pct: a.main_brush_left as number | undefined },
    { icon: 'mdi-broom', label: t('detail_side_brush'), pct: a.side_brush_left as number | undefined },
    { icon: 'mdi-air-filter', label: t('detail_filter'), pct: a.filter_left as number | undefined },
    { icon: 'mdi-eye-outline', label: t('detail_sensors'), pct: entities[`sensor.${base}_sensor_dirty_left`]?.state },
  ]
    .map((c) => ({ ...c, pct: typeof c.pct === 'string' ? parseFloat(c.pct) : c.pct }))
    .filter((c) => c.pct != null && Number.isFinite(c.pct)) as { icon: string; label: string; pct: number }[];

  return (
    <div className="vacuum-panel">
      {mapCam && mapCam.state !== 'unavailable' && (
        <VacuumMap cam={mapCam} cameraId={`camera.${base}_map`} />
      )}

      <div className="glass-card vacuum-summary">
        <div className={`vac-state-dot ${cleaning ? 'is-active' : hasError ? 'is-error' : ''}`}>
          <span className={`mdi ${cleaning ? 'mdi-robot-vacuum-variant' : hasError ? 'mdi-robot-vacuum-alert' : 'mdi-robot-vacuum'}`} />
        </div>
        <div className="vac-summary-text">
          <div className="vac-status">{hasError ? errorRaw : status}</div>
          <div className="vac-substatus">
            {currentRoom && cleaning ? t('detail_in_room', { room: currentRoom }) : docked ? t('detail_docked') : ''}
            {cleaning && area != null ? `${currentRoom ? ' · ' : ''}${area} m²${time != null ? ` · ${time} min` : ''}` : ''}
          </div>
        </div>
        {battery != null && (
          <div className={`vac-battery ${battery <= 15 ? 'is-low' : ''}`}>
            <span className={`mdi ${batteryIcon}`} />
            <span>{battery}%</span>
          </div>
        )}
      </div>

      <div className="vacuum-primary">
        <button
          className={`vac-btn vac-btn-primary ${cleaning ? 'is-on' : ''}`}
          onClick={() => callHA('vacuum', cleaning ? 'pause' : 'start', undefined, { entity_id: entityId })}
        >
          <span className={`mdi ${cleaning ? 'mdi-pause' : 'mdi-play'}`} />
          {cleaning ? t('detail_pause') : state === 'paused' ? t('detail_resume') : t('detail_clean')}
        </button>
        <button className="vac-btn" onClick={() => callHA('vacuum', 'stop', undefined, { entity_id: entityId })}>
          <span className="mdi mdi-stop" />{t('detail_stop')}
        </button>
        <button className="vac-btn" onClick={() => callHA('vacuum', 'return_to_base', undefined, { entity_id: entityId })}>
          <span className="mdi mdi-home-import-outline" />{t('detail_dock')}
        </button>
        <button className="vac-btn" onClick={() => callHA('vacuum', 'locate', undefined, { entity_id: entityId })}>
          <span className="mdi mdi-map-marker-radius" />{t('detail_locate')}
        </button>
      </div>

      {fanList.length > 0 && (
        <div className="vac-section">
          <div className="vac-section-label">{t('detail_suction')}</div>
          <div className="vac-seg">
            {fanList.map((f) => (
              <button
                key={f}
                className={`vac-seg-btn ${fan === f ? 'is-on' : ''}`}
                onClick={() => callHA('vacuum', 'set_fan_speed', { fan_speed: f }, { entity_id: entityId })}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {modes.length > 0 && (
        <div className="vac-section">
          <div className="vac-section-label">{t('detail_mode_label')}</div>
          <div className="vac-seg">
            {modes.map((m) => (
              <button
                key={m}
                className={`vac-seg-btn ${mode === m ? 'is-on' : ''}`}
                onClick={() => setMode(m)}
              >
                {MODE_LABELS[m] || m}
              </button>
            ))}
          </div>
        </div>
      )}

      {rooms.length > 0 && (
        <div className="vac-section">
          <div className="vac-section-label">
            {t('detail_rooms')}{selRooms.length > 0 ? ` · ${selRooms.length} ${t('detail_selected')}` : ''}
          </div>
          <div className="vac-rooms">
            {rooms.map((r) => (
              <button
                key={r.id}
                className={`vac-room ${selRooms.includes(r.id) ? 'is-on' : ''}`}
                onClick={() => toggleRoom(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
          <button className="vac-btn vac-clean-rooms" disabled={!selRooms.length} onClick={cleanSelected}>
            <span className="mdi mdi-broom" />
            {selRooms.length
              ? t('detail_clean_rooms', { n: selRooms.length, s: selRooms.length > 1 ? 's' : '' })
              : t('detail_select_rooms')}
          </button>
        </div>
      )}

      {consumables.length > 0 && (
        <div className="vac-section">
          <div className="vac-section-label">{t('detail_maintenance')}</div>
          <div className="vac-consumables">
            {consumables.map((c) => (
              <Consumable key={c.label} icon={c.icon} label={c.label} pct={Math.round(c.pct)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MediaDetail({ entity, entityId, callHA, entities, artworkEntity }: EntityProps & { entities: HassEntities; artworkEntity?: string }) {
  const { t } = useTranslation();
  const title = entity.attributes.media_title as string | undefined;
  const artist = entity.attributes.media_artist as string | undefined;
  const app = entity.attributes.app_name as string | undefined;
  const volume = entity.attributes.volume_level as number | undefined;

  // Resolve now-playing artwork, borrowing from a companion player when needed.
  const artwork = resolveArtwork(entity, entityId, entities, artworkEntity);
  const showArtwork = artwork && !['off', 'unavailable', 'standby'].includes(entity.state);
  // Ambient tint pulled from the artwork's dominant color (Apple Music style).
  const tint = useArtworkColor(showArtwork ? artwork : undefined);

  return (
    <div
      className={`glass-card${tint ? ' media-card-tinted' : ''}`}
      style={tint ? ({ '--art-tint': tint } as React.CSSProperties) : undefined}
    >
      {showArtwork && (
        <div className="media-artwork">
          <img key={artwork} src={artwork} alt={title || 'Now playing'} loading="lazy" />
        </div>
      )}
      {(title || artist || app) && (
        <div style={{ marginBottom: 16, textAlign: 'center' }}>
          {title && <div style={{ fontSize: 15, fontWeight: 500 }}>{title}</div>}
          {artist && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{artist}</div>}
          {!artist && app && <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{app}</div>}
        </div>
      )}
      <MediaProgress entity={entity} />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
        <button className="climate-btn" onClick={() => callHA('media_player', 'media_previous_track', undefined, { entity_id: entityId })}>
          <span className="mdi mdi-skip-previous" />
        </button>
        <button className="climate-btn" onClick={() => callHA('media_player', 'media_play_pause', undefined, { entity_id: entityId })}>
          <span className={`mdi ${entity.state === 'playing' ? 'mdi-pause' : 'mdi-play'}`} />
        </button>
        <button className="climate-btn" onClick={() => callHA('media_player', 'media_next_track', undefined, { entity_id: entityId })}>
          <span className="mdi mdi-skip-next" />
        </button>
      </div>
      {volume !== undefined && (
        <div className="light-slider-row">
          <label>
            <span>{t('detail_volume')}</span>
            <span>{Math.round(volume * 100)}%</span>
          </label>
          <input
            type="range"
            className="light-slider"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => callHA('media_player', 'volume_set', { volume_level: parseInt(e.target.value) / 100 }, { entity_id: entityId })}
          />
        </div>
      )}
    </div>
  );
}

/** Live now-playing progress bar that ticks between HA state updates.
 *  Shared with the full-bleed NowPlayingTakeover. */
export function MediaProgress({ entity }: { entity: EntityProps['entity'] }) {
  const duration = entity.attributes.media_duration as number | undefined;
  const position = entity.attributes.media_position as number | undefined;
  const updatedAt = entity.attributes.media_position_updated_at as string | undefined;
  const playing = entity.state === 'playing';

  // Tick a clock while playing so the elapsed time advances smoothly.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [playing]);

  if (duration === undefined || position === undefined || duration <= 0) return null;

  // Interpolate from the last reported position while playing.
  const base = updatedAt ? new Date(updatedAt).getTime() : now;
  const elapsedExtra = playing ? Math.max(0, (now - base) / 1000) : 0;
  const elapsed = Math.min(duration, position + elapsedExtra);
  const pct = Math.max(0, Math.min(100, (elapsed / duration) * 100));

  return (
    <div className="media-progress">
      <div className="media-progress-bar">
        <div className="media-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="media-progress-times">
        <span>{fmtTime(elapsed)}</span>
        <span>{fmtTime(duration)}</span>
      </div>
    </div>
  );
}

/** Format seconds as m:ss (or h:mm:ss for long content). */
function fmtTime(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const RANGES: { label: string; hours: number }[] = [
  { label: '1H', hours: 1 },
  { label: '12H', hours: 12 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
];

function DetailGraph({
  entityId,
  unit,
  getHistory,
}: {
  entityId: string;
  unit: string;
  getHistory: (entityId: string, hours?: number) => Promise<number[]>;
}) {
  const { t } = useTranslation();
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getHistory(entityId, hours).then((d) => {
      if (!cancelled) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entityId, hours, getHistory]);

  const W = 320;
  const H = 130;
  const pad = 6;

  let body = null;
  if (loading) {
    body = <div className="detail-graph-empty">{t('detail_loading')}</div>;
  } else if (data.length < 2) {
    body = <div className="detail-graph-empty">{t('detail_no_history')}</div>;
  } else {
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const stepX = W / (data.length - 1);
    const pts = data.map((v, i) => {
      const x = i * stepX;
      const y = pad + (1 - (v - min) / range) * (H - pad * 2);
      return [x, y] as const;
    });
    const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    const area = `${line} L${W} ${H} L0 ${H} Z`;
    const avg = data.reduce((a, b) => a + b, 0) / data.length;

    body = (
      <>
        <div className="detail-graph-plot">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id="detail-spark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5ac8fa" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#5ac8fa" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1={pad} x2={W} y2={pad} className="detail-grid-line" />
            <line x1="0" y1={H / 2} x2={W} y2={H / 2} className="detail-grid-line" />
            <line x1="0" y1={H - pad} x2={W} y2={H - pad} className="detail-grid-line" />
            <path d={area} fill="url(#detail-spark)" />
            <path d={line} fill="none" stroke="#5ac8fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="detail-axis detail-axis-max">{max.toFixed(1)}</span>
          <span className="detail-axis detail-axis-min">{min.toFixed(1)}</span>
        </div>
        <div className="detail-graph-stats">
          <span><b>{min.toFixed(1)}</b>{unit} {t('detail_min')}</span>
          <span><b>{avg.toFixed(1)}</b>{unit} {t('detail_avg')}</span>
          <span><b>{max.toFixed(1)}</b>{unit} {t('detail_max')}</span>
        </div>
      </>
    );
  }

  return (
    <div className="glass-card detail-graph" style={{ marginTop: 16 }}>
      <div className="detail-graph-head">
        <h4>{t('detail_history')}</h4>
        <div className="detail-graph-ranges">
          {RANGES.map((r) => (
            <button
              key={r.hours}
              className={`range-btn ${hours === r.hours ? 'active' : ''}`}
              onClick={() => setHours(r.hours)}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {body}
    </div>
  );
}
