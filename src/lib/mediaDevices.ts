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

/** Group media players by physical device. Insertion order is preserved.
 *  `merges` is a list of manual merge groups (each an array of entity_ids the
 *  user has tied together); heuristic groups sharing any of those ids are
 *  unioned, so devices the name heuristic missed can still be combined. */
export function groupMediaPlayers(players: HassEntity[], merges: string[][] = []): HassEntity[][] {
  const groups: HassEntity[][] = [];
  const keyToIdx = new Map<string, number>();
  for (const e of players) {
    const k = deviceNameKey(e);
    let idx = keyToIdx.get(k);
    if (idx === undefined) {
      idx = groups.length;
      groups.push([]);
      keyToIdx.set(k, idx);
    }
    groups[idx].push(e);
  }
  if (!merges.length) return groups;

  // Union-find over heuristic group indices, joined by manual merge groups.
  const parent = groups.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const idToIdx = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((e) => idToIdx.set(e.entity_id, i)));
  for (const mg of merges) {
    const idxs = mg
      .map((id) => idToIdx.get(id))
      .filter((x): x is number => x !== undefined);
    for (let i = 1; i < idxs.length; i++) union(idxs[0], idxs[i]);
  }
  // Collect unioned members, preserving first-seen order of the root groups.
  const out = new Map<number, HassEntity[]>();
  const order: number[] = [];
  groups.forEach((g, i) => {
    const r = find(i);
    if (!out.has(r)) {
      out.set(r, []);
      order.push(r);
    }
    out.get(r)!.push(...g);
  });
  return order.map((r) => out.get(r)!);
}

/** Reduce media players to one representative entity per physical device. */
export function dedupeMediaPlayers(
  players: HassEntity[],
  preferMeta = true,
  merges: string[][] = [],
): HassEntity[] {
  return groupMediaPlayers(players, merges).map((g) => pickRepresentative(g, preferMeta));
}
