import { resolvePersons } from '../lib/persons';
import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
  /** 'card' = standalone glass card with heading; 'compact' = bare avatar row for the header. */
  variant?: 'card' | 'compact';
}

const colors = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b'];

export function PersonTracker({ entities, variant = 'card' }: Props) {
  const persons = resolvePersons(entities);
  const list = (
    <div className="person-list">
      {persons.map((person, i) => {
          const entity = entities[person.entity_id];
          const isHome = entity?.state === 'home';
          const picture = entity?.attributes?.entity_picture as string | undefined;
          return (
            <div
              key={person.entity_id}
              className="person-avatar"
              style={{ background: colors[i % colors.length] }}
              title={`${person.name}: ${entity?.state || 'unknown'}`}
            >
              {picture ? (
                <img
                  src={picture}
                  alt={person.name}
                  style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                />
              ) : (
                person.name[0]
              )}
              <span className={`status-dot ${isHome ? 'home' : 'away'}`} />
            </div>
          );
        })}
      </div>
  );

  if (variant === 'compact') {
    return <div className="persons-compact">{list}</div>;
  }

  return (
    <div className="glass-card persons-card">
      <h3>People</h3>
      {list}
    </div>
  );
}
