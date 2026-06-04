export interface HAEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HAEvent {
  event_type: string;
  data: {
    entity_id: string;
    new_state: HAEntity;
    old_state: HAEntity;
  };
}

export interface Room {
  id: string;
  name: string;
  icon: string;
  entities: RoomEntity[];
}

export interface RoomEntity {
  entity_id: string;
  name?: string;
  icon?: string;
  /** Explicit tile size set in edit mode. When unset, an auto heuristic is used. */
  size?: TileSize;
  /** Optional camera entity_id to show as a live thumbnail in the tile's empty space. */
  camera?: string;
  /** Related entity_ids shown together in this tile's flyout (detail panel). */
  links?: string[];
  /** Custom quick-action buttons shown in this tile's flyout. */
  actions?: TileAction[];
  /** Per-tile customization of what appears in the flyout (detail panel). */
  flyout?: FlyoutConfig;
  /** Drag across the tile to dim a light / set a cover's position (shown as fill).
   *  On by default for dimmable lights and non-tall covers; set false to opt out. */
  slideDim?: boolean;
  /** Reverse the position slider direction (useful for covers, e.g. left = open). */
  reverseSlider?: boolean;
  /** Show the now-playing artwork as the tile background (media players). On by default; set false to opt out. */
  mediaArtwork?: boolean;
  /** Companion media_player entity to pull now-playing artwork from (media players). */
  artworkEntity?: string;
  type?: 'light' | 'switch' | 'cover' | 'lock' | 'climate' | 'camera' | 'media_player' | 'vacuum' | 'sensor' | 'binary_sensor' | 'scene' | 'script';
}

/** Controls which sections/attributes are visible in a tile's flyout. */
export interface FlyoutConfig {
  hideState?: boolean;
  hideControls?: boolean;
  hideHistory?: boolean;
  hideAttributes?: boolean;
  /** Specific attribute keys to hide from the attributes card. */
  hiddenAttributes?: string[];
}

/** A user-defined quick action button that calls a Home Assistant service. */
export interface TileAction {
  label: string;
  icon?: string;
  domain: string;
  service: string;
  /** Optional JSON service data. */
  data?: Record<string, unknown>;
  /** Optional target entity_id(s). */
  target?: string;
}

/** Tile footprint in the responsive grid (cols x rows). */
export type TileSize = '1x1' | '2x1' | '1x2' | '2x2';

export interface SceneConfig {
  entity_id: string;
  name: string;
  icon: string;
  color: string;
}

export interface PersonConfig {
  entity_id: string;
  name: string;
  avatar?: string;
}

/** A titled group of entities inside a dashboard view (mirrors HA mushroom-title sections).
 *  Used both as a legacy top-level section and as a column within a row. */
export interface DashSection {
  title?: string;
  entities: RoomEntity[];
}

/** A horizontal band that divides into one or more named columns sitting side-by-side. */
export interface DashRow {
  title?: string;
  columns: DashSection[];
}

/** A dashboard tab mirroring a Home Assistant Lovelace view. */
export interface DashView {
  id: string;
  name: string;
  icon: string;
  /** Special render kind for non-tile views. Defaults to a sectioned tile grid.
   *  'media' auto-fills with every media_player, showing only active ones. */
  kind?: 'tiles' | 'cameras' | 'sensors' | 'media';
  /** Scene entity_ids (from the scenes catalog) relevant to this view. */
  scenes?: string[];
  /** Legacy flat sections; auto-converted to single-column rows when `rows` is absent. */
  sections: DashSection[];
  /** Rich row/column layout. When present, takes precedence over `sections`. */
  rows?: DashRow[];
  /** User-configured "at a glance" summary buttons shown above this view. */
  glance?: GlanceButtonConfig[];
  /** For `kind: 'media'`, media_player entity_ids the user has hidden. */
  mediaExclude?: string[];
  /** For `kind: 'media'`, hide the Music Assistant search button (shown by default). */
  mediaHideSearch?: boolean;
  /** For `kind: 'media'`, groups of entity_ids the user manually merged into one device. */
  mediaMerge?: string[][];
  /** For `kind: 'media'`, the tile width on the page (defaults to medium). */
  mediaTileSize?: 'small' | 'medium' | 'large';
}

/** The metric a glance button summarizes. Drives both its count and its flyout. */
export type GlanceMetric =
  | 'lights'
  | 'switches'
  | 'fans'
  | 'locks'
  | 'covers'
  | 'climate'
  | 'people'
  | 'media';

/** A single user-configured "at a glance" summary button. */
export interface GlanceButtonConfig {
  id: string;
  metric: GlanceMetric;
  /** Optional label override (defaults to the metric's built-in label). */
  label?: string;
  /** Whether tapping the button opens a flyout listing the underlying entities. */
  flyout?: boolean;
  /** entity_ids to omit from this metric (e.g. tablet "screen" lights). */
  exclude?: string[];
}

export type ViewId = string;
