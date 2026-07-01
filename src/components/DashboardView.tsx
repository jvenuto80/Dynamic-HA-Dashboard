import { useEffect, useMemo, useRef, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DashView, DashRow, MediaTileConfig, RoomEntity, NocConfig, NocNode, NocMetric } from '../types';
import { DeviceTile } from './DeviceTile';
import { CameraGrid } from './CameraGrid';
import { NocView } from './NocView';
import { MusicAssistantSearch, type SearchMusic, type PlayMusic, type GetMaPlayers } from './MusicAssistantSearch';
import { effectiveSize, sizeToSpan } from '../lib/tileSize';
import { viewRows } from '../lib/layout';
import { isSpecialTile, SPECIAL_TILES } from '../lib/musicAssistant';
import { isActiveState, entityIcon } from '../lib/entityInfo';
import { CalendarTile } from './CalendarTile';
import { groupMediaPlayers, pickRepresentative, deviceNameKey, collapseSpeakerGroups, mediaConfigFor as computeMediaConfig, artworkPickerExclusions } from '../lib/mediaDevices';
import { cameraProxyUrl } from '../hooks/useCameraFeed';
import { getSettings } from '../settings';
import { TileSettings } from './TileSettings';
import { useTranslation } from 'react-i18next';

/** Subscribe to the "compact sections" preference (live-updated from Settings).
 *  When on, sections flow into a responsive masonry so short sections sit
 *  side-by-side and fill horizontal space instead of stacking full-width with
 *  big vertical gaps. Section headings/separation are preserved. */
function useCompactSections(): boolean {
  const [compact, setCompact] = useState(() => getSettings().compactSections);
  useEffect(() => {
    const onChange = (e: Event) => setCompact((e as CustomEvent<boolean>).detail);
    window.addEventListener('ha:compact-sections', onChange);
    return () => window.removeEventListener('ha:compact-sections', onChange);
  }, []);
  return compact;
}

/** Subscribe to the "smart grouping" preference (issue #16, live-updated from
 *  Settings). When on, a section with no active device folds into a summary bar
 *  and reopens when something turns on (or on tap). */
function useSmartGrouping(): boolean {
  const [on, setOn] = useState(() => getSettings().smartGrouping);
  useEffect(() => {
    const onChange = (e: Event) => setOn((e as CustomEvent<boolean>).detail);
    window.addEventListener('ha:smart-grouping', onChange);
    return () => window.removeEventListener('ha:smart-grouping', onChange);
  }, []);
  return on;
}

/** Sections with fewer real entities than this never collapse (no point). */
const COLLAPSE_MIN_TILES = 2;

/**
 * A dashboard section (column) that can auto-collapse into a quiet summary bar
 * when nothing in it is active, and expand when something turns on (issue #16).
 *
 * Behavior is "auto + tap override": the effective state follows the section's
 * activity, but a tap pins it open or folded until the section's active/idle
 * status next flips, at which point auto resumes. When the feature is off (or
 * the section is too small) it renders exactly as before.
 */
function CollapsibleColumn({
  title,
  colEntities,
  entities,
  enabled,
  noCollapse,
  children,
}: {
  title: string;
  colEntities: RoomEntity[];
  entities: HassEntities;
  enabled: boolean;
  noCollapse?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  // Only real, present entities count toward activity and the device tally;
  // special cards (calendar / MA search) have no HA state.
  const present = colEntities.filter((e) => entities[e.entity_id]);
  const active = present.some((e) => isActiveState(entities[e.entity_id].state));
  const collapsible = enabled && !noCollapse && !!title && present.length >= COLLAPSE_MIN_TILES;

  // null = follow activity (auto); true/false = a tap override that holds until
  // the next activity change clears it.
  const [override, setOverride] = useState<boolean | null>(null);
  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current !== active) {
      prevActive.current = active;
      setOverride(null);
    }
  }, [active]);
  // A section that stops being collapsible (feature off, entities removed)
  // shouldn't carry a stale override.
  useEffect(() => {
    if (!collapsible) setOverride(null);
  }, [collapsible]);

  const expanded = !collapsible || (override ?? active);

  if (expanded) {
    return (
      <>
        {title && (
          <h3 className="column-title">
            <span>{title}</span>
            {collapsible && (
              <button
                type="button"
                className="section-fold"
                title={t('dash_collapse')}
                onClick={() => setOverride(false)}
              >
                <span className="mdi mdi-chevron-up" />
              </button>
            )}
          </h3>
        )}
        {children}
      </>
    );
  }

  const icons = present.slice(0, 4).map((e) => entityIcon(e.entity_id, entities[e.entity_id].state));
  return (
    <button type="button" className="section-collapsed" onClick={() => setOverride(true)}>
      <span className={`mdi ${icons[0] ?? 'mdi-dots-grid'} section-collapsed-lead`} />
      <span className="section-collapsed-name">{title}</span>
      <span className="section-collapsed-mini" aria-hidden="true">
        {icons.map((ic, i) => (
          <span key={i} className={`mdi ${ic}`} />
        ))}
      </span>
      <span className="section-collapsed-sum">{present.length} {t('dash_devices_quiet')}</span>
      <span className="mdi mdi-chevron-right section-collapsed-chev" />
    </button>
  );
}

