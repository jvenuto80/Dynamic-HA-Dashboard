import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <div className="ts-overlay" onClick={onClose}>
      <div className="ts-modal pages-manager" onClick={(e) => e.stopPropagation()}>
        <div className="ts-head">
          <h3>{t('pages_manage')}</h3>
          <button className="edit-icon-btn" title={t('pages_close')} onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="ts-body">
          <p className="pm-hint">{t('pages_hint')}</p>
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
                    placeholder={t('pages_name_placeholder')}
                    onChange={(e) => onRename(v.id, e.target.value)}
                  />
                  <input
                    className="pm-icon-input"
                    value={v.icon}
                    placeholder={t('pages_icon_placeholder')}
                    spellCheck={false}
                    onChange={(e) => onIcon(v.id, e.target.value)}
                  />
                  <div className="pm-board-row">
                    <select
                      className="pm-board-select"
                      value={boardTypeOf(v)}
                      onChange={(e) => onSetBoardType(v.id, e.target.value as BoardType)}
                    >
                      <option value="tiles">{t('pages_tiles')}</option>
                      <option value="sensors">{t('pages_sensors')}</option>
                      <option value="noc">{t('pages_noc')}</option>
                      <option value="cameras">{t('pages_cameras')}</option>
                      <option value="media">{t('pages_media')}</option>
                    </select>
                    <div className="pm-header-toggles" title={t('pages_header_title')}>
                      <button
                        className={`pm-htoggle ${v.hideGreeting ? '' : 'on'}`}
                        title={t('pages_greeting')}
                        onClick={() => onSetHeader(v.id, { hideGreeting: !v.hideGreeting })}
                      >
                        <span className="mdi mdi-hand-wave" />
                      </button>
                      <button
                        className={`pm-htoggle ${v.hideWeather ? '' : 'on'}`}
                        title={t('pages_weather')}
                        onClick={() => onSetHeader(v.id, { hideWeather: !v.hideWeather })}
                      >
                        <span className="mdi mdi-weather-partly-cloudy" />
                      </button>
                      <button
                        className={`pm-htoggle ${v.hidePeople ? '' : 'on'}`}
                        title={t('pages_people')}
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
                    title={t('pages_move_up')}
                    disabled={idx === 0}
                    onClick={() => onMove(idx, idx - 1)}
                  >
                    <span className="mdi mdi-chevron-up" />
                  </button>
                  <button
                    className="edit-icon-btn"
                    title={t('pages_move_down')}
                    disabled={idx === views.length - 1}
                    onClick={() => onMove(idx, idx + 1)}
                  >
                    <span className="mdi mdi-chevron-down" />
                  </button>
                  <button
                    className="edit-icon-btn"
                    title={t('pages_go_to')}
                    onClick={() => onNavigate(v.id)}
                  >
                    <span className="mdi mdi-open-in-new" />
                  </button>
                  <button
                    className="edit-icon-btn danger"
                    title={t('pages_delete')}
                    disabled={views.length <= 1}
                    onClick={() => {
                      if (confirm(t('pages_delete_confirm', { name: v.name || 'Untitled' }))) onRemove(v.id);
                    }}
                  >
                    <span className="mdi mdi-trash-can-outline" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button className="add-tile-btn pm-add" onClick={onAdd}>
            <span className="mdi mdi-plus" /> {t('pages_add')}
          </button>
        </div>
      </div>
    </div>
  );
}
