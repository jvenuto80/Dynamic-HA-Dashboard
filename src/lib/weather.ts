import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { getSettings } from '../settings';

/** All `weather.*` entities, sorted by id for a stable picker / fallback order. */
export function weatherEntities(entities: HassEntities): HassEntity[] {
  return Object.values(entities)
    .filter((e) => e.entity_id.startsWith('weather.'))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

/**
 * The weather entity id to show, requiring no configuration.
 *
 * Resolution order: the user's saved `weatherEntity` setting (if it still
 * exists) → the legacy `weather.forecast_home_2` (if present) → the first
 * `weather.*` entity found. Returns `undefined` when the instance has no
 * weather entity at all.
 */
export function resolveWeatherId(entities: HassEntities): string | undefined {
  const saved = getSettings().weatherEntity;
  if (saved && entities[saved]) return saved;
  if (entities['weather.forecast_home_2']) return 'weather.forecast_home_2';
  return weatherEntities(entities)[0]?.entity_id;
}