type CallHA = (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => Promise<void>;

/** Build a camera proxy URL for a tile's optional embedded thumbnail. */
function tileCameraUrl(entities: HassEntities, cameraId?: string): string | undefined {
  if (!cameraId) return undefined;
  return cameraProxyUrl(entities[cameraId], cameraId);
}

export interface LayoutActions {
  setRows: (viewId: string, rows: DashRow[]) => void;
  addRow: (viewId: string) => void;
  removeRow: (viewId: string, rowIdx: number) => void;
  renameRow: (viewId: string, rowIdx: number, title: string) => void;
  moveRow: (viewId: string, fromIdx: number, toIdx: number) => void;
  addColumn: (viewId: string, rowIdx: number) => void;
  removeColumn: (viewId: string, rowIdx: number, colIdx: number) => void;
  renameColumn: (viewId: string, rowIdx: number, colIdx: number, title: string) => void;
  setColumnNoCollapse: (viewId: string, rowIdx: number, colIdx: number, noCollapse: boolean) => void;
  cycleTileSize: (viewId: string, rowIdx: number, colIdx: number, entIdx: number) => void;
  removeTile: (viewId: string, rowIdx: number, colIdx: number, entIdx: number) => void;
  addTile: (viewId: string, rowIdx: number, colIdx: number, entity: RoomEntity) => void;
  updateTile: (viewId: string, rowIdx: number, colIdx: number, entIdx: number, patch: Partial<RoomEntity>) => void;
  toggleMediaExclude: (viewId: string, entityId: string | string[], hidden?: boolean) => void;
  toggleMediaSearch: (viewId: string) => void;
  mergeMediaDevices: (viewId: string, entityIds: string[]) => void;
  unmergeMediaDevices: (viewId: string, entityIds: string[]) => void;
  setMediaTileSize: (viewId: string, size: DashView['mediaTileSize']) => void;
  toggleMediaSplitGroups: (viewId: string) => void;
  updateMediaDevices: (viewId: string, entityIds: string[], patch: Partial<MediaTileConfig>) => void;
  setHeaderVisibility: (
    viewId: string,
    patch: Partial<Pick<DashView, 'hideGreeting' | 'hideWeather' | 'hidePeople'>>,
  ) => void;
  setNoc: (viewId: string, noc: NocConfig | undefined) => void;
  addNocNode: (viewId: string) => string;
  removeNocNode: (viewId: string, nodeId: string) => void;
  moveNocNode: (viewId: string, fromIdx: number, toIdx: number) => void;
  updateNocNode: (viewId: string, nodeId: string, patch: Partial<NocNode>) => void;
  addNocMetric: (viewId: string, nodeId: string, entityId: string) => void;
  updateNocMetric: (viewId: string, nodeId: string, metricId: string, patch: Partial<NocMetric>) => void;
  removeNocMetric: (viewId: string, nodeId: string, metricId: string) => void;
  setNocDockerWatch: (viewId: string, nodeId: string, entityIds: string[]) => void;
}

interface Props {
  view: DashView;
  entities: HassEntities;
  onToggle: (entityId: string) => void;
  onOpenDetail: (entityId: string) => void;
  /** Open the full-bleed now-playing takeover for a playing media tile (issue #18). */
  onOpenTakeover?: (entityId: string) => void;
  /** Merged upcoming events for the "Up next" calendar tile (issue #25). */
  calendarEvents?: import('../lib/calendar').CalendarEvent[];
  /** Open the 7-day agenda flyout (issue #25). */
  onOpenCalendar?: () => void;
  callHA: CallHA;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
  editing: boolean;
  layout: LayoutActions;
  /** Switch the dashboard into edit mode (used by the empty-page call to action). */
  onRequestEdit?: () => void;
  /** Music Assistant search (for the special MA search tile). */
  searchMusic?: SearchMusic;
  /** Music Assistant playback (for the special MA search tile). */
  playMusic?: PlayMusic;
  /** Resolve Music Assistant media players (for the special MA search tile). */
  getMaPlayers?: GetMaPlayers;
}

export function DashboardView(props: Props) {
  const { t } = useTranslation();
  const { view, entities, editing } = props;
  const compactSections = useCompactSections();
  const smartGroupingEnabled = useSmartGrouping();

  if (view.kind === 'cameras') {
    return (
      <div className="view-rows">
        <section className="view-row">
          {editing ? (
            <div className="edit-empty">{t('dash_camera_not_editable')}</div>
          ) : (
            <CameraGrid entities={entities} />
          )}
        </section>
      </div>
    );
  }

  if (view.kind === 'media') {
    return <MediaAutoView {...props} />;
  }

  // A sensors view becomes the enterprise NOC overview once it has a `noc`
  // config (created via the board-type toggle). Classic sensor grids (no
  // `noc`) keep their existing graph rendering below.
  if (view.kind === 'sensors' && view.noc) {
    return (
      <NocView
        view={view}
        entities={entities}
        editing={editing}
        layout={props.layout}
        getHistory={props.getHistory}
        onOpenDetail={props.onOpenDetail}
        callHA={props.callHA}
      />
    );
  }

  if (editing) {
    return <EditableView {...props} />;
  }

  const rows = viewRows(view);
  // Running index across all tiles so each gets a slightly later entrance,
  // producing a gentle cascade when the view mounts/switches.
  let tileIndex = 0;

  // A page with no tiles (e.g. a freshly created one) gets a friendly call to
  // action instead of an empty void. Special (non-entity) tiles count too.
  const hasTiles = rows.some((r) =>
    r.columns.some((c) => c.entities.some((e) => entities[e.entity_id] || isSpecialTile(e.entity_id))),
  );
  if (!hasTiles) {
    return (
      <div className="view-rows">
        <div className="page-empty">
          <span className="mdi mdi-view-grid-plus page-empty-icon" />
          <h3>{t('dash_page_empty')}</h3>
          <p>{t('dash_add_tiles')}</p>
          {props.onRequestEdit && (
            <button className="toolbar-btn primary" onClick={props.onRequestEdit}>
              <span className="mdi mdi-pencil" /> {t('dash_edit_page')}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Compact sections: let short sections nestle side-by-side in a masonry so
  // they fill horizontal space instead of stacking full-width with big vertical
  // gaps (less scrolling on tablets). Headings + separation stay intact. Sensor
  // views keep the classic full-width stack (their graphs read better wide).
  const compact = compactSections && view.kind !== 'sensors';
  // Smart grouping only applies to ordinary tile sections, not media/camera/
  // sensor boards (those have their own layout).
  const smartGrouping = smartGroupingEnabled && (view.kind === undefined || view.kind === 'tiles');

  return (
    <div className={`view-rows ${compact ? 'compact' : ''}`} key={view.id}>
      {rows.map((row, ri) => (
        <section className="view-row" key={ri}>
          {row.title && <h2 className="row-title">{row.title}</h2>}
          <div className={`row-columns ${row.columns.length > 1 ? 'multi' : ''}`}>
            {row.columns.map((col, ci) => (
              <div className="row-column" key={ci}>
                <CollapsibleColumn
                  title={col.title ?? ''}
                  colEntities={col.entities}
                  entities={entities}
                  enabled={smartGrouping}
                  noCollapse={col.noCollapse}
                >
                  <div className="tile-grid">
                    {col.entities
                      .filter((e) => entities[e.entity_id] || isSpecialTile(e.entity_id))
                      .map((re) => (
                        <Tile key={re.entity_id} re={re} enterIndex={tileIndex++} {...props} />
                      ))}
                  </div>
                </CollapsibleColumn>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** A single read-only tile, sized from its effective size. */
function Tile({
  re,
  entities,
  onToggle,
  onOpenDetail,
  onOpenTakeover,
  callHA,
  getHistory,
  view,
  enterIndex,
  searchMusic,
  playMusic,
  getMaPlayers,
  calendarEvents,
  onOpenCalendar,
}: { re: RoomEntity; enterIndex?: number } & Props) {
  // Special (non-entity) tiles render their own card.
  if (isSpecialTile(re.entity_id)) {
    const def = SPECIAL_TILES[re.entity_id];
    if (re.entity_id === 'music_assistant.search' && searchMusic && playMusic) {
      return (
        <MusicAssistantSearch
          entities={entities}
          searchMusic={searchMusic}
          playMusic={playMusic}
          getMaPlayers={getMaPlayers}
          name={re.name || def.name}
          icon={re.icon || def.icon}
        />
      );
    }
    if (re.entity_id === 'glance.calendar') {
      return (
        <CalendarTile
          events={calendarEvents ?? []}
          name={re.name || def.name}
          icon={re.icon || def.icon}
          onOpen={onOpenCalendar}
        />
      );
    }
    return null;
  }

  const entity = entities[re.entity_id];
  if (!entity) return null;
  const name = re.name || (entity.attributes.friendly_name as string);
  const domain = re.entity_id.split('.')[0];
  const { span, tall } = sizeToSpan(effectiveSize(re, entity));
  return (
    <DeviceTile
      entity={entity}
      name={name}
      callHA={callHA}
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
      onOpenTakeover={onOpenTakeover}
      span={span}
      tall={tall}
      graph={view.kind === 'sensors' && domain === 'sensor'}
      getHistory={getHistory}
      cameraUrl={tileCameraUrl(entities, re.camera)}
      icon={re.icon}
      slideDim={re.slideDim}
      reverseSlider={re.reverseSlider}
      mediaArtwork={re.mediaArtwork}
      artworkEntity={re.artworkEntity}
      entities={entities}
      enterIndex={enterIndex}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Auto media view (kind: 'media'): every media_player is available; only the
// ones currently in use (playing/paused/buffering) are shown, minus the user's
// hidden list. In edit mode the user picks which devices are available.
// ──────────────────────────────────────────────────────────────────────────

/** A media player is "in use" when it's doing something other than off/idle. */
const MEDIA_INACTIVE = new Set(['off', 'idle', 'unavailable', 'standby', 'unknown', '']);
const isMediaActive = (state: string) => !MEDIA_INACTIVE.has(state);

function allMediaPlayers(entities: HassEntities) {
  return Object.values(entities)
    .filter((e) => e.entity_id.startsWith('media_player.'))
    .sort((a, b) => {
      const an = String(a.attributes.friendly_name ?? a.entity_id);
      const bn = String(b.attributes.friendly_name ?? b.entity_id);
      return an.localeCompare(bn);
    });
}

function MediaAutoView(props: Props) {
  const { t } = useTranslation();
  const { view, entities, editing, layout, searchMusic, playMusic, getMaPlayers } = props;
  const exclude = useMemo(() => new Set(view.mediaExclude ?? []), [view.mediaExclude]);
  const mediaOverrides = view.mediaOverrides ?? {};
  const players = useMemo(() => allMediaPlayers(entities), [entities]);
  const mergeGroups = view.mediaMerge ?? [];
  // Collapse the many media_player entities a single device exposes (Cast/ADB/
  // AirPlay/Kodi…) into one device, plus any manual merges. Members travel
  // together so hiding a device hides all of its entities.
  const devices = useMemo(
    () => groupMediaPlayers(players, mergeGroups),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, JSON.stringify(mergeGroups)],
  );
  const size = view.mediaTileSize ?? 'medium';
  const showSearch = !view.mediaHideSearch;
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [settingsIds, setSettingsIds] = useState<string[] | null>(null);

  const mediaConfigFor = (ids: string[]): MediaTileConfig =>
    computeMediaConfig(ids, mediaOverrides);

  const maTile =
    showSearch && searchMusic && playMusic ? (
      <MusicAssistantSearch
        entities={entities}
        searchMusic={searchMusic}
        playMusic={playMusic}
        getMaPlayers={getMaPlayers}
        name={SPECIAL_TILES['music_assistant.search'].name}
        icon={SPECIAL_TILES['music_assistant.search'].icon}
      />
    ) : null;

  if (editing) {
    const q = filter.trim().toLowerCase();
    const isMerged = (members: typeof players) => {
      // A device is "manually merged" if its members span >1 heuristic key.
      const keys = new Set(members.map((m) => deviceNameKey(m)));
      return keys.size > 1;
    };
    const rows = devices.map((members) => {
      const rep = pickRepresentative(members);
      const ids = members.map((m) => m.entity_id);
      const hidden = members.some((m) => exclude.has(m.entity_id));
      const active = members.find((m) => isMediaActive(m.state));
      const config = mediaConfigFor(ids);
      const matches =
        !q ||
        members.some(
          (m) =>
            String(m.attributes.friendly_name ?? m.entity_id).toLowerCase().includes(q) ||
            m.entity_id.toLowerCase().includes(q),
        );
      return {
        key: rep.entity_id,
        name: String(rep.attributes.friendly_name ?? rep.entity_id),
        state: active ? active.state : 'idle',
        count: members.length,
        ids,
        hidden,
        matches,
        merged: isMerged(members),
        config,
      };
    });
    const shown = rows.filter((r) => !r.hidden && r.matches);
    const hidden = rows.filter((r) => r.hidden && r.matches);

    const toggleSelect = (key: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });

    const selectedRows = rows.filter((r) => selected.has(r.key));
    const doMerge = () => {
      const ids = selectedRows.flatMap((r) => r.ids);
      if (ids.length) layout.mergeMediaDevices(view.id, ids);
      setSelected(new Set());
    };

    return (
      <div className="view-rows">
        <div className="media-edit-intro">
          <span className="mdi mdi-information-outline" /> {t('dash_media_desc')}
        </div>

        <label className="media-search-toggle">
          <div className="media-search-toggle-text">
            <span>
              <span className="mdi mdi-music-circle" /> {t('dash_music_search_btn')}
            </span>
            <small>{t('dash_show_search_btn')}</small>
          </div>
          <button
            type="button"
            className={`ts-switch ${showSearch ? 'on' : ''}`}
            role="switch"
            aria-checked={showSearch}
            onClick={() => layout.toggleMediaSearch(view.id)}
          >
            <span className="ts-switch-knob" />
          </button>
        </label>

        <label className="media-search-toggle">
          <div className="media-search-toggle-text">
            <span>
              <span className="mdi mdi-speaker-multiple" /> {t('dash_combine_speakers')}
            </span>
            <small>
              {t('dash_combine_speakers_desc')}
            </small>
          </div>
          <button
            type="button"
            className={`ts-switch ${!view.mediaSplitGroups ? 'on' : ''}`}
            role="switch"
            aria-checked={!view.mediaSplitGroups}
            onClick={() => layout.toggleMediaSplitGroups(view.id)}
          >
            <span className="ts-switch-knob" />
          </button>
        </label>

        <div className="media-size-row">
          <span className="media-size-label">{t('dash_tile_size')}</span>
          <div className="media-size-options">
            {(['small', 'medium', 'large'] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={`media-size-btn ${size === s ? 'on' : ''}`}
                onClick={() => layout.setMediaTileSize(view.id, s)}
              >
                {s === 'small' ? t('dash_small') : s === 'medium' ? t('dash_medium') : t('dash_large')}
              </button>
            ))}
          </div>
        </div>

        <div className="media-manage">
          <div className="media-filter">
            <span className="mdi mdi-magnify" />
            <input
              className="media-filter-input"
              placeholder={t('dash_filter_devices')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            {filter && (
              <button className="media-filter-clear" title={t('dash_clear')} onClick={() => setFilter('')}>
                <span className="mdi mdi-close" />
              </button>
            )}
          </div>

          {selected.size >= 2 && (
            <div className="media-merge-bar">
              <span>
                <span className="mdi mdi-merge" /> {selected.size} {t('dash_devices_selected')}
              </span>
              <div className="media-merge-actions">
                <button className="toolbar-btn" onClick={() => setSelected(new Set())}>
                  {t('dash_clear')}
                </button>
                <button className="toolbar-btn primary" onClick={doMerge}>
                  <span className="mdi mdi-merge" /> {t('dash_merge')}
                </button>
              </div>
            </div>
          )}

          <h3 className="media-manage-title">{t('dash_shown')} ({shown.length})</h3>
          <div className="media-manage-grid">
            {shown.map((r) => (
              <div
                className={`media-manage-row ${selected.has(r.key) ? 'is-selected' : ''}`}
                key={r.key}
              >
                <button
                  className="media-select"
                  title={selected.has(r.key) ? t('dash_deselect') : t('dash_select_merge')}
                  onClick={() => toggleSelect(r.key)}
                >
                  <span
                    className={`mdi ${selected.has(r.key) ? 'mdi-checkbox-marked-circle' : 'mdi-checkbox-blank-circle-outline'}`}
                  />
                </button>
                <span className="mdi mdi-cast-variant media-manage-icon" />
                <div className="media-manage-text">
                  <span className="media-manage-name">
                    {r.name}
                    {r.merged && (
                      <span className="media-merged-badge" title="Manually merged">
                        <span className="mdi mdi-merge" />
                      </span>
                    )}
                  </span>
                  <span className="media-manage-state">
                    {isMediaActive(r.state) ? r.state : 'idle'}
                    {r.count > 1 && ` · ${r.count} entities`}
                  </span>
                </div>
                <button
                  className="edit-icon-btn"
                  title={t('dash_artwork_settings')}
                  onClick={() => setSettingsIds(r.ids)}
                >
                  <span className="mdi mdi-image-edit-outline" />
                </button>
                {r.merged && (
                  <button
                    className="edit-icon-btn"
                    title={t('dash_split_device')}
                    onClick={() => layout.unmergeMediaDevices(view.id, r.ids)}
                  >
                    <span className="mdi mdi-call-split" />
                  </button>
                )}
                <button
                  className="edit-icon-btn danger"
                  title={t('dash_hide_device')}
                  onClick={() => layout.toggleMediaExclude(view.id, r.ids, true)}
                >
                  <span className="mdi mdi-eye-off" />
                </button>
              </div>
            ))}
            {shown.length === 0 && (
              <div className="edit-empty">
                {q ? t('dash_no_match') : t('dash_no_media')}
              </div>
            )}
          </div>

          {hidden.length > 0 && (
            <>
              <h3 className="media-manage-title media-manage-title-muted">{t('dash_hidden')} ({hidden.length})</h3>
              <div className="media-manage-grid">
                {hidden.map((r) => (
                  <div className="media-manage-row is-hidden" key={r.key}>
                    <span className="mdi mdi-cast-off media-manage-icon" />
                    <div className="media-manage-text">
                      <span className="media-manage-name">{r.name}</span>
                    </div>
                    <button
                      className="edit-icon-btn"
                      title={t('dash_artwork_settings')}
                      onClick={() => setSettingsIds(r.ids)}
                    >
                      <span className="mdi mdi-image-edit-outline" />
                    </button>
                    <button
                      className="edit-icon-btn"
                      title={t('dash_show_device')}
                      onClick={() => layout.toggleMediaExclude(view.id, r.ids, false)}
                    >
                      <span className="mdi mdi-eye" />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {settingsIds && (
          <MediaDeviceSettings
            entityIds={settingsIds}
            entities={entities}
            config={mediaConfigFor(settingsIds)}
            onChange={(patch) => layout.updateMediaDevices(view.id, settingsIds, patch)}
            onClose={() => setSettingsIds(null)}
          />
        )}
      </div>
    );
  }

  // Read mode: one tile per device that has an active member and isn't hidden.
  const active = devices
    .filter((members) => !members.some((m) => exclude.has(m.entity_id)))
    .map((members) => members.filter((m) => isMediaActive(m.state)))
    .filter((activeMembers) => activeMembers.length > 0)
    .map((activeMembers) => pickRepresentative(activeMembers, true));

  // Collapse synchronized speaker groups (e.g. a Cast "Kitchen Group" plus its
  // member speakers) to just the group's card, unless the page opts to show
  // every grouped speaker separately.
  const visible = view.mediaSplitGroups ? active : collapseSpeakerGroups(active, devices);

  if (active.length === 0) {
    return (
      <div className="view-rows" key={view.id}>
        {maTile && (
          <section className="view-row">
            <div className="row-columns">
              <div className="row-column">
                <div className={`tile-grid media-grid media-grid-${size}`}>{maTile}</div>
              </div>
            </div>
          </section>
        )}
        <div className="page-empty">
          <span className="mdi mdi-music-note-off page-empty-icon" />
          <h3>{t('dash_nothing_playing')}</h3>
          <p>{t('dash_nothing_playing_desc')}</p>
        </div>
      </div>
    );
  }

  let tileIndex = 0;
  return (
    <div className="view-rows" key={view.id}>
      <section className="view-row">
        <div className="row-columns">
          <div className="row-column">
            <div className={`tile-grid media-grid media-grid-${size}`}>
              {maTile}
              {visible.map((e) => {
                const members = devices.find((group) => group.some((m) => m.entity_id === e.entity_id)) ?? [e];
                const config = mediaConfigFor(members.map((m) => m.entity_id));
                return (
                  <DeviceTile
                    key={e.entity_id}
                    entity={e}
                    name={String(e.attributes.friendly_name ?? e.entity_id)}
                    callHA={props.callHA}
                    onToggle={props.onToggle}
                    onOpenDetail={props.onOpenDetail}
                    onOpenTakeover={props.onOpenTakeover}
                    mediaArtwork={config.mediaArtwork}
                    artworkEntity={config.artworkEntity}
                    entities={entities}
                    enterIndex={tileIndex++}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MediaDeviceSettings({
  entityIds,
  entities,
  config,
  onChange,
  onClose,
}: {
  entityIds: string[];
  entities: HassEntities;
  config: MediaTileConfig;
  onChange: (patch: Partial<MediaTileConfig>) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nameOf = (id: string) => String(entities[id]?.attributes.friendly_name ?? id);
  const title = nameOf(entityIds[0]);

  return (
    <div className="ts-overlay" onClick={onClose}>
      <div className="ts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head">
          <h3>{t('dash_media_tile')}</h3>
          <button className="edit-icon-btn" title={t('dash_close')} onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="ts-body">
          <div className="ts-entity">{title}</div>
          {entityIds.length > 1 && <small className="ts-hint">{t('dash_linked_entities', { count: entityIds.length })}</small>}

          <label className="ts-toggle-field">
            <div className="ts-toggle-text">
              <span>{t('dash_show_artwork')}</span>
              <small>{t('dash_show_artwork_desc')}</small>
            </div>
            <button
              className={`ts-switch ${config.mediaArtwork !== false ? 'on' : ''}`}
              role="switch"
              aria-checked={config.mediaArtwork !== false}
              onClick={() => onChange({ mediaArtwork: config.mediaArtwork === false ? undefined : false })}
            >
              <span className="ts-switch-knob" />
            </button>
          </label>

          {config.mediaArtwork !== false && (
            <div className="ts-field">
              <span>{t('dash_artwork_source')}</span>
              <small className="ts-hint">{t('dash_artwork_source_desc')}</small>
              <div className="ts-chip-row">
                {config.artworkEntity ? (
                  <span className="ts-chip">
                    {nameOf(config.artworkEntity)}
                    <button onClick={() => onChange({ artworkEntity: undefined })} title={t('dash_remove')}>
                      <span className="mdi mdi-close" />
                    </button>
                  </span>
                ) : (
                  <button className="ts-add" onClick={() => setPickerOpen(true)}>
                    <span className="mdi mdi-image-search" /> {t('dash_auto')}
                  </button>
                )}
                {config.artworkEntity && (
                  <button className="ts-add" onClick={() => setPickerOpen(true)}>
                    <span className="mdi mdi-pencil" /> {t('dash_change')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="ts-footer">
          <button className="toolbar-btn primary" onClick={onClose}>
            <span className="mdi mdi-check" /> {t('dash_done')}
          </button>
        </div>
      </div>

      {pickerOpen && (
        <EntityPicker
          entities={entities}
          existing={artworkPickerExclusions(entityIds)}
          domainFilter={['media_player']}
          title={t('dash_search_artwork')}
          onClose={() => setPickerOpen(false)}
          onPick={(id) => {
            onChange({ artworkEntity: id });
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Editable view: a stack of named rows, each divided into named columns.
// ──────────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  re: RoomEntity;
}
interface ColState {
  title?: string;
  noCollapse?: boolean;
  items: Item[];
}
interface RowState {
  title?: string;
  columns: ColState[];
}

function buildRows(rows: DashRow[]): RowState[] {
  return rows.map((row, ri) => ({
    title: row.title,
    columns: row.columns.map((col, ci) => ({
      title: col.title,
      noCollapse: col.noCollapse,
      items: col.entities.map((re, ei) => ({ id: `r${ri}-c${ci}-i${ei}-${re.entity_id}`, re })),
    })),
  }));
}

const colKey = (ri: number, ci: number) => `col-r${ri}-c${ci}`;

/** Locate the [rowIdx, colIdx] of a draggable item or a column droppable. */
function locate(rows: RowState[], id: string): [number, number] | null {
  const m = /^col-r(\d+)-c(\d+)$/.exec(id);
  if (m) return [Number(m[1]), Number(m[2])];
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < rows[ri].columns.length; ci++) {
      if (rows[ri].columns[ci].items.some((it) => it.id === id)) return [ri, ci];
    }
  }
  return null;
}

function EditableView(props: Props) {
  const { t } = useTranslation();
  const { view, entities, layout } = props;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>(() => buildRows(viewRows(view)));
  const [picker, setPicker] = useState<{ ri: number; ci: number } | null>(null);
  const [settings, setSettings] = useState<{ ri: number; ci: number; ei: number } | null>(null);

  // Re-sync from saved layout whenever it changes and we're not mid-drag.
  useEffect(() => {
    if (!activeId) setRows(buildRows(viewRows(view)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeItem = useMemo(() => {
    for (const r of rows) for (const c of r.columns) {
      const it = c.items.find((x) => x.id === activeId);
      if (it) return it;
    }
    return null;
  }, [activeId, rows]);

  const commit = (next: RowState[]) => {
    const dashRows: DashRow[] = next.map((r) => ({
      title: r.title,
      columns: r.columns.map((c) => ({ title: c.title, noCollapse: c.noCollapse, entities: c.items.map((it) => it.re) })),
    }));
    layout.setRows(view.id, dashRows);
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = locate(rows, String(active.id));
    const to = locate(rows, String(over.id));
    if (!from || !to) return;
    const [fr, fc] = from;
    const [tr, tc] = to;
    if (fr === tr && fc === tc) return;

    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, columns: r.columns.map((c) => ({ ...c, items: [...c.items] })) }));
      const fromItems = next[fr].columns[fc].items;
      const toItems = next[tr].columns[tc].items;
      const fromIdx = fromItems.findIndex((it) => it.id === active.id);
      if (fromIdx === -1) return prev;
      const [moved] = fromItems.splice(fromIdx, 1);
      const overIdx = toItems.findIndex((it) => it.id === over.id);
      toItems.splice(overIdx === -1 ? toItems.length : overIdx, 0, moved);
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) {
      commit(rows);
      return;
    }
    const from = locate(rows, String(active.id));
    const to = locate(rows, String(over.id));
    let next = rows;
    if (from && to && from[0] === to[0] && from[1] === to[1]) {
      const [ri, ci] = from;
      const items = rows[ri].columns[ci].items;
      const oldIdx = items.findIndex((it) => it.id === active.id);
      const newIdx = items.findIndex((it) => it.id === over.id);
      if (oldIdx !== newIdx && newIdx !== -1) {
        next = rows.map((r, i) =>
          i === ri
            ? {
                ...r,
                columns: r.columns.map((c, j) =>
                  j === ci ? { ...c, items: arrayMove(c.items, oldIdx, newIdx) } : c,
                ),
              }
            : r,
        );
        setRows(next);
      }
    }
    commit(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="view-rows editing">
        {rows.map((row, ri) => (
          <section className="edit-row" key={ri}>
            <div className="edit-row-head">
              <span className="mdi mdi-table-row edit-row-icon" />
              <input
                className="row-title-input"
                value={row.title ?? ''}
                placeholder={t('dash_row_name')}
                onChange={(ev) => layout.renameRow(view.id, ri, ev.target.value)}
              />
              <div className="edit-row-tools">
                <button
                  className="edit-icon-btn"
                  title={t('dash_move_row_up')}
                  disabled={ri === 0}
                  onClick={() => layout.moveRow(view.id, ri, ri - 1)}
                >
                  <span className="mdi mdi-arrow-up" />
                </button>
                <button
                  className="edit-icon-btn"
                  title={t('dash_move_row_down')}
                  disabled={ri === rows.length - 1}
                  onClick={() => layout.moveRow(view.id, ri, ri + 1)}
                >
                  <span className="mdi mdi-arrow-down" />
                </button>
                <button
                  className="edit-icon-btn"
                  title={t('dash_add_column')}
                  onClick={() => layout.addColumn(view.id, ri)}
                >
                  <span className="mdi mdi-table-column-plus-after" />
                </button>
                <button
                  className="edit-icon-btn danger"
                  title={t('dash_delete_row')}
                  onClick={() => {
                    const n = row.columns.reduce((s, c) => s + c.items.length, 0);
                    if (window.confirm(n ? t('dash_delete_row_confirm', { n }) : t('dash_delete_row_empty'))) {
                      layout.removeRow(view.id, ri);
                    }
                  }}
                >
                  <span className="mdi mdi-delete" />
                </button>
              </div>
            </div>

            <div
              className="edit-row-columns"
              style={{ gridTemplateColumns: `repeat(${row.columns.length}, minmax(220px, 1fr))` }}
            >
              {row.columns.map((col, ci) => (
                <div className="edit-column" key={ci}>
                  <div className="edit-column-head">
                    <input
                      className="column-title-input"
                      value={col.title ?? ''}
                      placeholder={t('dash_column_name')}
                      onChange={(ev) => layout.renameColumn(view.id, ri, ci, ev.target.value)}
                    />
                    <button
                      className={`edit-icon-btn ${col.noCollapse ? 'active' : ''}`}
                      title={col.noCollapse ? t('dash_grouping_disabled') : t('dash_never_collapse')}
                      aria-pressed={!!col.noCollapse}
                      onClick={() => layout.setColumnNoCollapse(view.id, ri, ci, !col.noCollapse)}
                    >
                      <span className={`mdi ${col.noCollapse ? 'mdi-pin' : 'mdi-pin-outline'}`} />
                    </button>
                    <button
                      className="edit-icon-btn danger"
                      title={t('dash_delete_column')}
                      disabled={row.columns.length === 1}
                      onClick={() => {
                        const n = col.items.length;
                        const s = n !== 1 ? 's' : '';
                        if (window.confirm(t('dash_delete_column_confirm', { n, s }))) {
                          layout.removeColumn(view.id, ri, ci);
                        }
                      }}
                    >
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                  <SortableContext items={col.items.map((it) => it.id)} strategy={rectSortingStrategy}>
                    <ColumnDroppable id={colKey(ri, ci)}>
                      {col.items.map((it, entIdx) => (
                        <SortableTile
                          key={it.id}
                          item={it}
                          rowIdx={ri}
                          colIdx={ci}
                          entIdx={entIdx}
                          onOpenSettings={() => setSettings({ ri, ci, ei: entIdx })}
                          {...props}
                        />
                      ))}
                      {col.items.length === 0 && <div className="edit-empty">{t('dash_drag_here')}</div>}
                    </ColumnDroppable>
                  </SortableContext>
                  <button className="add-tile-btn" onClick={() => setPicker({ ri, ci })}>
                    <span className="mdi mdi-plus" /> {t('dash_add_tile')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}

        <button className="add-section-btn" onClick={() => layout.addRow(view.id)}>
          <span className="mdi mdi-plus" /> {t('dash_add_row')}
        </button>
      </div>

      <DragOverlay>
        {activeItem
          ? (() => {
              const e = entities[activeItem.re.entity_id];
              if (!e) return null;
              const nm =
                activeItem.re.name || (e.attributes.friendly_name as string) || activeItem.re.entity_id;
              const dm = activeItem.re.entity_id.split('.')[0];
              return (
                <div className="edit-drag-overlay">
                  <DeviceTile
                    entity={e}
                    name={nm}
                    callHA={props.callHA}
                    onToggle={() => {}}
                    onOpenDetail={() => {}}
                    graph={view.kind === 'sensors' && dm === 'sensor'}
                    getHistory={props.getHistory}
                    icon={activeItem.re.icon}
                  />
                </div>
              );
            })()
          : null}
      </DragOverlay>

      {picker && (
        <EntityPicker
          entities={entities}
          existing={
            new Set(
              rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((it) => it.re.entity_id))),
            )
          }
          onClose={() => setPicker(null)}
          onPick={(entityId) => {
            layout.addTile(view.id, picker.ri, picker.ci, { entity_id: entityId });
            setPicker(null);
          }}
        />
      )}

      {settings && (() => {
        const re = rows[settings.ri]?.columns[settings.ci]?.items[settings.ei]?.re;
        if (!re) return null;
        return (
          <TileSettings
            re={re}
            entities={entities}
            onChange={(patch) =>
              layout.updateTile(view.id, settings.ri, settings.ci, settings.ei, patch)
            }
            onRemove={() => layout.removeTile(view.id, settings.ri, settings.ci, settings.ei)}
            onClose={() => setSettings(null)}
            callHA={props.callHA}
            getHistory={props.getHistory}
          />
        );
      })()}
    </DndContext>
  );
}

function ColumnDroppable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useSortable({ id });
  return (
    <div className="tile-grid" ref={setNodeRef} data-col={id}>
      {children}
    </div>
  );
}

function SortableTile({
  item,
  rowIdx,
  colIdx,
  entIdx,
  entities,
  layout,
  view,
  callHA,
  getHistory,
  onOpenSettings,
}: { item: Item; rowIdx: number; colIdx: number; entIdx: number; onOpenSettings: () => void } & Props) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [confirmDel, setConfirmDel] = useState(false);
  // Auto-cancel the delete confirmation after a few seconds if not acted on.
  useEffect(() => {
    if (!confirmDel) return;
    const timer = setTimeout(() => setConfirmDel(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmDel]);
  const entity = entities[item.re.entity_id];
  // In edit mode every tile occupies a single uniform grid cell so the
  // sortable math stays smooth and tiles never overlap while dragging.
  // The chosen size is still shown/edited via the resize control below.
  const size = effectiveSize(item.re, entity);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 180ms ease',
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 5 : undefined,
  };

  const special = isSpecialTile(item.re.entity_id);
  const specialDef = special ? SPECIAL_TILES[item.re.entity_id] : null;
  const name = special
    ? item.re.name || specialDef!.name
    : entity
      ? item.re.name || (entity.attributes.friendly_name as string)
      : item.re.entity_id;
  const domain = item.re.entity_id.split('.')[0];
  const missing = !entity && !special;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`edit-tile-wrap ${missing ? 'missing' : ''}`}
      {...attributes}
      {...listeners}
    >
      {special ? (
        <div className="tile ma-tile ma-tile-edit">
          <div className="tile-top">
            <span className={`mdi ${item.re.icon || specialDef!.icon} tile-icon ma-tile-icon`} />
          </div>
          <div className="tile-info">
            <div className="tile-name">{name}</div>
            <div className="tile-sub">Search &amp; play</div>
          </div>
          <span className="mdi mdi-magnify ma-tile-search" aria-hidden="true" />
        </div>
      ) : missing ? (
        <div className="tile edit-missing-tile">
          <span className="mdi mdi-help-circle-outline tile-icon" />
          <div className="tile-info">
            <div className="tile-name">{name}</div>
            <div className="tile-sub">Unavailable</div>
          </div>
        </div>
      ) : (
        <DeviceTile
          entity={entity}
          name={name}
          callHA={callHA}
          onToggle={onOpenSettings}
          onOpenDetail={onOpenSettings}
          graph={view.kind === 'sensors' && domain === 'sensor'}
          getHistory={getHistory}
          icon={item.re.icon}
        />
      )}
      <div className="edit-tile-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="edit-icon-btn"
          title={t('dash_edit_tile')}
          onClick={onOpenSettings}
        >
          <span className="mdi mdi-cog" />
        </button>
        <button
          className="edit-icon-btn size-btn"
          title={t('dash_size_resize', { size })}
          onClick={() => layout.cycleTileSize(view.id, rowIdx, colIdx, entIdx)}
        >
          {size}
        </button>
        {confirmDel ? (
          <button
            className="edit-icon-btn danger confirm-del"
            title={t('dash_click_to_delete')}
            onClick={() => layout.removeTile(view.id, rowIdx, colIdx, entIdx)}
          >
            <span className="mdi mdi-check" /> {t('dash_delete_q')}
          </button>
        ) : (
          <button
            className="edit-icon-btn danger"
            title={t('dash_remove_tile')}
            onClick={() => setConfirmDel(true)}
          >
            <span className="mdi mdi-close" />
          </button>
        )}
      </div>
      <span className="edit-drag-hint mdi mdi-drag" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Entity picker modal: searchable list of entities not already on the board.
// ──────────────────────────────────────────────────────────────────────────

const PICKER_DOMAINS = [
  'light', 'switch', 'fan', 'cover', 'lock', 'climate', 'media_player',
  'input_boolean', 'scene', 'script', 'button', 'sensor', 'binary_sensor',
  'vacuum', 'select', 'number',
];

export function EntityPicker({
  entities,
  existing,
  onClose,
  onPick,
  domainFilter,
  title,
}: {
  entities: HassEntities;
  existing: Set<string>;
  onClose: () => void;
  onPick: (entityId: string) => void;
  domainFilter?: string[];
  title?: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allowed = domainFilter ?? PICKER_DOMAINS;

  // Special (non-entity) cards — only offered in the general add-tile picker
  // (no domain filter), not in scene/exclude pickers.
  const specials = useMemo(() => {
    if (domainFilter) return [];
    const q = query.trim().toLowerCase();
    return Object.entries(SPECIAL_TILES)
      .filter(([id, def]) => {
        if (existing.has(id)) return false;
        if (!q) return true;
        return def.name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
      })
      .map(([id, def]) => ({ id, ...def }));
  }, [domainFilter, query, existing]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(entities)
      .filter((e) => {
        const domain = e.entity_id.split('.')[0];
        if (!allowed.includes(domain)) return false;
        if (existing.has(e.entity_id)) return false;
        if (!q) return true;
        const name = String(e.attributes.friendly_name ?? '').toLowerCase();
        return name.includes(q) || e.entity_id.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const an = String(a.attributes.friendly_name ?? a.entity_id);
        const bn = String(b.attributes.friendly_name ?? b.entity_id);
        return an.localeCompare(bn);
      })
      .slice(0, 200);
  }, [entities, existing, query, allowed]);

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="mdi mdi-magnify" />
          <input
            autoFocus
            className="picker-search"
            placeholder={title ?? t('dash_search_entities')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="edit-icon-btn" title={t('dash_close')} onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>
        <div className="picker-list">
          {specials.map((s) => (
            <button key={s.id} className="picker-item picker-special" onClick={() => onPick(s.id)}>
              <span className="picker-item-name">
                <span className={`mdi ${s.icon} picker-special-icon`} /> {s.name}
              </span>
              <span className="picker-special-badge">{t('dash_card')}</span>
            </button>
          ))}
          {results.length === 0 && specials.length === 0 && (
            <div className="picker-empty">{t('dash_no_entities')}</div>
          )}
          {results.map((e) => {
            const name = String(e.attributes.friendly_name ?? e.entity_id);
            return (
              <button key={e.entity_id} className="picker-item" onClick={() => onPick(e.entity_id)}>
                <span className="picker-item-name">{name}</span>
                <span className="picker-item-id">{e.entity_id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
