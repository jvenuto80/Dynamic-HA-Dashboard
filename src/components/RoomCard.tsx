import type { HassEntities } from 'home-assistant-js-websocket';
import type { Room } from '../types';
import { entitySummary, isActiveState } from '../lib/entityInfo';
import { DeviceTile } from './DeviceTile';

type CallHA = (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => Promise<void>;

interface Props {
  room: Room;
  entities: HassEntities;
  onToggle: (entityId: string) => void;
  onOpenDetail: (entityId: string) => void;
  onOpenRoom: (roomId: string) => void;
  callHA: CallHA;
}

export function RoomCard({ room, entities, onToggle, onOpenDetail, onOpenRoom, callHA }: Props) {
  const present = room.entities.filter((e) => entities[e.entity_id]);
  const activeCount = present.filter((e) => isActiveState(entities[e.entity_id].state)).length;

  const tempEntity = present
    .map((e) => entities[e.entity_id])
    .find((e) => e.entity_id.startsWith('climate.') || (e.entity_id.startsWith('sensor.') && /temp/i.test(e.entity_id)));
  const headerTemp = tempEntity ? entitySummary(tempEntity) : null;

  return (
    <div className="room-block">
      <button className="room-title" onClick={() => onOpenRoom(room.id)}>
        <span className="room-title-name">{room.name}</span>
        {headerTemp && <span className="room-title-temp">{headerTemp}</span>}
        {activeCount > 0 && <span className="room-title-badge">{activeCount}</span>}
        <span className="mdi mdi-chevron-right room-title-chevron" />
      </button>

      <div className="tile-grid">
        {present.map((re) => {
          const entity = entities[re.entity_id];
          const name = re.name || (entity.attributes.friendly_name as string);
          const domain = re.entity_id.split('.')[0];
          const dimmable =
            re.entity_id.startsWith('light.') && entity.attributes.brightness != null;
          const isCover =
            re.entity_id.startsWith('cover.') && entity.attributes.current_position != null;
          const isVacuum = domain === 'vacuum';
          return (
            <DeviceTile
              key={re.entity_id}
              entity={entity}
              name={name}
              callHA={callHA}
              onToggle={onToggle}
              onOpenDetail={onOpenDetail}
              span={dimmable}
              tall={isCover || isVacuum}
            />
          );
        })}
      </div>
    </div>
  );
}
