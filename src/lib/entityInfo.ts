import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { HA_URL } from '../config';

const ACTIVE_STATES = ['on', 'open', 'unlocked', 'playing', 'cleaning', 'home', 'heat', 'cool'];

export function isActiveState(state: string): boolean {
  return ACTIVE_STATES.includes(state);
}

export function entityIcon(entityId: string, state: string): string {
  const domain = entityId.split('.')[0];
  const icons: Record<string, [string, string]> = {
    light: ['mdi-lightbulb-outline', 'mdi-lightbulb-on'],
    switch: ['mdi-toggle-switch-off-outline', 'mdi-toggle-switch'],
    cover: ['mdi-blinds', 'mdi-blinds-open'],
    lock: ['mdi-lock', 'mdi-lock-open-variant'],
    media_player: ['mdi-cast', 'mdi-cast-connected'],
    camera: ['mdi-cctv', 'mdi-cctv'],
    vacuum: ['mdi-robot-vacuum', 'mdi-robot-vacuum-variant'],
    sensor: ['mdi-gauge', 'mdi-gauge'],
    binary_sensor: ['mdi-checkbox-blank-circle-outline', 'mdi-checkbox-marked-circle'],
    climate: ['mdi-thermostat', 'mdi-thermostat'],
    fan: ['mdi-fan-off', 'mdi-fan'],
    scene: ['mdi-palette', 'mdi-palette'],
    script: ['mdi-script-text', 'mdi-script-text'],
  };
  const [off, on] = icons[domain] || ['mdi-help-circle', 'mdi-help-circle'];
  return isActiveState(state) ? on : off;
}

/** A short, at-a-glance status string for an entity (not just on/off). */
export function entitySummary(entity: HassEntity): string {
  const domain = entity.entity_id.split('.')[0];
  const a = entity.attributes;
  const state = entity.state;

  switch (domain) {
    case 'light': {
      if (state !== 'on') return 'Off';
      const br = a.brightness as number | undefined;
      if (br != null) return `${Math.round((br / 255) * 100)}%`;
      return 'On';
    }
    case 'switch':
    case 'fan':
    case 'input_boolean':
      return state === 'on' ? 'On' : 'Off';
    case 'cover': {
      const pos = a.current_position as number | undefined;
      if (pos != null) return pos === 0 ? 'Closed' : pos === 100 ? 'Open' : `${pos}% open`;
      return state === 'open' ? 'Open' : 'Closed';
    }
    case 'lock':
      return state === 'locked' ? 'Locked' : 'Unlocked';
    case 'media_player': {
      if (state === 'playing') {
        const title = a.media_title as string | undefined;
        return title ? `▶ ${title}` : 'Playing';
      }
      if (state === 'paused') return 'Paused';
      if (state === 'off' || state === 'standby' || state === 'idle') return 'Idle';
      return state;
    }
    case 'climate': {
      const cur = a.current_temperature as number | undefined;
      const tgt = a.temperature as number | undefined;
      if (state === 'off') return 'Off';
      return `${cur != null ? `${Math.round(cur)}°` : '--'} → ${tgt != null ? `${Math.round(tgt)}°` : '--'}`;
    }
    case 'vacuum':
      return state === 'docked' ? 'Docked' : state;
    case 'sensor': {
      const unit = (a.unit_of_measurement as string) || '';
      const num = parseFloat(state);
      return isNaN(num) ? state : `${num % 1 === 0 ? num : num.toFixed(1)}${unit}`;
    }
    case 'binary_sensor':
      return state === 'on' ? 'Detected' : 'Clear';
    default:
      return state;
  }
}

export function activeCount(entities: HassEntities, ids: string[]): number {
  return ids.filter((id) => {
    const e = entities[id];
    return e && isActiveState(e.state);
  }).length;
}

const OFFLINE_MEDIA_STATES = ['off', 'unavailable', 'standby'];

function mediaPicture(e?: HassEntity): string | undefined {
  return e
    ? ((e.attributes.entity_picture as string | undefined) ??
        (e.attributes.entity_picture_local as string | undefined))
    : undefined;
}

/**
 * Resolve the best now-playing artwork URL for a media player.
 *
 * Resolution order:
 *  1. An explicit per-tile `artworkEntity` override (point a Cast tile at the
 *     ADB/Android-TV companion that actually carries the picture).
 *  2. The configured entity's own `entity_picture` / `entity_picture_local`.
 *  3. A companion `media_player` for the same physical device, matched by a
 *     shared entity_id prefix or an identical `media_title`.
 *
 * Returns an absolute URL (resolved against HA_URL) or `undefined`.
 */
export function resolveArtwork(
  entity: HassEntity | undefined,
  entityId: string,
  entities: HassEntities,
  artworkEntity?: string,
): string | undefined {
  const toUrl = (pic?: string) =>
    pic ? (pic.startsWith('http') ? pic : `${HA_URL}${pic}`) : undefined;

  // 1. Explicit override.
  if (artworkEntity) {
    const override = mediaPicture(entities[artworkEntity]);
    if (override) return toUrl(override);
  }

  // 2. The entity's own artwork.
  const own = mediaPicture(entity);
  if (own) return toUrl(own);

  // 3. Borrow from a companion player on the same device.
  const norm = (s: string) => s.split('.')[1]?.replace(/[^a-z0-9]/g, '') ?? '';
  const commonPrefix = (a: string, b: string) => {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  };
  const root = norm(entityId);
  const title = (entity?.attributes.media_title as string | undefined)?.toLowerCase();
  const companion = Object.values(entities).find((e) => {
    if (e.entity_id === entityId) return false;
    if (e.entity_id.split('.')[0] !== 'media_player') return false;
    if (OFFLINE_MEDIA_STATES.includes(e.state)) return false;
    if (!mediaPicture(e)) return false;
    const id = norm(e.entity_id);
    const sharesRoot = commonPrefix(id, root) >= 8;
    const sameTitle =
      !!title && (e.attributes.media_title as string | undefined)?.toLowerCase() === title;
    return sharesRoot || sameTitle;
  });
  return toUrl(mediaPicture(companion));
}
