import { useTranslation } from 'react-i18next';
import type { HassEntities } from 'home-assistant-js-websocket';
import { rooms } from '../config';
import { isActiveState } from '../lib/entityInfo';
import { DeviceTile } from './DeviceTile';

type CallHA = (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => Promise<void>;

interface Props {
  roomId: string | null;
  entities: HassEntities;
  onClose: () => void;
  onToggle: (entityId: string) => void;
  onOpenDetail: (entityId: string) => void;
  callHA: CallHA;
}

export function RoomPanel({ roomId, entities, onClose, onToggle, onOpenDetail, callHA }: Props) {
  const { t } = useTranslation();
  const isOpen = roomId !== null;
  const room = roomId ? rooms.find((r) => r.id === roomId) : null;
  const present = room ? room.entities.filter((e) => entities[e.entity_id]) : [];
  const activeCount = present.filter((e) => isActiveState(entities[e.entity_id].state)).length;

  const lights = present.filter((e) => e.entity_id.startsWith('light.'));
  const allLightsOn = lights.length > 0 && lights.every((e) => entities[e.entity_id].state === 'on');

  return (
    <>
      <div className={`detail-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`detail-panel ${isOpen ? 'open' : ''}`}>
        {room && (
          <>
            <div className="detail-header">
              <h2>
                <span className={`mdi ${room.icon}`} style={{ marginRight: 8, color: 'var(--accent-orange)' }} />
                {room.name}
              </h2>
              <button className="detail-close" onClick={onClose}>
                <span className="mdi mdi-close" />
              </button>
            </div>

            <div className="room-panel-stat">
              <div>
                <span className="num">{activeCount}</span>
                <span className="lbl">{t('room_active')}</span>
              </div>
              <div>
                <span className="num">{present.length}</span>
                <span className="lbl">{t('room_devices')}</span>
              </div>
              {lights.length > 0 && (
                <button
                  className="room-panel-allbtn"
                  onClick={() => lights.forEach((e) => {
                    const on = entities[e.entity_id].state === 'on';
                    if (allLightsOn === on) onToggle(e.entity_id);
                  })}
                >
                  <span className={`mdi ${allLightsOn ? 'mdi-lightbulb-off' : 'mdi-lightbulb-on'}`} />
                  {allLightsOn ? t('room_all_off') : t('room_all_on')}
                </button>
              )}
            </div>

            <div className="tile-grid">
              {present.map((re) => {
                const entity = entities[re.entity_id];
                const name = re.name || (entity.attributes.friendly_name as string);
                const dimmable = re.entity_id.startsWith('light.') && entity.attributes.brightness != null;
                const isCover = re.entity_id.startsWith('cover.') && entity.attributes.current_position != null;
                return (
                  <DeviceTile
                    key={re.entity_id}
                    entity={entity}
                    name={name}
                    callHA={callHA}
                    onToggle={onToggle}
                    onOpenDetail={onOpenDetail}
                    span={dimmable || isCover}
                    icon={re.icon}
                  />
                );
              })}
            </div>
          </>
        )}
      </div>
    </>
  );
}
