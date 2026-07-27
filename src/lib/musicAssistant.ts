// Helpers for the Music Assistant search tile: media-type catalog, robust
// extraction of search-result items (MA serializes MediaItem.to_dict(), whose
// exact shape varies by provider/version), and the special "sentinel" tile
// registry that lets a non-entity card live in the normal tile grid.

import { isRoomTile } from './roomTile';

/** Media types the MA `search` service understands, plus an "all" option. */
export const MA_MEDIA_TYPES = [
  { value: '', label: 'All' },
  { value: 'artist', label: 'Artists' },
  { value: 'album', label: 'Albums' },
  { value: 'track', label: 'Tracks' },
  { value: 'playlist', label: 'Playlists' },
  { value: 'radio', label: 'Radio' },
] as const;

/** Result groups, in display order. Keys match the service response keys. */
export const MA_RESULT_GROUPS: { key: string; label: string; icon: string; mediaType: string }[] = [
  { key: 'artists', label: 'Artists', icon: 'mdi-account-music', mediaType: 'artist' },
  { key: 'albums', label: 'Albums', icon: 'mdi-album', mediaType: 'album' },
  { key: 'tracks', label: 'Tracks', icon: 'mdi-music-note', mediaType: 'track' },
  { key: 'playlists', label: 'Playlists', icon: 'mdi-playlist-music', mediaType: 'playlist' },
  { key: 'radio', label: 'Radio', icon: 'mdi-radio', mediaType: 'radio' },
];

export interface MaItem {
  uri: string;
  name: string;
  mediaType: string;
  /** Direct http(s) artwork URL when available, else undefined (icon fallback). */
  image?: string;
  /** Secondary line: artist(s)/album/version. */
  subtitle?: string;
  favorite: boolean;
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/** Pull a usable http(s) artwork URL from a MediaItem's varied image fields. */
function pickImage(it: Raw): string | undefined {
  const direct =
    str(it.image) ??
    str(it.image_url) ??
    str(it.media_image_url) ??
    str((it.image as Raw | undefined)?.path);
  if (direct && /^https?:\/\//.test(direct)) return direct;

  const meta = it.metadata as Raw | undefined;
  const images = (meta?.images as Raw[] | undefined) ?? (it.images as Raw[] | undefined);
  if (Array.isArray(images)) {
    const thumb =
      images.find((i) => str(i.type) === 'thumb' && str(i.path)) ?? images.find((i) => str(i.path));
    const path = str(thumb?.path);
    if (path && /^https?:\/\//.test(path)) return path;
  }
  return undefined;
}

/** Build a secondary label (artist names / album / version). */
function pickSubtitle(it: Raw, mediaType: string): string | undefined {
  const artists = it.artists as Raw[] | undefined;
  if (Array.isArray(artists) && artists.length) {
    const names = artists.map((a) => str(a.name)).filter(Boolean);
    if (names.length) return names.join(', ');
  }
  const album = str((it.album as Raw | undefined)?.name);
  if (album) return album;
  const version = str(it.version);
  if (version) return version;
  return mediaType ? mediaType.charAt(0).toUpperCase() + mediaType.slice(1) : undefined;
}

/** Normalize one result group from the raw service response into MaItems. */
export function extractItems(response: Raw | undefined, groupKey: string, mediaType: string): MaItem[] {
  const arr = response?.[groupKey];
  if (!Array.isArray(arr)) return [];
  return (arr as Raw[])
    .map((it): MaItem | null => {
      const uri = str(it.uri);
      const name = str(it.name);
      if (!uri || !name) return null;
      return {
        uri,
        name,
        mediaType: str(it.media_type) ?? mediaType,
        image: pickImage(it),
        subtitle: pickSubtitle(it, mediaType),
        favorite: it.favorite === true,
      };
    })
    .filter((x): x is MaItem => x !== null);
}

// ── Special (sentinel) tiles: non-entity cards that live in the tile grid ──

export interface SpecialTileDef {
  name: string;
  icon: string;
}

export const SPECIAL_TILES: Record<string, SpecialTileDef> = {
  'music_assistant.search': { name: 'Music Search', icon: 'mdi-music-circle' },
  'glance.calendar': { name: 'Up Next (Calendar)', icon: 'mdi-calendar' },
  /** Picker sentinel — picking opens the Area chooser; stored tiles use glance.room.<areaId>. */
  'glance.room': { name: 'Room Summary', icon: 'mdi-floor-plan' },
};

export const isSpecialTile = (entityId: string): boolean =>
  entityId in SPECIAL_TILES || isRoomTile(entityId);
