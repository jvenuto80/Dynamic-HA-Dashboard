import { useTranslation } from 'react-i18next';
import { climateEntities } from '../config';
import { useHaTempUnit } from '../hooks/useHomeAssistant';
import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
  onSetTemp: (entityId: string, temp: number) => void;
  onSetMode: (entityId: string, mode: string) => void;
  onOpenDetail: (entityId: string) => void;
}

const MODE_ICON: Record<string, string> = {
  heat: 'mdi-fire',
  cool: 'mdi-snowflake',
  heat_cool: 'mdi-sun-snowflake',
  auto: 'mdi-thermostat-auto',
  dry: 'mdi-water-percent',
  fan_only: 'mdi-fan',
  off: 'mdi-power',
};

export function ClimateCards({ entities, onSetTemp, onOpenDetail }: Props) {
  const { t } = useTranslation();
  const haTempUnit = useHaTempUnit();
  return (
    <>
      {climateEntities.map((ce) => {
        const entity = entities[ce.entity_id];
        if (!entity) return null;

        const currentTemp = entity.attributes.current_temperature as number;
        const targetTemp = entity.attributes.temperature as number;
        const tempUnit = (entity.attributes.temperature_unit as string | undefined) ?? haTempUnit;
        const mode = entity.state;
        const isOff = mode === 'off' || mode === 'unavailable';
        const accent = mode === 'cool' ? 'cool' : mode === 'off' ? 'off' : 'heat';

        return (
          <div
            key={ce.entity_id}
            className="glass-card climate-row clickable"
            onClick={() => onOpenDetail(ce.entity_id)}
          >
            <div className={`climate-row-icon ${accent}`}>
              <span className={`mdi ${MODE_ICON[mode] || 'mdi-thermostat'}`} />
            </div>
            <div className="climate-row-info">
              <div className="climate-row-name">{ce.name}</div>
              <div className="climate-row-sub">
                {isOff ? t('climate_off') : `${mode} · ${currentTemp?.toFixed(0) ?? '--'}${tempUnit}`}
              </div>
            </div>
            <div className="climate-row-controls" onClick={(e) => e.stopPropagation()}>
              <button className="climate-btn sm" disabled={isOff}
                onClick={() => targetTemp && onSetTemp(ce.entity_id, targetTemp - 1)}>
                <span className="mdi mdi-minus" />
              </button>
              <span className="climate-row-target">{isOff ? '--' : `${targetTemp ?? '--'}°`}</span>
              <button className="climate-btn sm" disabled={isOff}
                onClick={() => targetTemp && onSetTemp(ce.entity_id, targetTemp + 1)}>
                <span className="mdi mdi-plus" />
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
