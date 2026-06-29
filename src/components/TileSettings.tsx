import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { RoomEntity, TileAction, TileSize, FlyoutConfig } from '../types';
import { EntityPicker } from './DashboardView';
import { DetailPanel } from './DetailPanel';

const SIZES: TileSize[] = ['1x1', '2x1', '1x2', '2x2'];

/** Common services offered per domain, used to populate the quick-action service dropdown. */
const SERVICE_CATALOG: Record<string, string[]> = {
  light: ['turn_on', 'turn_off', 'toggle'],
  switch: ['turn_on', 'turn_off', 'toggle'],
  fan: ['turn_on', 'turn_off', 'toggle', 'increase_speed', 'decrease_speed', 'oscillate'],
  input_boolean: ['turn_on', 'turn_off', 'toggle'],
  cover: ['open_cover', 'close_cover', 'stop_cover', 'toggle'],
  lock: ['lock', 'unlock', 'open'],
  climate: ['turn_on', 'turn_off', 'set_temperature', 'set_hvac_mode', 'set_fan_mode', 'set_preset_mode'],
  media_player: ['turn_on', 'turn_off', 'media_play', 'media_pause', 'media_stop', 'media_next_track', 'media_previous_track', 'volume_up', 'volume_down', 'volume_mute'],
  vacuum: ['start', 'pause', 'stop', 'return_to_base', 'locate', 'clean_spot'],
  scene: ['turn_on'],
  script: ['turn_on', 'toggle'],
  button: ['press'],
  automation: ['trigger', 'turn_on', 'turn_off', 'toggle'],
  number: ['set_value'],
  select: ['select_option', 'select_next', 'select_previous'],
  input_number: ['set_value'],
  input_select: ['select_option'],
};

/** Domains a quick action can target (anything we know services for). */
const ACTION_DOMAINS = Object.keys(SERVICE_CATALOG);

/**
 * Services that need an extra parameter to do anything. Maps service → the
 * data field name and the entity attribute that lists valid options (if any).
 * `numeric` marks free-number inputs.
 */
const SERVICE_PARAMS: Record<string, { field: string; optionsAttr?: string; numeric?: boolean; label: string }> = {
  set_preset_mode: { field: 'preset_mode', optionsAttr: 'preset_modes', label: 'Preset' },
  set_hvac_mode: { field: 'hvac_mode', optionsAttr: 'hvac_modes', label: 'Mode' },
  set_fan_mode: { field: 'fan_mode', optionsAttr: 'fan_modes', label: 'Fan mode' },
  set_temperature: { field: 'temperature', numeric: true, label: 'Temperature' },
  select_option: { field: 'option', optionsAttr: 'options', label: 'Option' },
  set_value: { field: 'value', numeric: true, label: 'Value' },
};

