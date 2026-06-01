import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
  onOpenDetail: (entityId: string) => void;
}

export function VacuumCard({ entities, onOpenDetail }: Props) {
  const vacuum = entities['vacuum.x40_ultra'];
  if (!vacuum) return null;

  const state = vacuum.state;
  const battery = entities['sensor.x40_ultra_battery_level']?.state;
  const statusMap = vacuum.attributes.status as string | undefined;

  let iconClass = 'docked';
  if (state === 'cleaning') iconClass = 'cleaning';
  else if (state === 'returning') iconClass = 'returning';
  else if (state === 'error') iconClass = 'error';

  return (
    <div className="glass-card vacuum-card clickable" onClick={() => onOpenDetail('vacuum.x40_ultra')}>
      <div className="vacuum-status">
        <div className={`vacuum-icon ${iconClass}`}>
          <span className={`mdi ${
            state === 'cleaning' ? 'mdi-robot-vacuum-variant' :
            state === 'returning' ? 'mdi-home-import-outline' :
            state === 'error' ? 'mdi-robot-vacuum-alert' :
            'mdi-robot-vacuum'
          }`} />
        </div>
        <div className="vacuum-info">
          <h4>Dreame X40 Ultra</h4>
          <span className="state">{statusMap || state}</span>
        </div>
      </div>
      <div className="vacuum-stats">
        {battery && <span className="vacuum-stat">🔋 {battery}%</span>}
        {vacuum.attributes.cleaned_area != null && (
          <span className="vacuum-stat">{String(vacuum.attributes.cleaned_area)} m²</span>
        )}
        {vacuum.attributes.cleaning_time != null && (
          <span className="vacuum-stat">{String(vacuum.attributes.cleaning_time)} min</span>
        )}
      </div>
    </div>
  );
}
