import { views } from '../config';

interface Props {
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenSettings: () => void;
}

export function Sidebar({ activeView, onNavigate, onOpenSettings }: Props) {
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
      <button
        className="sidebar-btn sidebar-settings"
        onClick={onOpenSettings}
        title="Settings"
      >
        <span className="mdi mdi-cog" />
      </button>
    </nav>
  );
}
