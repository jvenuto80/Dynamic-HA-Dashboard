import { useState, useCallback, useMemo, useRef } from 'react';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useLayout } from './hooks/useLayout';
import { useSwipeNav } from './hooks/useSwipeNav';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ScenePills } from './components/ScenePills';
import { GlanceStrip } from './components/GlanceStrip';
import { AmbientBackdrop } from './components/AmbientBackdrop';
import { DashboardView } from './components/DashboardView';
import { DetailPanel } from './components/DetailPanel';
import { EntityPicker } from './components/DashboardView';
import { SettingsModal } from './components/SettingsModal';
import { PagesManager } from './components/PagesManager';
import { PageDots } from './components/PageDots';
import { Onboarding } from './components/Onboarding';
import { viewRows } from './lib/layout';
import { runNavTransition } from './lib/viewTransition';
import { scenes, HA_TOKEN } from './config';
import type { RoomEntity } from './types';

export default function App() {
  const { entities, connected, error, callHA, getForecast, getHistory, searchMusic, playMusic, getMaPlayers } = useHomeAssistant();
  const layout = useLayout();
  const { views } = layout;
  const [activeView, setActiveView] = useState<string>('main');
  const [detailEntity, setDetailEntity] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const [scenePicker, setScenePicker] = useState(false);
  // First-run guided setup shows when no token is configured; can be dismissed
  // for this session to explore the shell without connecting.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const needsOnboarding = !HA_TOKEN && !onboardingDismissed;
  // Actively connecting (token present, nothing streamed yet, no hard error):
  // show shimmer skeletons instead of an empty grid.
  const booting = !!HA_TOKEN && !connected && !error && Object.keys(entities).length === 0;

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

  /** Advance to the adjacent page (used by swipe). Clamps at the ends. */
  const goAdjacent = useCallback(
    (dir: 'next' | 'prev') => {
      const i = views.findIndex((v) => v.id === activeView);
      const j = dir === 'next' ? i + 1 : i - 1;
      if (j < 0 || j >= views.length) return;
      runNavTransition(dir, () => setActiveView(views[j].id));
    },
    [activeView, views],
  );

  useSwipeNav(mainRef, { onSwipe: goAdjacent });

  // Map of entity_id -> configured tile (camera, links, quick actions) for the flyout.
  const configFor = useMemo(() => {
    const map: Record<string, RoomEntity> = {};
    for (const v of views) {
      for (const row of viewRows(v)) {
        for (const col of row.columns) {
          for (const e of col.entities) {
            if (e.camera || e.links?.length || e.actions?.length || e.flyout || e.reverseSlider || e.artworkEntity) map[e.entity_id] = e;
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
            editing={editing}
            onGlanceChange={(g) => layout.setGlance(view.id, g)}
            onOpenDetail={setDetailEntity}
            callHA={callHA}
          />
        )}

        {editing && view.kind !== 'cameras' && (
          <div className="glass-card scenes-card scenes-edit-card">
            <h3 className="block-title">Scenes</h3>
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
                      title="Move left"
                      disabled={idx === 0}
                      onClick={() => layout.moveScene(view.id, idx, idx - 1)}
                    >
                      <span className="mdi mdi-chevron-left" />
                    </button>
                    <button
                      className="edit-icon-btn"
                      title="Move right"
                      disabled={idx === viewScenes.length - 1}
                      onClick={() => layout.moveScene(view.id, idx, idx + 1)}
                    >
                      <span className="mdi mdi-chevron-right" />
                    </button>
                    <button
                      className="edit-icon-btn danger"
                      title="Remove scene"
                      onClick={() => layout.removeScene(view.id, scene.entity_id)}
                    >
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                </div>
              ))}
              <button className="add-tile-btn scene-add-btn" onClick={() => setScenePicker(true)}>
                <span className="mdi mdi-plus" /> Add Scene
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
                      <span className="mdi mdi-loading mdi-spin" /> Saving…
                    </>
                  ) : (
                    <>
                      <span className="mdi mdi-check-circle-outline" /> Saved
                    </>
                  )}
                </span>
                <button
                  className="toolbar-btn"
                  onClick={() => {
                    if (confirm('Reset ALL dashboards to the default layout?')) layout.resetLayout();
                  }}
                >
                  <span className="mdi mdi-restore" /> Reset
                </button>
                <button className="toolbar-btn primary" onClick={() => setEditing(false)}>
                  <span className="mdi mdi-check" /> Done
                </button>
              </>
            ) : (
              <button className="toolbar-btn" onClick={() => setEditing(true)}>
                <span className="mdi mdi-pencil" /> Edit
              </button>
            )}
          </div>
        </div>

        {booting ? (
          <SkeletonGrid />
        ) : (
          <DashboardView
            view={view}
            entities={entities}
            onToggle={toggleEntity}
            onOpenDetail={setDetailEntity}
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
            <h3 className="block-title">Scenes</h3>
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
          title="Search scenes…"
          onClose={() => setScenePicker(false)}
          onPick={(entityId) => {
            layout.addScene(view.id, entityId);
            setScenePicker(false);
          }}
        />
      )}

      {needsOnboarding && <Onboarding onDismiss={() => setOnboardingDismissed(true)} />}

      {error && !needsOnboarding && (
        <div className="connection-bar error">
          <span className="mdi mdi-alert-circle" /> {error}
        </div>
      )}
      {!connected && !error && !needsOnboarding && (
        <div className="connection-bar connecting">
          <span className="mdi mdi-loading mdi-spin" /> Connecting to Home Assistant...
        </div>
      )}
    </div>
  );
}

/** Shimmer placeholders shown while the first entity snapshot is loading. */
function SkeletonGrid() {
  return (
    <div className="view-rows" aria-hidden="true">
      <section className="view-row">
        <div className="row-columns">
          <div className="row-column">
            <div className="tile-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <div className="tile skeleton-tile" key={i}>
                  <div className="sk sk-icon" />
                  <div className="sk sk-line sk-line-lg" />
                  <div className="sk sk-line sk-line-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
