import type { DashView } from '../types';

export type BoardType = 'tiles' | 'sensors' | 'noc' | 'cameras' | 'media';

/** Derive the board-type selector value from a view's kind + noc presence. */
export function boardTypeOf(v: DashView): BoardType {
  if (v.kind === 'sensors') return v.noc ? 'noc' : 'sensors';
  if (v.kind === 'cameras') return 'cameras';
  if (v.kind === 'media') return 'media';
  return 'tiles';
}

interface Props {
  views: DashView[];
  activeView: string;
  onNavigate: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onIcon: (id: string, icon: string) => void;
  onMove: (fromIdx: number, toIdx: number) => void;
  onRemove: (id: string) => void;
  onSetBoardType: (id: string, type: BoardType) => void;
  onSetHeader: (
    id: string,
    patch: Partial<Pick<DashView, 'hideGreeting' | 'hideWeather' | 'hidePeople'>>,
  ) => void;
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
  onSetBoardType,
  onSetHeader,
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
                  <div className="pm-board-row">
                    <select
                      className="pm-board-select"
                      value={boardTypeOf(v)}
                      onChange={(e) => onSetBoardType(v.id, e.target.value as BoardType)}
                    >
                      <option value="tiles">Tiles</option>
                      <option value="sensors">Sensor graphs</option>
                      <option value="noc">NOC (servers)</option>
                      <option value="cameras">Cameras</option>
                      <option value="media">Now Playing</option>
                    </select>
                    <div className="pm-header-toggles" title="Show/hide header widgets on this page">
                      <button
                        className={`pm-htoggle ${v.hideGreeting ? '' : 'on'}`}
                        title="Greeting"
                        onClick={() => onSetHeader(v.id, { hideGreeting: !v.hideGreeting })}
                      >
                        <span className="mdi mdi-hand-wave" />
                      </button>
                      <button
                        className={`pm-htoggle ${v.hideWeather ? '' : 'on'}`}
                        title="Weather"
                        onClick={() => onSetHeader(v.id, { hideWeather: !v.hideWeather })}
                      >
                        <span className="mdi mdi-weather-partly-cloudy" />
                      </button>
                      <button
                        className={`pm-htoggle ${v.hidePeople ? '' : 'on'}`}
                        title="People"
                        onClick={() => onSetHeader(v.id, { hidePeople: !v.hidePeople })}
                      >
                        <span className="mdi mdi-account-group" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="pm-tools">
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
