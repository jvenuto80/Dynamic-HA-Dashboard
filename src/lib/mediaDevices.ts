import type { HassEntity } from 'home-assistant-js-websocket';

// Shared Music/media player device de-duplication. A single physical device
// (e.g. an Android TV) commonly exposes several `media_player` entities — an
// ADB/androidtv one, a Cast one, an AirPlay one, a Kodi one — that all mirror
// the same device. Collapsing them to one device keeps counts and the media
// page clean instead of listing the same TV five times.

export const friendlyName = (e: HassEntity): string =>
  (e.attributes.friendly_name as string) || e.entity_id;

/** Transport/integration suffix tokens that distinguish duplicate entities. */
const MEDIA_SOURCE_TOKENS =
  /\b(adb|cast|remote|airplay|androidtv|android\s*tv|google\s*cast|chromecast|fire\s*tv|firetv|kodi|dlna|media\s*player|mediaplayer|mpd)\b/g;

/**
 * A normalized key identifying the physical device behind a media_player
 * entity. Strips the transport/source tokens and all whitespace so spacing and
 * integration variants of the same device collapse together
 * (e.g. "Living Room TV Cast" / "Livingroom TV ADB" → "livingroomtv").
 */
export function deviceNameKey(e: HassEntity): string {
  const full = friendlyName(e)
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // drop parenthetical qualifiers like "(MA)"
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const stripped = full.replace(MEDIA_SOURCE_TOKENS, ' ').replace(/\s+/g, ' ').trim();
  // If stripping removed everything (e.g. the name *is* "ADB" or a raw id),
  // fall back to the full name / entity id so unrelated devices aren't all
  // merged into one empty-keyed group.
  const key = (stripped || full).replace(/\s+/g, '');
  return key || e.entity_id;
}

const hasMeta = (e: HassEntity) => !!(e.attributes.media_title as string | undefined);

/**
 * Choose the entity that best represents a device group. When `preferMeta` is
 * set (display contexts), an entity carrying now-playing metadata wins so the
 * tile shows artwork/title; otherwise the shortest (usually base) friendly name
 * wins for a clean, stable label.
 */
export function pickRepresentative(group: HassEntity[], preferMeta = false): HassEntity {
  return group.reduce((best, e) => {
    if (preferMeta) {
      if (hasMeta(e) && !hasMeta(best)) return e;
      if (hasMeta(e) === hasMeta(best) && friendlyName(e).length < friendlyName(best).length) return e;
      return best;
    }
    return friendlyName(e).length < friendlyName(best).length ? e : best;
  });
}

/** Group media players by physical device. Insertion order is preserved. */
export function groupMediaPlayers(players: HassEntity[]): HassEntity[][] {
  const groups = new Map<string, HassEntity[]>();
  for (const e of players) {
    const key = deviceNameKey(e);
    const g = groups.get(key);
    if (g) g.push(e);
    else groups.set(key, [e]);
  }
  return [...groups.values()];
}

/** Reduce media players to one representative entity per physical device. */
export function dedupeMediaPlayers(players: HassEntity[], preferMeta = true): HassEntity[] {
  return groupMediaPlayers(players).map((g) => pickRepresentative(g, preferMeta));
}
