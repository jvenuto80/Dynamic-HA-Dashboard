import { useTranslation } from 'react-i18next';
import type { DashView } from '../types';

interface Props {
  views: DashView[];
  activeView: string;
  editing: boolean;
  onNavigate: (view: string) => void;
  onOpenSettings: () => void;
  onAddPage: () => void;
  onManagePages: () => void;
}

export function Sidebar({
  views,
  activeView,
  editing,
  onNavigate,
  onOpenSettings,
  onAddPage,
  onManagePages,
}: Props) {
  const { t } = useTranslation();
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span className="mdi mdi-home-automation" />
      </div>
      {views.map((view) => (
        <button
          key={view.id}
          className={`sidebar-btn ${activeView === view.id ? 'active' : ''}`}
          onClick={() => onNavigate(view.id)}
          title={view.name}
        >
          <span className={`mdi ${view.icon}`} />
        </button>
      ))}
      {editing && (
        <>
          <button className="sidebar-btn sidebar-add" onClick={onAddPage} title={t('sidebar_add_page')}>
            <span className="mdi mdi-plus" />
          </button>
          <button
            className="sidebar-btn sidebar-manage"
            onClick={onManagePages}
            title={t('sidebar_manage_pages')}
          >
            <span className="mdi mdi-playlist-edit" />
          </button>
        </>
      )}
      <button
        className="sidebar-btn sidebar-settings"
        onClick={onOpenSettings}
        title={t('sidebar_settings')}
      >
        <span className="mdi mdi-cog" />
      </button>
    </nav>
  );
}
