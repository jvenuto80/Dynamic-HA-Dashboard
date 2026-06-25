import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useLayout } from './hooks/useLayout';
import { useSwipeNav } from './hooks/useSwipeNav';
import { useIdle } from './hooks/useIdle';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ScenePills } from './components/ScenePills';
import { GlanceStrip } from './components/GlanceStrip';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { DashboardView } from './components/DashboardView';
import { DetailPanel } from './components/DetailPanel';
import { EntityPicker } from './components/DashboardView';
import { SettingsModal } from './components/SettingsModal';
import { NowPlayingTakeover } from './components/NowPlayingTakeover';
import { Screensaver } from './components/Screensaver';
import { CalendarFlyout } from './components/CalendarFlyout';
import { activeCalendarIds, parseEventsResponse, type CalendarEvent, type CalendarServiceResponse } from './lib/calendar';
import { PagesManager } from './components/PagesManager';
import { PageDots } from './components/PageDots';
import { Onboarding } from './components/Onboarding';
import { viewRows } from './lib/layout';
import { effectiveSize, sizeToSpan } from './lib/tileSize';
import { getSettings } from './settings';
import { runNavTransition } from './lib/viewTransition';
import { scenes, HA_TOKEN } from './config';
import type { RoomEntity, DashView } from './types';

