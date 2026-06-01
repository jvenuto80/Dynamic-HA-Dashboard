import { rooms } from '../config';
import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
  active: string;
  onSelect: (roomId: string) => void;
}

function activeCount(entities: HassEntities, room: (typeof rooms)[number]): number {
  return room.entities.filter((e) => {
    const ent = entities[e.entity_id];
    if (!ent) return false;
    return ['on', 'open', 'playing', 'heat', 'cool'].includes(ent.state);
  }).length;
}

export function RoomNav({ entities, active, onSelect }: Props) {
  return (
    <nav className="room-nav">
      <button
        className={`room-nav-pill ${active === 'all' ? 'active' : ''}`}
        onClick={() => onSelect('all')}
      >
        <span className="mdi mdi-view-grid" />
        <span>All</span>
      </button>
      {rooms.map((room) => {
        const count = activeCount(entities, room);
        return (
          <button
            key={room.id}
            className={`room-nav-pill ${active === room.id ? 'active' : ''}`}
            onClick={() => onSelect(room.id)}
          >
            <span className={`mdi ${room.icon}`} />
            <span>{room.name}</span>
            {count > 0 && <span className="room-nav-badge">{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
