import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { GlanceButtonConfig, GlanceMetric } from '../types';
import { AnimatedNumber } from './AnimatedNumber';
import { EntityPicker } from './DashboardView';
import {
  computeMetric,
  DEFAULT_GLANCE,
  METRICS,
  METRIC_OPTIONS,
  type GlanceItem,
  type MetricResult,
} from '../lib/glance';
import { eventTimeLabel, nextEventSummary, type CalendarEvent } from '../lib/calendar';

type CallHA = (
  domain: string,
  service: string,
  data?: Record<string, unknown>,
  target?: { entity_id: string | string[] },
) => Promise<void>;

interface Props {
  entities: HassEntities;
  /** Configured buttons for this view (falls back to defaults when unset). */
  glance?: GlanceButtonConfig[];
  /** Global per-metric exclusions, shared across every page (issue #10). When
   *  provided, these override each button's own `exclude` so a "lights on"
   *  count is identical on every view. */
  glanceExcludes?: Partial<Record<GlanceMetric, string[]>>;
  /** When true, the strip shows add/remove/configure controls. */
  editing?: boolean;
  /** Persist a new button configuration (edit mode). */
  onGlanceChange?: (next: GlanceButtonConfig[]) => void;
  /** Persist a metric's exclusions globally (applies to every page). */
  onGlanceExcludeChange?: (metric: GlanceMetric, exclude: string[]) => void;
  /** Open an entity's detail flyout (used by non-toggle list rows). */
  onOpenDetail?: (entityId: string) => void;
  /** Next-event calendar chip (issue #25): appended after the metric buttons
   *  when enabled; tapping opens the 7-day agenda flyout. */
  calendar?: { events: CalendarEvent[]; onOpen: () => void };
  /** Pages available as navigation-button targets (issue #29). */
  views?: { id: string; name: string; icon?: string }[];
  /** Jump to a page (navigation buttons). */
  onNavigate?: (viewId: string) => void;
  callHA: CallHA;
}

const ALWAYS_SHOW: GlanceMetric[] = ['lights', 'people'];

const domainForMetric = (m: GlanceMetric): string[] => {
  switch (m) {
    case 'lights': return ['light'];
    case 'switches': return ['switch'];
    case 'fans': return ['fan'];
    case 'locks': return ['lock'];
    case 'covers': return ['cover'];
    case 'climate': return ['climate'];
    case 'media': return ['media_player'];
    case 'people': return ['person'];
  }
};

/**
 * Configurable "at a glance" strip. Each button summarizes a metric (lights on,
 * indoor temperature, who's home, …) and — when enabled — opens a flyout listing
 * the exact entities behind the number. Toggle metrics (lights/switches/…) render
 * the flyout as a grid of pushable on/off buttons; others render a tappable list.
 * The whole strip is user-configurable in edit mode.
 */