export default function App() {
  const { t } = useTranslation();
  const { entities, connected, error, callHA, getForecast, getHistory, getCalendarEvents, searchMusic, playMusic, getMaPlayers } = useHomeAssistant();
  const layout = useLayout();
  const { views } = layout;
  const [activeView, setActiveView] = useState<string>('main');
  const [detailEntity, setDetailEntity] = useState<string | null>(null);
  // Full-bleed now-playing "lock screen" (issue #18), opened by tapping a
  // playing media tile that carries artwork.
  const [takeoverEntity, setTakeoverEntity] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [scenePicker, setScenePicker] = useState(false);
  // First-run guided setup shows when no token is configured; can be dismissed
  // for this session to explore the shell without connecting.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const needsOnboarding = !HA_TOKEN && !onboardingDismissed;
  // Actively connecting (token present, nothing streamed yet, no hard error):
  // show shimmer skeletons instead of an empty grid. In dev, `?skeleton` forces
  // this state so the loading look can be previewed without a real cold start.
  const forceSkeleton =
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('skeleton');
  const booting =
    forceSkeleton ||
    (!!HA_TOKEN && !connected && !error && Object.keys(entities).length === 0);

  // ── Now-playing takeover toggle (issue #18) ──
  // When off (Settings → Appearance), media tiles fall back to the old
  // tap-opens-flyout behavior; an already-open takeover closes immediately.
  const [takeoverEnabled, setTakeoverEnabled] = useState(() => getSettings().nowPlayingTakeover);
  useEffect(() => {
    const onChange = (e: Event) => {
      const enabled = (e as CustomEvent<boolean>).detail;
      setTakeoverEnabled(enabled);
      if (!enabled) setTakeoverEntity(null);
    };
    window.addEventListener('ha:np-takeover', onChange);
    return () => window.removeEventListener('ha:np-takeover', onChange);
  }, []);

  // ── Idle screensaver (issue #20) ──
  // After the configured idle minutes (Settings → Appearance; 0 = off) the
  // dashboard drifts to a clock + ambient art. Any input wakes it. Suppressed
  // while editing or in a modal where an unexpected takeover would be hostile.
  const [saverMinutes, setSaverMinutes] = useState(() => getSettings().screensaverMinutes);
  useEffect(() => {
    const onChange = (e: Event) => setSaverMinutes((e as CustomEvent<number>).detail);
    window.addEventListener('ha:screensaver-minutes', onChange);
    return () => window.removeEventListener('ha:screensaver-minutes', onChange);
  }, []);
  const idle = useIdle(saverMinutes > 0 ? saverMinutes * 60_000 : 0);
  const showScreensaver = idle && !editing && !showSettings && !needsOnboarding && !booting;

  // ── Calendar agenda (issue #25) ──
  // One merged 7-day fetch feeds every surface: the at-a-glance chip, the
  // optional "Up next" tile, the screensaver agenda and the flyout. Refreshes
  // on a slow timer and when the tab becomes visible again — calendar data
  // doesn't change fast enough to justify hammering HA.
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarIdsKey = activeCalendarIds(entities).join(',');
  useEffect(() => {
    const ids = calendarIdsKey ? calendarIdsKey.split(',') : [];
    if (!connected || !ids.length) {
      setCalendarEvents([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const resp = (await getCalendarEvents(ids, 7)) as CalendarServiceResponse;
      if (!cancelled) setCalendarEvents(parseEventsResponse(resp));
    };
    load();
    const timer = setInterval(load, 15 * 60_000);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [connected, calendarIdsKey, getCalendarEvents]);
  const calendarChip = getSettings().calendarChip && calendarEvents.length > 0;

  /** Add a new page and jump to it so it can be filled in straight away. */
  const handleAddView = useCallback(() => {
    const id = layout.addView();
    setActiveView(id);
  }, [layout]);

  /** Remove a page, moving off it first if it's the one being viewed. */
  const handleRemoveView = useCallback(
    (id: string) => {
      setActiveView((cur) => {
        if (cur !== id) return cur;
        const remaining = views.filter((v) => v.id !== id);
        return remaining[0]?.id ?? 'main';
      });
      layout.removeView(id);
    },
    [layout, views],
  );

  // ── Page navigation (sidebar tap, dot tap, and phone swipe) ──
  const mainRef = useRef<HTMLElement>(null);

  /** Jump to a page by id, sliding in the direction of travel relative to the
   *  current page's position in the list. */
  const goToView = useCallback(
    (id: string) => {
      if (id === activeView) return;
      const from = views.findIndex((v) => v.id === activeView);
      const to = views.findIndex((v) => v.id === id);
      const dir = to >= from ? 'next' : 'prev';
      runNavTransition(dir, () => setActiveView(id));
    },
    [activeView, views],
  );

  /** Advance to the adjacent page (used by swipe). Wraps around the ends so a
   *  left swipe off the last page loops to the first, and a right swipe off the
   *  first loops to the last. No-op with a single page. */
  const goAdjacent = useCallback(
    (dir: 'next' | 'prev') => {
      const n = views.length;
      if (n <= 1) return;
      const i = views.findIndex((v) => v.id === activeView);
      const j = dir === 'next' ? (i + 1) % n : (i - 1 + n) % n;
      runNavTransition(dir, () => setActiveView(views[j].id));
    },
    [activeView, views],
  );

  useSwipeNav(mainRef, { onSwipe: goAdjacent });

  // Map of entity_id -> configured tile (camera, links, quick actions) for the flyout.
  const configFor = useMemo(() => {
    const map: Record<string, RoomEntity> = {};
    for (const v of views) {
      for (const [entityId, cfg] of Object.entries(v.mediaOverrides ?? {})) {
        map[entityId] = { ...(map[entityId] ?? { entity_id: entityId }), ...cfg };
      }
      for (const row of viewRows(v)) {
        for (const col of row.columns) {
          for (const e of col.entities) {
            if (e.camera || e.links?.length || e.actions?.length || e.flyout || e.reverseSlider || e.artworkEntity || e.mediaArtwork === false) map[e.entity_id] = e;
          }
        }
      }
    }
    return map;
  }, [views]);

  const toggleEntity = useCallback(async (entityId: string) => {
    const domain = entityId.split('.')[0];
    const entity = entities[entityId];
    if (!entity) return;

    if (domain === 'scene' || domain === 'script') {
      await callHA(domain, 'turn_on', undefined, { entity_id: entityId });
    } else if (domain === 'button') {
      await callHA('button', 'press', undefined, { entity_id: entityId });
    } else if (domain === 'cover') {
      const service = entity.state === 'open' ? 'close_cover' : 'open_cover';
      await callHA('cover', service, undefined, { entity_id: entityId });
    } else if (domain === 'lock') {
      const service = entity.state === 'locked' ? 'unlock' : 'lock';
      await callHA('lock', service, undefined, { entity_id: entityId });
    } else {
      await callHA('homeassistant', 'toggle', undefined, { entity_id: entityId });
    }
  }, [entities, callHA]);

  const view = views.find((v) => v.id === activeView) ?? views[0];
  // Resolve the view's scene list in its configured order. Scenes that aren't in
  // the static catalog still render using their HA friendly name and a default look.
  const viewScenes = useMemo(() => {
    if (!view.scenes) return [];
    return view.scenes
      .filter((id) => entities[id])
      .map((id) => {
        const known = scenes.find((s) => s.entity_id === id);
        if (known) return known;
        const name = String(entities[id]?.attributes.friendly_name ?? id);
        return { entity_id: id, name, icon: 'mdi-palette', color: '#6366f1' };
      });
  }, [view.scenes, entities]);

  return (
    <div className={`app ${editing ? 'app-editing' : ''}`}>
      <AmbientBackdrop entities={entities} />
      <Sidebar
        views={views}
        activeView={activeView}
        editing={editing}
        onNavigate={goToView}
        onOpenSettings={() => setShowSettings(true)}
        onAddPage={handleAddView}
        onManagePages={() => setShowPages(true)}
      />

      <main className="main-content" ref={mainRef}>
        <Header
          entities={entities}
          getForecast={getForecast}
          hideGreeting={view.hideGreeting}
          hideWeather={view.hideWeather}
          hidePeople={view.hidePeople}
        />

        {view.kind !== 'cameras' && view.kind !== 'sensors' && (
          <GlanceStrip
            entities={entities}
            glance={view.glance}
            glanceExcludes={layout.glanceExcludes}
            editing={editing}
            onGlanceChange={(g) => layout.setGlance(view.id, g)}
            onGlanceExcludeChange={layout.setGlanceExclude}
            onOpenDetail={setDetailEntity}
            calendar={calendarChip ? { events: calendarEvents, onOpen: () => setCalendarOpen(true) } : undefined}
            views={views}
            onNavigate={goToView}
            callHA={callHA}
          />
        )}

        {editing && view.kind !== 'cameras' && (
          <div className="glass-card scenes-card scenes-edit-card">
            <h3 className="block-title">{t('app_scenes')}</h3>
            <div className="scenes-edit-row">
              {viewScenes.map((scene, idx) => (
                <div key={scene.entity_id} className="scene-edit-pill">
                  <div
                    className="scene-icon"
                    style={{ background: `${scene.color}33` }}
                  >
                    <span className={`mdi ${scene.icon}`} />
                  </div>
                  <span className="scene-label">{scene.name}</span>
                  <div className="scene-edit-tools">
                    <button
                      className="edit-icon-btn"
                      title={t('app_move_left')}
                      disabled={idx === 0}
                      onClick={() => layout.moveScene(view.id, idx, idx - 1)}
                    >
                      <span className="mdi mdi-chevron-left" />
                    </button>
                    <button
                      className="edit-icon-btn"
                      title={t('app_move_right')}
                      disabled={idx === viewScenes.length - 1}
                      onClick={() => layout.moveScene(view.id, idx, idx + 1)}
                    >
                      <span className="mdi mdi-chevron-right" />
                    </button>
                    <button
                      className="edit-icon-btn danger"
                      title={t('app_remove_scene')}
                      onClick={() => layout.removeScene(view.id, scene.entity_id)}
                    >
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                </div>
              ))}
              <button className="add-tile-btn scene-add-btn" onClick={() => setScenePicker(true)}>
                <span className="mdi mdi-plus" /> {t('app_add_scene')}
              </button>
            </div>
          </div>
        )}

        <div className="view-heading-row">
          <h1 className="view-heading">{view.name}</h1>
          <div className="edit-toolbar">
            {editing ? (
              <>
                <span className="edit-status">
                  {layout.saving ? (
                    <>
                      <span className="mdi mdi-loading mdi-spin" /> {t('app_saving')}
                    </>
                  ) : (
                    <>
                      <span className="mdi mdi-check-circle-outline" /> {t('app_saved')}
                    </>
                  )}
                </span>
                <button
                  className="toolbar-btn"
                  onClick={() => {
                    if (confirm(t('app_reset_confirm'))) layout.resetLayout();
                  }}
                >
                  <span className="mdi mdi-restore" />{' '}{t('app_reset')}
                </button>
                <button className="toolbar-btn primary" onClick={() => setEditing(false)}>
                  <span className="mdi mdi-check" />{' '}{t('app_done')}
                </button>
              </>
            ) : (
              <button className="toolbar-btn" onClick={() => setEditing(true)}>
                <span className="mdi mdi-pencil" />{' '}{t('app_edit')}
              </button>
            )}
          </div>
        </div>

        {booting ? (
          <SkeletonGrid view={view} />
        ) : (
          <DashboardView
            view={view}
            entities={entities}
            onToggle={toggleEntity}
            onOpenDetail={setDetailEntity}
            onOpenTakeover={takeoverEnabled ? setTakeoverEntity : undefined}
            calendarEvents={calendarEvents}
            onOpenCalendar={() => setCalendarOpen(true)}
            callHA={callHA}
            getHistory={getHistory}
            editing={editing}
            layout={layout}
            onRequestEdit={() => setEditing(true)}
            searchMusic={searchMusic}
            playMusic={playMusic}
            getMaPlayers={getMaPlayers}
          />
        )}

        {!editing && viewScenes.length > 0 && (
          <div className="glass-card scenes-card scenes-bottom">
            <h3 className="block-title">{t('app_scenes')}</h3>
            <ScenePills entities={entities} onToggle={toggleEntity} scenes={viewScenes} />
          </div>
        )}
      </main>

      <PageDots views={views} activeView={activeView} onJump={goToView} />

      <DetailPanel
        entityId={detailEntity}
        entities={entities}
        cameraEntityId={detailEntity ? configFor[detailEntity]?.camera : undefined}
        links={detailEntity ? configFor[detailEntity]?.links : undefined}
        actions={detailEntity ? configFor[detailEntity]?.actions : undefined}
        flyoutConfig={detailEntity ? configFor[detailEntity]?.flyout : undefined}
        reverseSlider={detailEntity ? configFor[detailEntity]?.reverseSlider : undefined}
        artworkEntity={detailEntity ? configFor[detailEntity]?.artworkEntity : undefined}
        onOpenDetail={setDetailEntity}
        onClose={() => {
          // Clear the shared-element transition flag so the spring entrance is
          // available again the next time the flyout opens normally.
          document.documentElement.classList.remove('vt-active');
          setDetailEntity(null);
        }}
        callHA={callHA}
        getHistory={getHistory}
      />

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          entities={entities}
          views={views}
          onResetLayout={layout.resetLayout}
          onStartBlank={layout.startBlank}
          onExportLayout={layout.exportLayout}
          onImportLayout={layout.importLayout}
        />
      )}

      {showPages && (
        <PagesManager
          views={views}
          activeView={activeView}
          onNavigate={goToView}
          onAdd={handleAddView}
          onRename={layout.renameView}
          onIcon={layout.updateViewIcon}
          onMove={layout.moveView}
          onRemove={handleRemoveView}
          onSetBoardType={(id, type) => {
            const v = views.find((x) => x.id === id);
            if (type === 'noc') {
              layout.setViewKind(id, 'sensors');
              if (!v?.noc) layout.setNoc(id, { nodes: [] });
            } else {
              if (v?.noc) layout.setNoc(id, undefined);
              layout.setViewKind(id, type === 'tiles' ? 'tiles' : type);
            }
          }}
          onSetHeader={layout.setHeaderVisibility}
          onClose={() => setShowPages(false)}
        />
      )}

      {scenePicker && (
        <EntityPicker
          entities={entities}
          existing={new Set(view.scenes ?? [])}
          domainFilter={['scene']}
          title={t('app_search_scenes')}
          onClose={() => setScenePicker(false)}
          onPick={(entityId) => {
            layout.addScene(view.id, entityId);
            setScenePicker(false);
          }}
        />
      )}

      {takeoverEntity && (
        <NowPlayingTakeover
          entityId={takeoverEntity}
          entities={entities}
          callHA={callHA}
          artworkEntity={configFor[takeoverEntity]?.artworkEntity}
          onClose={() => setTakeoverEntity(null)}
          onOpenDetail={setDetailEntity}
        />
      )}

      {calendarOpen && (
        <CalendarFlyout
          events={calendarEvents}
          entities={entities}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      {showScreensaver && (() => {
        // Configurable wake-onto-page shortcut (issue #28).
        const shortcutView = views.find((v) => v.id === getSettings().screensaverShortcut);
        // Devices hidden on the media page stay hidden from the now-playing
        // pill too (issue #31 — e.g. remote Plex friends' sessions).
        const mediaViews = views.filter((v) => v.kind === 'media');
        return (
          <Screensaver
            entities={entities}
            calendarEvents={calendarEvents}
            shortcut={shortcutView ? { name: shortcutView.name, icon: shortcutView.icon } : undefined}
            onShortcut={shortcutView ? () => goToView(shortcutView.id) : undefined}
            mediaExclude={mediaViews.flatMap((v) => v.mediaExclude ?? [])}
            mediaMerge={mediaViews.flatMap((v) => v.mediaMerge ?? [])}
          />
        );
      })()}

      {needsOnboarding && <Onboarding onDismiss={() => setOnboardingDismissed(true)} />}

      {error && !needsOnboarding && (
        <div className="connection-bar error">
          <span className="mdi mdi-alert-circle" /> {error}
        </div>
      )}
      {!connected && !error && !needsOnboarding && (
        <div className="connection-bar connecting">
          <span className="mdi mdi-loading mdi-spin" /> {t('connecting')}
        </div>
      )}
    </div>
  );
}

/** Shimmer placeholders shown while the first entity snapshot is loading.
 *
 *  The layout (rows/columns/tiles + their sizes) is already known at boot — it
 *  loads from the add-on independently of the Home Assistant connection — so the
 *  skeleton mirrors the *actual* current view: same row/column headings, same
 *  tile counts, same spans. When the first entity snapshot streams in and the
 *  real grid renders, tiles land exactly where their placeholders were, so there
 *  is no layout shift or reflow. */
function SkeletonGrid({ view }: { view: DashView }) {
  const rows = viewRows(view);
  const compact = getSettings().compactSections && view.kind !== 'sensors';

  // Mirror the real grid's tile slots (with their spans). Falls back to a
  // generic block for views whose layout has no entity tiles (e.g. an empty or
  // camera/media page) so the shimmer still has a plausible shape.
  const slots = rows.flatMap((row, ri) =>
    row.columns.flatMap((col, ci) =>
      col.entities.map((re, ei) => ({ key: `${ri}-${ci}-${ei}`, re })),
    ),
  );

  if (!slots.length) {
    return (
      <div className="view-rows" aria-hidden="true">
        <section className="view-row">
          <div className="row-columns">
            <div className="row-column">
              <div className="tile-grid">
                {Array.from({ length: 8 }).map((_, i) => (
                  <SkeletonTile key={i} />
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={`view-rows ${compact ? 'compact' : ''}`} aria-hidden="true">
      {rows.map((row, ri) => (
        <section className="view-row" key={ri}>
          {row.title && <h2 className="row-title">{row.title}</h2>}
          <div className={`row-columns ${row.columns.length > 1 ? 'multi' : ''}`}>
            {row.columns.map((col, ci) => (
              <div className="row-column" key={ci}>
                {col.title && <h3 className="column-title">{col.title}</h3>}
                <div className="tile-grid">
                  {col.entities.map((re, ei) => {
                    const { span, tall } = sizeToSpan(effectiveSize(re, undefined));
                    return <SkeletonTile key={ei} span={span} tall={tall} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** One shimmer tile, sized to match the real tile it stands in for. */
function SkeletonTile({ span, tall }: { span?: boolean; tall?: boolean }) {
  return (
    <div className={`tile skeleton-tile ${span ? 'span' : ''} ${tall ? 'tall' : ''}`}>
      <div className="sk sk-icon" />
      <div className="sk sk-line sk-line-lg" />
      <div className="sk sk-line sk-line-sm" />
    </div>
  );
}
