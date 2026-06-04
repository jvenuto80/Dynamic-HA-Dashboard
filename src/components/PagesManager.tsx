import type { DashView } from '../types';

interface Props {
  views: DashView[];
  activeView: string;
  onNavigate: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onIcon: (id: string, icon: string) => void;
  onMove: (fromIdx: number, toIdx: number) => void;
  onRemove: (id: string) => void;
  onSetKind: (id: string, kind: DashView['kind']) => void;
  onClose: () => void;
}

/**
 * In-app page (view) management: rename, re-icon, reorder, add and delete the
 * dashboard's pages without editing layout JSON. Reuses the tile-settings modal
 * shell for visual consistency.
 */
export function PagesManager({
  views,
  activeView,
  onNavigate,
  onAdd,
  onRename,
  onIcon,
  onMove,
  onRemove,
  onSetKind,
  onClose,
}: Props) {
  return (
    <div className="ts-overlay" onClick={onClose}>
      <div className="ts-modal pages-manager" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head">
          <h3>Manage Pages</h3>
          <button className="edit-icon-btn" title="Close" onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="ts-body">
          <p className="pm-hint">Rename, re-order and choose an icon for each dashboard page.</p>
          <div className="pm-list">
            {views.map((v, idx) => (
              <div className={`pm-row ${v.id === activeView ? 'is-active' : ''}`} key={v.id}>
                <span className="pm-preview">
                  <span className={`mdi ${v.icon}`} />
                </span>
                <div className="pm-fields">
                  <input
                    className="pm-name"
                    value={v.name}
                    placeholder="Page name"
                    onChange={(e) => onRename(v.id, e.target.value)}
                  />
                  <input
                    className="pm-icon-input"
                    value={v.icon}
                    placeholder="mdi-home"
                    spellCheck={false}
                    onChange={(e) => onIcon(v.id, e.target.value)}
                  />
                </div>
                <div className="pm-tools">
                  {(v.kind === undefined || v.kind === 'tiles' || v.kind === 'media') && (
                    <button
                      className={`edit-icon-btn ${v.kind === 'media' ? 'on' : ''}`}
                      title={
                        v.kind === 'media'
                          ? 'Now Playing mode (auto media) — click for normal tiles'
                          : 'Switch to Now Playing mode (auto media devices)'
                      }
                      onClick={() => onSetKind(v.id, v.kind === 'media' ? 'tiles' : 'media')}
                    >
                      <span className={`mdi ${v.kind === 'media' ? 'mdi-music-box-multiple' : 'mdi-music-box-multiple-outline'}`} />
                    </button>
                  )}
                  <button
                    className="edit-icon-btn"
                    title="Move up"
                    disabled={idx === 0}
                    onClick={() => onMove(idx, idx - 1)}
                  >
                    <span className="mdi mdi-chevron-up" />
                  </button>
                  <button
                    className="edit-icon-btn"
                    title="Move down"
                    disabled={idx === views.length - 1}
                    onClick={() => onMove(idx, idx + 1)}
                  >
                    <span className="mdi mdi-chevron-down" />
                  </button>
                  <button
                    className="edit-icon-btn"
                    title="Go to page"
                    onClick={() => onNavigate(v.id)}
                  >
                    <span className="mdi mdi-open-in-new" />
                  </button>
                  <button
                    className="edit-icon-btn danger"
                    title="Delete page"
                    disabled={views.length <= 1}
                    onClick={() => {
                      if (confirm(`Delete page “${v.name || 'Untitled'}”?`)) onRemove(v.id);
                    }}
                  >
                    <span className="mdi mdi-trash-can-outline" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="add-tile-btn pm-add" onClick={onAdd}>
            <span className="mdi mdi-plus" /> Add Page
          </button>
        </div>
      </div>
    </div>
  );
}