export function GlanceStrip({
  entities,
  glance,
  glanceExcludes,
  editing = false,
  onGlanceChange,
  onGlanceExcludeChange,
  onOpenDetail,
  calendar,
  views,
  onNavigate,
  callHA,
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [editKey, setEditKey] = useState<string | null>(null);
  const { t } = useTranslation();

  const config = glance ?? DEFAULT_GLANCE;

  // Exclusions are global per metric: prefer the shared set, falling back to a
  // button's own stored excludes when no global map is supplied.
  const excludesFor = (c: GlanceButtonConfig): string[] =>
    glanceExcludes?.[c.metric] ?? c.exclude ?? [];

  const computed = useMemo(
    () =>
      config.map((c) => ({
        cfg: c,
        result: computeMetric(c.metric, entities, excludesFor(c)),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, entities, glanceExcludes],
  );

  const toggleItem = (item: GlanceItem) => {
    if (item.toggleKind === 'switch') {
      callHA('homeassistant', 'toggle', undefined, { entity_id: item.id });
    } else if (item.toggleKind === 'lock') {
      callHA('lock', item.on ? 'lock' : 'unlock', undefined, { entity_id: item.id });
    } else if (item.toggleKind === 'cover') {
      callHA('cover', item.on ? 'close_cover' : 'open_cover', undefined, { entity_id: item.id });
    }
  };

  const updateButton = (id: string, patch: Partial<GlanceButtonConfig>) =>
    onGlanceChange?.(config.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const removeButton = (id: string) =>
    onGlanceChange?.(config.filter((c) => c.id !== id));

  const addButton = () =>
    onGlanceChange?.([
      ...config,
      { id: `g-${Date.now().toString(36)}`, metric: 'lights', flyout: true },
    ]);

  const visible = computed.filter(({ cfg, result }) => {
    if (editing) return true;
    // Navigation shortcuts are always shown (they have no count to gate on).
    if (cfg.kind === 'nav') return true;
    if (ALWAYS_SHOW.includes(cfg.metric)) return true;
    if (cfg.metric === 'climate') return result.active;
    return result.count > 0;
  });

  if (!visible.length && !editing) return null;

  const open = computed.find((c) => c.cfg.id === openKey) ?? null;
  const editCfg = config.find((c) => c.id === editKey) ?? null;

  return (
    <>
      <div className={`glance-strip ${editing ? 'is-editing' : ''}`}>
        {visible.map(({ cfg, result }) => {
          // Page-shortcut button (issue #29): the target page's icon + name,
          // tap to navigate. Shares the editing controls below.
          if (cfg.kind === 'nav') {
            const target = views?.find((v) => v.id === cfg.view);
            const navLabel = cfg.label || target?.name || 'Page';
            const navIcon = target?.icon || 'mdi-view-dashboard';
            return (
              <div key={cfg.id} className="glance-stat-wrap">
                <button
                  type="button"
                  className="glance-stat clickable glance-nav"
                  onClick={!editing && target ? () => onNavigate?.(target.id) : undefined}
                  title={target ? t('glance_go_to', { page: target.name }) : t('glance_pick_page')}
                >
                  <span className={`mdi ${navIcon} glance-icon`} />
                  <div className="glance-text">
                    <span className="glance-value glance-nav-name">{navLabel}</span>
                    <span className="glance-label">
                      <span className="mdi mdi-arrow-right-thin" /> {t('glance_open')}
                    </span>
                  </div>
                </button>
                {editing && (
                  <div className="glance-edit-controls">
                    <button
                      type="button"
                      className="glance-edit-btn"
                      title={t('glance_configure')}
                      onClick={() => setEditKey(cfg.id)}
                    >
                      <span className="mdi mdi-cog" />
                    </button>
                    <button
                      type="button"
                      className="glance-edit-btn danger"
                      title={t('glance_remove')}
                      onClick={() => removeButton(cfg.id)}
                    >
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                )}
              </div>
            );
          }
          const label = cfg.label || result.label;
          const def = METRICS[cfg.metric];
          const flyoutEnabled = cfg.flyout !== false;
          const interactive = !editing && flyoutEnabled;
          const Chip = interactive ? 'button' : 'div';
          return (
            <div key={cfg.id} className="glance-stat-wrap">
              <Chip
                type={interactive ? 'button' : undefined}
                className={`glance-stat ${result.active ? 'active' : ''} ${interactive ? 'clickable' : ''}`}
                onClick={interactive ? () => setOpenKey(cfg.id) : undefined}
                aria-haspopup={interactive ? 'dialog' : undefined}
              >
                <span className={`mdi ${def.icon} glance-icon`} />
                <div className="glance-text">
                  <span className="glance-value">
                    {result.num != null ? (
                      <AnimatedNumber value={result.num} suffix={result.numSuffix} />
                    ) : (
                      result.value
                    )}
                  </span>
                  <span className="glance-label">{label}</span>
                </div>
              </Chip>
              {editing && (
                <div className="glance-edit-controls">
                  <button
                    type="button"
                    className="glance-edit-btn"
                    title={t('glance_configure')}
                    onClick={() => setEditKey(cfg.id)}
                  >
                    <span className="mdi mdi-cog" />
                  </button>
                  <button
                    type="button"
                    className="glance-edit-btn danger"
                    title={t('glance_remove')}
                    onClick={() => removeButton(cfg.id)}
                  >
                    <span className="mdi mdi-close" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {!editing && calendar && (() => {
          const headline = nextEventSummary(calendar.events);
          if (!headline) return null;
          const { next, moreToday } = headline;
          return (
            <button
              type="button"
              className="glance-stat clickable glance-cal"
              onClick={calendar.onOpen}
              aria-haspopup="dialog"
            >
              <span className="mdi mdi-calendar glance-icon" />
              <div className="glance-text">
                <span className="glance-value glance-cal-summary">{next.summary}</span>
                <span className="glance-label">
                  {eventTimeLabel(next)}
                  {moreToday > 0 && ` · +${moreToday} today`}
                </span>
              </div>
            </button>
          );
        })()}
        {editing && (
          <button type="button" className="glance-stat glance-add" onClick={addButton}>
            <span className="mdi mdi-plus glance-icon" />
            <span className="glance-label">{t('glance_add_button')}</span>
          </button>
        )}
      </div>

      {/* ── Flyout listing the entities behind a chip ── */}
      <div className={`detail-overlay ${open ? 'open' : ''}`} onClick={() => setOpenKey(null)} />
      <div className={`detail-panel glance-flyout ${open ? 'open' : ''}`}>
        {open && (
          <GlanceFlyout
            result={open.result}
            label={open.cfg.label || open.result.label}
            icon={METRICS[open.cfg.metric].icon}
            onClose={() => setOpenKey(null)}
            onToggle={toggleItem}
            onOpenDetail={(id) => {
              setOpenKey(null);
              onOpenDetail?.(id);
            }}
          />
        )}
      </div>

      {/* ── Per-button configuration (edit mode) ── */}
      {editCfg && (
        <GlanceButtonEditor
          cfg={editCfg}
          entities={entities}
          views={views ?? []}
          exclude={glanceExcludes?.[editCfg.metric] ?? editCfg.exclude ?? []}
          onChange={(patch) => updateButton(editCfg.id, patch)}
          onExcludeChange={(ids) => onGlanceExcludeChange?.(editCfg.metric, ids)}
          onClose={() => setEditKey(null)}
        />
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Flyout body — toggle grid for switchable metrics, list for the rest.
// ──────────────────────────────────────────────────────────────────────────
function GlanceFlyout({
  result,
  label,
  icon,
  onClose,
  onToggle,
  onOpenDetail,
}: {
  result: MetricResult;
  label: string;
  icon: string;
  onClose: () => void;
  onToggle: (item: GlanceItem) => void;
  onOpenDetail: (entityId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="detail-header">
        <h2>
          <span className={`mdi ${icon}`} style={{ marginRight: 8 }} />
          {capitalize(label)}
        </h2>
        <button className="detail-close" onClick={onClose}>
          <span className="mdi mdi-close" />
        </button>
      </div>

      {result.items.length === 0 ? (
        <div className="glass-card detail-links">
          <p className="glance-empty">{result.empty}</p>
        </div>
      ) : result.toggleable ? (
        <div className="glance-toggle-grid">
          {result.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`glance-toggle ${item.on ? 'on' : ''}`}
              onClick={() => onToggle(item)}
              title={item.on ? t('glance_tap_off') : t('glance_tap_on')}
            >
              <span className={`mdi ${item.icon} glance-toggle-icon`} />
              <span className="glance-toggle-name">{item.name}</span>
              <span className="glance-toggle-detail">{item.detail}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="glass-card detail-links">
          {result.items.map((item) => (
            <div className="detail-link-row" key={item.id}>
              <button className="detail-link-name" onClick={() => onOpenDetail(item.id)}>
                <span className={`mdi ${item.icon}`} />
                {item.name}
              </button>
              <span className={`detail-link-state ${item.on ? 'is-active' : ''}`}>
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ──────────────────────────────────────────────────────────────────────────
// Per-button editor modal.
// ──────────────────────────────────────────────────────────────────────────
function GlanceButtonEditor({
  cfg,
  entities,
  views,
  exclude,
  onChange,
  onExcludeChange,
  onClose,
}: {
  cfg: GlanceButtonConfig;
  entities: HassEntities;
  /** Pages available as navigation targets (issue #29). */
  views: { id: string; name: string; icon?: string }[];
  /** Global exclusions for this button's metric (shared across all pages). */
  exclude: string[];
  onChange: (patch: Partial<GlanceButtonConfig>) => void;
  onExcludeChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const { t } = useTranslation();
  const nameOf = (id: string) =>
    (entities[id]?.attributes.friendly_name as string) || id;
  const isNav = cfg.kind === 'nav';

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal glance-editor" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="mdi mdi-tune-variant" />
          <span className="glance-editor-title">{t('glance_button_title')}</span>
          <button className="edit-icon-btn" title={t('settings_close')} onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="glance-editor-body">
          <label className="glance-field">
            <span>{t('glance_type')}</span>
            <select
              value={isNav ? 'nav' : 'metric'}
              onChange={(e) =>
                onChange(
                  e.target.value === 'nav'
                    ? { kind: 'nav', view: cfg.view ?? views[0]?.id }
                    : { kind: undefined },
                )
              }
            >
              <option value="metric">{t('glance_metric_count')}</option>
              <option value="nav">{t('glance_page_shortcut')}</option>
            </select>
          </label>

          {isNav ? (
            <label className="glance-field">
              <span>{t('glance_opens_page')}</span>
              <select value={cfg.view ?? ''} onChange={(e) => onChange({ view: e.target.value })}>
                {!cfg.view && <option value="">{t('glance_pick_page_label')}</option>}
                {views.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="glance-field">
              <span>{t('glance_shows')}</span>
              <select
                value={cfg.metric}
                onChange={(e) => onChange({ metric: e.target.value as GlanceMetric, exclude: undefined })}
              >
                {METRIC_OPTIONS.map((o) => (
                  <option key={o.metric} value={o.metric}>
                    {t(o.nameKey)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="glance-field">
            <span>{t('glance_label')}</span>
            <input
              type="text"
              placeholder={
                isNav
                  ? views.find((v) => v.id === cfg.view)?.name ?? 'Page name'
                  : METRICS[cfg.metric].label
              }
              value={cfg.label ?? ''}
              onChange={(e) => onChange({ label: e.target.value || undefined })}
            />
          </label>

          {!isNav && (
          <label className="glance-field glance-field-row">
            <span>{t('glance_flyout_on_tap')}</span>
            <button
              type="button"
              className={`ts-switch ${cfg.flyout !== false ? 'on' : ''}`}
              role="switch"
              aria-checked={cfg.flyout !== false}
              onClick={() => onChange({ flyout: cfg.flyout === false })}
            >
              <span className="ts-switch-knob" />
            </button>
          </label>
          )}

          {!isNav && (
          <div className="glance-field">
            <span>{t('glance_exclude_entities')}</span>
            <p className="glance-field-hint">
              {t('glance_exclude_desc')}
            </p>
            <div className="glance-exclude-list">
              {exclude.length === 0 && <span className="glance-field-hint">{t('glance_none_excluded')}</span>}
              {exclude.map((id) => (
                <span className="glance-exclude-chip" key={id}>
                  {nameOf(id)}
                  <button
                    type="button"
                    title={t('glance_remove')}
                    onClick={() => onExcludeChange(exclude.filter((x) => x !== id))}
                  >
                    <span className="mdi mdi-close" />
                  </button>
                </span>
              ))}
            </div>
            <button type="button" className="glance-add-exclude" onClick={() => setPicking(true)}>
              <span className="mdi mdi-plus" /> {t('glance_exclude_entity')}
            </button>
          </div>
          )}
        </div>
      </div>

      {picking && (
        <EntityPicker
          entities={entities}
          existing={new Set(exclude)}
          domainFilter={domainForMetric(cfg.metric)}
          title={t('glance_exclude_entity_picker')}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            onExcludeChange([...exclude, id]);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
}
