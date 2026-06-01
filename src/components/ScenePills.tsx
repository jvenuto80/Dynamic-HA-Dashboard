import { scenes as allScenes } from '../config';
import type { HassEntities } from 'home-assistant-js-websocket';
import type { SceneConfig } from '../types';

interface Props {
  entities: HassEntities;
  onToggle: (entityId: string) => void;
  /** Optional explicit list of scenes to show. Defaults to the full catalog. */
  scenes?: SceneConfig[];
}

export function ScenePills({ entities, onToggle, scenes }: Props) {
  const list = scenes ?? allScenes;
  return (
    <div className="scenes-row">
      {list.map((scene) => {
        const entity = entities[scene.entity_id];
        const isActive = entity?.state === 'on';
        return (
          <div key={scene.entity_id} className="scene-pill" onClick={() => onToggle(scene.entity_id)}>
            <div
              className={`scene-icon ${isActive ? 'active' : ''}`}
              style={{
                background: isActive
                  ? scene.color
                  : `${scene.color}33`,
                boxShadow: isActive ? `0 4px 20px ${scene.color}66` : 'none',
              }}
            >
              <span className={`mdi ${scene.icon}`} />
            </div>
            <span className="scene-label">{scene.name}</span>
          </div>
        );
      })}
    </div>
  );
}