type CallHA = (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => Promise<void>;

interface Props {
  re: RoomEntity;
  entities: HassEntities;
  onChange: (patch: Partial<RoomEntity>) => void;
  onRemove: () => void;
  onClose: () => void;
  callHA: CallHA;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
}

/** Per-tile settings popover: name, icon, size, camera, linked entities, quick actions. */
export function TileSettings({ re, entities, onChange, onRemove, onClose, callHA, getHistory }: Props) {
  const { t } = useTranslation();
  const [sub, setSub] = useState<'camera' | 'link' | 'artwork' | null>(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  // Local mirror for free-text fields so the caret doesn't jump to the end while
  // typing (the layout state round-trips asynchronously through the parent).
  const [nameDraft, setNameDraft] = useState(re.name ?? '');
  const [iconDraft, setIconDraft] = useState(re.icon ?? '');

  // Re-seed drafts when a different tile is opened.
  useEffect(() => {
    setNameDraft(re.name ?? '');
    setIconDraft(re.icon ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [re.entity_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const entity = entities[re.entity_id];
  const fallbackName = (entity?.attributes.friendly_name as string) || re.entity_id;
  const links = re.links ?? [];
  const actions = re.actions ?? [];

  const nameOf = (id: string) =>
    (entities[id]?.attributes.friendly_name as string) || id;

  // Entities that can be targeted by a quick action (domain has known services), sorted by name.
  const actionEntityOptions = Object.values(entities)
    .filter((e) => ACTION_DOMAINS.includes(e.entity_id.split('.')[0]))
    .map((e) => ({
      id: e.entity_id,
      name: (e.attributes.friendly_name as string) || e.entity_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const updateAction = (idx: number, patch: Partial<TileAction>) => {
    const next = actions.map((a, i) => (i === idx ? { ...a, ...patch } : a));
    onChange({ actions: next });
  };
  /** Set the target entity and derive its domain; reset service if it no longer applies. */
  const setActionTarget = (idx: number, target: string) => {
    const domain = target.split('.')[0];
    const services = SERVICE_CATALOG[domain] ?? [];
    const cur = actions[idx];
    const service = cur && services.includes(cur.service) ? cur.service : services[0] ?? '';
    const label = !cur?.label || cur.label === 'Action'
      ? nameOf(target)
      : cur.label;
    updateAction(idx, { target, domain, service, label, data: undefined });
  };
  /** Change the service and clear any parameter data tied to the previous service. */
  const setActionService = (idx: number, service: string) => {
    updateAction(idx, { service, data: undefined });
  };
  /** Set the parameter value for a parameterized service into action.data. */
  const setActionParam = (idx: number, field: string, value: unknown) => {
    updateAction(idx, { data: value === '' || value == null ? undefined : { [field]: value } });
  };
  const addAction = () =>
    onChange({ actions: [...actions, { label: 'Action', domain: '', service: '', target: undefined }] });
  const removeAction = (idx: number) =>
    onChange({ actions: actions.filter((_, i) => i !== idx) });

  return (
    <div className="ts-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head">
          <h3>{t('tile_edit')}</h3>
          <button className="edit-icon-btn" title={t('tile_close')} onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="ts-body">
          <div className="ts-entity">{re.entity_id}</div>

          {/* Name */}
          <label className="ts-field">
            <span>{t('tile_name')}</span>
            <input
              value={nameDraft}
              placeholder={fallbackName}
              onChange={(e) => {
                setNameDraft(e.target.value);
                onChange({ name: e.target.value || undefined });
              }}
            />
          </label>

          {/* Icon */}
          <label className="ts-field">
            <span>{t('tile_icon')}</span>
            <div className="ts-icon-row">
              {iconDraft && <span className={`mdi ${iconDraft}`} />}
              <input
                value={iconDraft}
                placeholder="mdi-garage"
                onChange={(e) => {
                  setIconDraft(e.target.value);
                  onChange({ icon: e.target.value || undefined });
                }}
              />
            </div>
          </label>

          {/* Size */}
          <div className="ts-field">
            <span>{t('tile_size')}</span>
            <div className="ts-size-row">
              {SIZES.map((s) => (
                <button
                  key={s}
                  className={`ts-size-btn ${(re.size ?? '1x1') === s ? 'active' : ''}`}
                  onClick={() => onChange({ size: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Slide to dim (lights only) — on by default */}
          {re.entity_id.split('.')[0] === 'light' && (
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>{t('tile_slide_dim')}</span>
                <small>{t('tile_slide_dim_desc')}</small>
              </div>
              <button
                className={`ts-switch ${re.slideDim !== false ? 'on' : ''}`}
                role="switch"
                aria-checked={re.slideDim !== false}
                onClick={() => onChange({ slideDim: re.slideDim === false ? undefined : false })}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
          )}

          {/* Slide to set position (covers only) — on by default */}
          {re.entity_id.split('.')[0] === 'cover' && (
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>Slide to set position</span>
                <small>Drag across the tile to open or close the cover to any position.</small>
              </div>
              <button
                className={`ts-switch ${re.slideDim !== false ? 'on' : ''}`}
                role="switch"
                aria-checked={re.slideDim !== false}
                onClick={() => onChange({ slideDim: re.slideDim === false ? undefined : false })}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
          )}

          {/* Reverse position slider (covers only) */}
          {re.entity_id.split('.')[0] === 'cover' && (
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>Reverse slider</span>
                <small>Flip the position slider direction so it matches how the cover moves.</small>
              </div>
              <button
                className={`ts-switch ${re.reverseSlider ? 'on' : ''}`}
                role="switch"
                aria-checked={!!re.reverseSlider}
                onClick={() => onChange({ reverseSlider: !re.reverseSlider })}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
          )}

          {/* Now-playing artwork background (media players only) — on by default */}
          {re.entity_id.split('.')[0] === 'media_player' && (
            <label className="ts-toggle-field">
              <div className="ts-toggle-text">
                <span>Show artwork</span>
                <small>Use the now-playing thumbnail as the tile background.</small>
              </div>
              <button
                className={`ts-switch ${re.mediaArtwork !== false ? 'on' : ''}`}
                role="switch"
                aria-checked={re.mediaArtwork !== false}
                onClick={() => onChange({ mediaArtwork: re.mediaArtwork === false ? undefined : false })}
              >
                <span className="ts-switch-knob" />
              </button>
            </label>
          )}

          {/* Artwork source entity (media players only) */}
          {re.entity_id.split('.')[0] === 'media_player' && re.mediaArtwork !== false && (
            <div className="ts-field">
              <span>Artwork source</span>
              <small className="ts-hint">Pull the thumbnail from a companion player (e.g. an Android TV/ADB entity) when this one has no artwork. Leave on Auto to detect it automatically.</small>
              <div className="ts-chip-row">
                {re.artworkEntity ? (
                  <span className="ts-chip">
                    {nameOf(re.artworkEntity)}
                    <button onClick={() => onChange({ artworkEntity: undefined })} title="Remove">
                      <span className="mdi mdi-close" />
                    </button>
                  </span>
                ) : (
                  <button className="ts-add" onClick={() => setSub('artwork')}>
                    <span className="mdi mdi-image-search" /> Auto
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Camera */}
          <div className="ts-field">
            <span>Camera feed</span>
            <div className="ts-chip-row">
              {re.camera ? (
                <span className="ts-chip">
                  {nameOf(re.camera)}
                  <button onClick={() => onChange({ camera: undefined })} title="Remove">
                    <span className="mdi mdi-close" />
                  </button>
                </span>
              ) : (
                <button className="ts-add" onClick={() => setSub('camera')}>
                  <span className="mdi mdi-cctv" /> Attach camera
                </button>
              )}
            </div>
          </div>

          {/* Linked entities */}
          <div className="ts-field">
            <span>Linked entities (shown in flyout)</span>
            <div className="ts-chip-row">
              {links.map((id) => (
                <span className="ts-chip" key={id}>
                  {nameOf(id)}
                  <button
                    onClick={() => onChange({ links: links.filter((l) => l !== id) })}
                    title="Remove"
                  >
                    <span className="mdi mdi-close" />
                  </button>
                </span>
              ))}
              <button className="ts-add" onClick={() => setSub('link')}>
                <span className="mdi mdi-link-variant" /> Add link
              </button>
            </div>
          </div>

          {/* Customize flyout */}
          <div className="ts-field">
            <span>Flyout contents</span>
            <button className="ts-flyout-btn" onClick={() => setFlyoutOpen(true)}>
              <span className="mdi mdi-tune-variant" /> Customize flyout…
            </button>
          </div>

          {/* Quick actions */}
          <div className="ts-field">
            <span>Quick actions (flyout buttons)</span>
            <div className="ts-actions">
              {actions.map((a, idx) => (
                <div className="ts-action" key={idx}>
                  <div className="ts-action-row">
                    <input
                      className="ts-action-label"
                      value={a.label}
                      placeholder="Label"
                      onChange={(e) => updateAction(idx, { label: e.target.value })}
                    />
                    <input
                      className="ts-action-icon"
                      value={a.icon ?? ''}
                      placeholder="mdi-flash"
                      onChange={(e) => updateAction(idx, { icon: e.target.value || undefined })}
                    />
                    <button className="edit-icon-btn danger" title="Remove" onClick={() => removeAction(idx)}>
                      <span className="mdi mdi-delete" />
                    </button>
                  </div>
                  <div className="ts-action-row">
                    <select
                      className="ts-action-select"
                      value={a.target ?? ''}
                      onChange={(e) => setActionTarget(idx, e.target.value)}
                    >
                      <option value="" disabled>
                        Choose entity…
                      </option>
                      {actionEntityOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                    <select
                      className="ts-action-select"
                      value={a.service}
                      disabled={!a.target}
                      onChange={(e) => setActionService(idx, e.target.value)}
                    >
                      {!a.target && <option value="">Pick entity first</option>}
                      {(SERVICE_CATALOG[a.target?.split('.')[0] ?? ''] ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(() => {
                    const param = SERVICE_PARAMS[a.service];
                    if (!param || !a.target) return null;
                    const ent = entities[a.target];
                    const opts = param.optionsAttr
                      ? ((ent?.attributes[param.optionsAttr] as string[]) ?? [])
                      : [];
                    const curVal = a.data?.[param.field];
                    return (
                      <div className="ts-action-row">
                        {param.numeric ? (
                          <input
                            className="ts-action-select"
                            type="number"
                            placeholder={param.label}
                            value={curVal != null ? String(curVal) : ''}
                            onChange={(e) =>
                              setActionParam(idx, param.field, e.target.value === '' ? '' : Number(e.target.value))
                            }
                          />
                        ) : (
                          <select
                            className="ts-action-select"
                            value={curVal != null ? String(curVal) : ''}
                            onChange={(e) => setActionParam(idx, param.field, e.target.value)}
                          >
                            <option value="" disabled>
                              {`Choose ${param.label.toLowerCase()}…`}
                            </option>
                            {opts.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ))}
              <button className="ts-add" onClick={addAction}>
                <span className="mdi mdi-plus" /> Add action
              </button>
            </div>
          </div>
        </div>

        <div className="ts-footer">
          <button
            className="edit-icon-btn danger"
            onClick={() => {
              if (window.confirm(`Remove the "${nameDraft || fallbackName}" tile?`)) {
                onRemove();
                onClose();
              }
            }}
          >
            <span className="mdi mdi-delete" /> Remove tile
          </button>
          <button className="toolbar-btn primary" onClick={onClose}>
            <span className="mdi mdi-check" /> Done
          </button>
        </div>
      </div>

      {sub === 'camera' && (
        <EntityPicker
          entities={entities}
          existing={new Set()}
          domainFilter={['camera']}
          title="Search cameras…"
          onClose={() => setSub(null)}
          onPick={(id) => { onChange({ camera: id }); setSub(null); }}
        />
      )}
      {sub === 'link' && (
        <EntityPicker
          entities={entities}
          existing={new Set([re.entity_id, ...links])}
          title="Search entities to link…"
          onClose={() => setSub(null)}
          onPick={(id) => { onChange({ links: [...links, id] }); setSub(null); }}
        />
      )}
      {sub === 'artwork' && (
        <EntityPicker
          entities={entities}
          existing={new Set([re.entity_id])}
          domainFilter={['media_player']}
          title="Search media players for artwork…"
          onClose={() => setSub(null)}
          onPick={(id) => { onChange({ artworkEntity: id }); setSub(null); }}
        />
      )}

      {flyoutOpen && (
        <div onClick={(e) => e.stopPropagation()}>
          <DetailPanel
            entityId={re.entity_id}
            entities={entities}
            cameraEntityId={re.camera}
            links={re.links}
            actions={re.actions}
            flyoutConfig={re.flyout}
            reverseSlider={re.reverseSlider}
            artworkEntity={re.artworkEntity}
            editing
            onFlyoutConfigChange={(patch) =>
              onChange({ flyout: { ...(re.flyout ?? {}), ...patch } as FlyoutConfig })
            }
            onClose={() => setFlyoutOpen(false)}
            callHA={callHA}
            getHistory={getHistory}
          />
        </div>
      )}
    </div>
  );
}
