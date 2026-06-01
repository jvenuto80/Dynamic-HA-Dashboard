import { locks } from '../config';
import type { HassEntities } from 'home-assistant-js-websocket';
import { useRef, useCallback } from 'react';

interface Props {
  entities: HassEntities;
  onToggleLock: (entityId: string, currentState: string) => void;
}

export function LockCards({ entities, onToggleLock }: Props) {
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = useCallback((entityId: string, state: string) => {
    holdTimerRef.current = setTimeout(() => {
      onToggleLock(entityId, state);
      holdTimerRef.current = null;
    }, 800);
  }, [onToggleLock]);

  const handlePointerUp = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  return (
    <>
      {locks.map((lock) => {
        const entity = entities[lock.entity_id];
        if (!entity) return null;
        const isLocked = entity.state === 'locked';
        return (
          <div
            key={lock.entity_id}
            className="glass-card lock-card"
            onPointerDown={() => handlePointerDown(lock.entity_id, entity.state)}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          >
            <div className={`lock-icon ${isLocked ? 'locked' : 'unlocked'}`}>
              <span className={`mdi ${isLocked ? 'mdi-lock' : 'mdi-lock-open-variant'}`} />
            </div>
            <div className="lock-label">{lock.name}</div>
            <div className="lock-hint">Hold to {isLocked ? 'unlock' : 'lock'}</div>
          </div>
        );
      })}
    </>
  );
}
