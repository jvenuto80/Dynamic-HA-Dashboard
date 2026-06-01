import { sensorWidgets } from '../config';
import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
}

export function SensorWidgets({ entities }: Props) {
  return (
    <div className="sensor-widgets">
      {sensorWidgets.map((sw) => {
        const entity = entities[sw.entity_id];
        if (!entity || entity.state === 'unavailable') return null;
        const value = parseFloat(entity.state);
        const display = isNaN(value) ? entity.state : value.toFixed(value >= 100 ? 0 : 1);

        return (
          <div key={sw.entity_id} className="sensor-widget">
            <span className={`mdi ${sw.icon} widget-icon`} />
            <div>
              <div className="widget-value">{display}{sw.unit}</div>
              <div className="widget-label">{sw.name}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
