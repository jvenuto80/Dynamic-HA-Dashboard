import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { getSettings } from '../settings';

/** All `weather.*` entities, sorted by id for a stable picker / fallback order. */
export function weatherEntities(entities: HassEntities): HassEntity[] {
  return Object.values(entities)
    .filter((e) => e.entity_id.startsWith('weather.'))
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id));
}

/** MDI icon for a weather condition state. */
export function getWeatherIcon(state: string): string {
  const map: Record<string, string> = {
    sunny: 'mdi-weather-sunny',
    'clear-night': 'mdi-weather-night',
    partlycloudy: 'mdi-weather-partly-cloudy',
    cloudy: 'mdi-weather-cloudy',
    rainy: 'mdi-weather-rainy',
    pouring: 'mdi-weather-pouring',
    snowy: 'mdi-weather-snowy',
    fog: 'mdi-weather-fog',
    lightning: 'mdi-weather-lightning',
    'lightning-rainy': 'mdi-weather-lightning-rainy',
    windy: 'mdi-weather-windy',
  };
  return map[state] || 'mdi-weather-cloudy';
}

/** Condition-appropriate icon hue so weather reads at a glance instead of
 *  a wall of identical amber: sun amber, rain blue, cloud slate, night indigo. */
export function getWeatherColor(state: string): string {
  const map: Record<string, string> = {
    sunny: '#fbbf24',
    'clear-night': '#a5b4fc',
    partlycloudy: '#cbd5e1',
    cloudy: '#94a3b8',
    rainy: '#60a5fa',
    pouring: '#3b82f6',
    snowy: '#bae6fd',
    'snowy-rainy': '#93c5fd',
    fog: '#cbd5e1',
    hail: '#bae6fd',
    lightning: '#c084fc',
    'lightning-rainy': '#a78bfa',
    windy: '#94a3b8',
    'windy-variant': '#94a3b8',
    exceptional: '#f87171',
  };
  return map[state] || '#cbd5e1';
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
