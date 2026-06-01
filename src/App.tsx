import { useState, useCallback, useMemo } from 'react';
import { useHomeAssistant } from './hooks/useHomeAssistant';
import { useLayout } from './hooks/useLayout';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ScenePills } from './components/ScenePills';
import { GlanceStrip } from './components/GlanceStrip';
import { AmbientBackdrop } from './components/AmbientBackdrop';import { PersonTracker } from './components/PersonTracker';
import { DashboardView } from './components/DashboardView';
import { DetailPanel } from './components/DetailPanel';
import { EntityPicker } from './components/DashboardView';
import { SettingsModal } from './components/SettingsModal';
import { viewRows } from './lib/layout';
import { scenes } from './config';
import type { RoomEntity } from './types';

export default function App() {
  const { entities, connected, error, callHA, getForecast, getHistory } = useHomeAssistant();
  const layout = useLayout();
  const { views } = layout;
  const [activeView, setActiveView] = useState<string>('main');
  const [detailEntity, setDetailEntity] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [scenePicker, setScenePicker] = useState(false);

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
      <Sidebar activeView={activeView} onNavigate={setActiveView} onOpenSettings={() => setShowSettings(true)} />

      <main className="main-content">
        <Header entities={entities} getForecast={getForecast} />

        {!editing && activeView === 'main' && <GlanceStrip entities={entities} />}

        {!editing && (viewScenes.length > 0 || activeView === 'main') && (
          <div className="home-top">
            {viewScenes.length > 0 && (
              <div className="glass-card scenes-card">
                <h3 className="block-title">Scenes</h3>
                <ScenePills entities={entities} onToggle={toggleEntity} scenes={viewScenes} />
              </div>
            )}
            {activeView === 'main' && <PersonTracker entities={entities} />}
          </div>
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

        <DashboardView
          view={view}
          entities={entities}
          onToggle={toggleEntity}
          onOpenDetail={setDetailEntity}
          callHA={callHA}
          getHistory={getHistory}
          editing={editing}
          layout={layout}
        />
      </main>

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
          onResetLayout={layout.resetLayout}
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

      {error && (
        <div className="connection-bar error">
          <span className="mdi mdi-alert-circle" /> {error}
        </div>
      )}
      {!connected && !error && (
        <div className="connection-bar connecting">
          <span className="mdi mdi-loading mdi-spin" /> Connecting to Home Assistant...
        </div>
      )}
    </div>
  );
}
