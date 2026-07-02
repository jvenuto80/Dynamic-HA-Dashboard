import { scenes as allScenes } from '../config';
import { playSceneWash } from '../lib/sceneWash';
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

  /** Activate the scene and play the color wash from the tapped pill (issue #17). */
  const activate = (scene: SceneConfig, e: React.MouseEvent<HTMLDivElement>) => {
    const icon = e.currentTarget.querySelector('.scene-icon');
    const r = icon?.getBoundingClientRect();
    playSceneWash(scene.color, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
    onToggle(scene.entity_id);
  };

  return (
    <div className="scenes-row">
      {list.map((scene) => {
        const entity = entities[scene.entity_id];
        const isActive = entity?.state === 'on';
        return (
          <div key={scene.entity_id} className="scene-pill" onClick={(e) => activate(scene, e)}>
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
