import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolvePersons } from '../lib/persons';
import { HA_URL } from '../config';
import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
  /** 'card' = standalone glass card with heading; 'compact' = bare avatar row for the header. */
  variant?: 'card' | 'compact';
}

const colors = ['#3b82f6', '#a855f7', '#10b981', '#f59e0b'];

// Absolute HA URL: a relative path would go through the page's own /api proxy,
// which HA rejects (400) when a reverse proxy adds X-Forwarded-For.
const avatarUrl = (pic: string) => (/^https?:\/\//.test(pic) ? pic : `${HA_URL}${pic}`);

export function PersonTracker({ entities, variant = 'card' }: Props) {
  const { t } = useTranslation();
  const persons = resolvePersons(entities);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const list = (
    <div className="person-list">
      {persons.map((person, i) => {
          const entity = entities[person.entity_id];
          const isHome = entity?.state === 'home';
          const pic = entity?.attributes?.entity_picture as string | undefined;
          const picture = pic ? avatarUrl(pic) : undefined;
          return (
            <div
              key={person.entity_id}
              className="person-avatar"
              style={{ background: colors[i % colors.length] }}
              title={`${person.name}: ${entity?.state || 'unknown'}`}
            >
              {picture && !failed.has(picture) ? (
                <img
                  src={picture}
                  alt={person.name}
                  onError={() => setFailed((s) => new Set(s).add(picture))}
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
      <h3>{t('person_people')}</h3>
      {list}
    </div>
  );
}
