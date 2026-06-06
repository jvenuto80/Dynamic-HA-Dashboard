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
  /** When set on a `kind: 'sensors'` view, render the enterprise NOC overview
   *  instead of the classic sensor grid. Fully user-built via the UI. */
  noc?: NocConfig;
  /** Per-board header widget visibility. Lets the user strip the greeting,
   *  weather and/or people widgets on boards where they're unnecessary
   *  (e.g. a wall-mounted NOC). Absent/false ⇒ widget shown. */
  hideGreeting?: boolean;
  hideWeather?: boolean;
  hidePeople?: boolean;
}

/** A single metric tracked on a NOC node, drawn as a labeled threshold bar.
 *  Thresholds are expressed as real values (not percentages). */
export interface NocMetric {
  id: string;
  entity_id: string;
  label: string;
  /** Unit override; defaults to the entity's `unit_of_measurement`. */
  unit?: string;
  /** Full-scale value for the bar (defaults to 100). */
  max?: number;
  /** Value at/above which the bar turns amber. */
  warn?: number;
  /** Value at/above which the bar turns red. */
  crit?: number;
  /** When false, a LOWER value is worse (e.g. battery %, runtime) and the
   *  warn/crit comparison inverts. Defaults to true (higher is worse). */
  higherIsWorse?: boolean;
  /** Informational only: show the gauge but never raise an alert (e.g. an NVR's
   *  continuous-recording disk that is designed to stay near-full). */
  informational?: boolean;
  /** Show on the compact tile (the rest live in the flyout). Up to 3 primary. */
  primary?: boolean;
}

/** How a value that *could* be a date/duration is rendered. 'auto' detects the
 *  value's nature (an uptime/boot timestamp becomes elapsed time); the rest force
 *  a specific presentation. The absolute pattern + duration style come from the
 *  global app settings. */
export type NocValueFormat =
  | 'auto'
  | 'datetime'
  | 'date'
  | 'time'
  | 'elapsed'
  | 'duration'
  | 'raw';

/** A small "at a glance" footer pill on a node (ports, cams, docker count,
 *  parity, power draw, uptime…). Fully user-defined. */
export interface NocPill {
  id: string;
  entity_id: string;
  /** mdi class (e.g. 'mdi-ethernet') or a single emoji. */
  icon?: string;
  /** Optional text shown before the value (e.g. "↑" or "ports"). */
  label?: string;
  /** Unit override; defaults to the entity's unit_of_measurement. */
  unit?: string;
  /** Put the unit/label before the value (e.g. "↑ 38d"). */
  prefix?: boolean;
  /** Date/duration rendering override (defaults to smart auto-detection). */
  format?: NocValueFormat;
}

/** Link-speed / state class for a switch port cell, driving its color. Mirrors
 *  the UniFi port legend. 'disconnected'/'disabled' are states, not speeds. */
export type NocPortSpeed =
  | 'fe'
  | 'gbe'
  | '2.5gbe'
  | '5gbe'
  | '10gbe'
  | 'sfp'
  | 'sfp+'
  | 'disconnected'
  | 'disabled';

/** A special role glyph overlaid on a port cell (matches the UniFi legend). */
export type NocPortRole = 'uplink' | 'aggregate' | 'mirror';

/** PoE delivery class shown as a lightning badge on a port. */
export type NocPortPoe = 'poe' | 'poe+' | 'poe++';

/** One physical port on a switch node. Fully user-defined; color comes either
 *  from a manual `speed` class or, when bound, live from a Mbps `speedEntity`. */
export interface NocPort {
  id: string;
  /** Short label under the cell (e.g. "1", "24", "SFP1"). */
  num: string;
  /** Manual speed/state class. Used as the fallback when no live entity is set,
   *  or overridden live by speedEntity / linkEntity when those are bound. */
  speed?: NocPortSpeed;
  /** Optional sensor whose numeric Mbps value derives the speed color live. */
  speedEntity?: string;
  /** Optional connectivity entity (binary_sensor / device_tracker). When it
   *  reads "off"/unavailable the port renders as disconnected. */
  linkEntity?: string;
  /** Optional PoE switch entity (e.g. switch.usw_port_5_poe). Enables the PoE
   *  badge, an on/off toggle and (as a fallback) the power-cycle action. */
  poeEntity?: string;
  /** Optional `button.*_power_cycle` entity (UniFi exposes one per PoE port).
   *  When set, the flyout's Power-cycle action presses it directly. */
  poeCycleEntity?: string;
  /** PoE class badge shown on the cell (visual only). */
  poe?: NocPortPoe;
  /** Special role glyph (uplink / link-aggregation / port-mirror). */
  role?: NocPortRole;
  /** Free-text description of what's connected (e.g. "AP — Office"). */
  client?: string;
  /** Optional id of another NOC node this port links to (e.g. an SFP uplink to
   *  the gateway). The flyout offers a jump to it, and the target node's flyout
   *  automatically offers a jump back. */
  linkNodeId?: string;
}

/** One monitored device in the NOC overview (gateway, switch, NVR, server, UPS…). */
export interface NocNode {
  id: string;
  name: string;
  sub?: string;
  /** An mdi icon class (e.g. 'mdi-server-network') or a single emoji. */
  icon?: string;
  /** Accent hex driving the node's LED, threshold bars and sparkline. */
  accent?: string;
  metrics: NocMetric[];
  /** Optional sensor whose value is shown as a temperature pill. */
  tempEntity?: string;
  /** Optional sensor whose value is shown as an uptime/info pill. */
  uptimeEntity?: string;
  /** How the uptime pill is rendered. Defaults to 'auto', which turns a boot
   *  timestamp into elapsed uptime and a duration counter into "3d 4h 23m". */
  uptimeFormat?: NocValueFormat;
  /** Optional binary_sensor; when in its "problem" state the node alerts. */
  statusEntity?: string;
  /** Case-insensitive substrings that, when found in statusEntity's state,
   *  raise a warning (e.g. ["bypass","boost"]). Generalizes text-status
   *  alerting — e.g. catching a UPS's NUT status flags. */
  statusWarn?: string[];
  /** Like statusWarn but raises a critical alert (e.g. ["replace battery",
   *  "low battery","on battery"] for a UPS). */
  statusCrit?: string[];
  /** For a server node: binary_sensor/switch container entities to monitor.
   *  Any of these in a non-running state raises a node + banner alert. */
  dockerWatch?: string[];
  /** User-defined footer pills (counts, draw, uptime, parity…). */
  pills?: NocPill[];
  /** Which metric the tile's mini sparkline tracks (metric id). Defaults to the
   *  first shown metric. Lets the user pick e.g. CPU vs. throughput. */
  sparkMetricId?: string;
  /** Switch ports rendered as a UniFi-style color-coded strip on the tile and
   *  detailed (with PoE power-cycle) in the flyout. Empty/absent = no strip. */
  ports?: NocPort[];
  /** Seconds the PoE port stays off during a power-cycle before turning back
   *  on. Defaults to 5. */
  portCycleSeconds?: number;
}

/** A named numeric stat in a WAN panel (Cloudflare, Download, Packet loss…). */
export interface NocStatItem {
  id: string;
  entity_id: string;
  label: string;
  unit?: string;
  /** Accent hex for the value (auto-cycled when absent). */
  color?: string;
}

/** A stat pulled from an external HTTP JSON API (e.g. a Speedtest-Tracker
 *  container) via the server-side fetch proxy. Fully user-configured. */
export interface NocApiStat {
  id: string;
  label: string;
  /** Absolute URL of the JSON endpoint. */
  url: string;
  /** Optional bearer token sent as Authorization header. */
  token?: string;
  /** Dotted path into the JSON response (e.g. "data.download"). */
  path: string;
  unit?: string;
  /** Multiply the raw value (e.g. 1e-6 to turn bits/s into Mbps). */
  multiplier?: number;
  color?: string;
  /** Refresh interval in seconds (defaults to 60). */
  pollSeconds?: number;
}

/** A capacity ring in a Storage panel. */
export interface NocDonut {
  id: string;
  entity_id: string;
  label: string;
  /** Full-scale value for the ring (defaults to 100). */
  max?: number;
  /** Optional second sensor shown as a sublabel (e.g. free-space TB / days). */
  sublabelEntity?: string;
  /** Static sublabel text (used when sublabelEntity is absent). */
  sublabel?: string;
  /** Optional word appended after the sublabel value to disambiguate it
   *  (e.g. "used" or "free"). */
  sublabelSuffix?: string;
  /** Informational only: render the ring in a neutral color (e.g. an NVR's
   *  continuous-recording disk that is designed to stay near-full). */
  informational?: boolean;
}

/** A UPS gauge in a Power panel. */
export interface NocPowerUnit {
  id: string;
  name: string;
  batteryEntity?: string;
  runtimeEntity?: string;
  loadEntity?: string;
  /** Power draw in watts. */
  drawEntity?: string;
  statusEntity?: string;
}

export type NocPanelType = 'wan' | 'storage' | 'power';

/** A user-configurable bottom-row panel. */
export interface NocPanel {
  id: string;
  type: NocPanelType;
  title?: string;
  subtitle?: string;
  /** Relative width in the panel grid (defaults to 1; WAN often 1.5). */
  span?: number;
  /** WAN: named stats + charted entity_ids. */
  stats?: NocStatItem[];
  series?: string[];
  /** WAN: stats pulled from an external HTTP JSON API (e.g. Speedtest-Tracker). */
  apiStats?: NocApiStat[];
  /** Storage: capacity rings. */
  donuts?: NocDonut[];
  /** Power: UPS gauges. */
  units?: NocPowerUnit[];
}

/** A user-configurable banner summary chip. */
export interface NocChip {
  id: string;
  /** Built-in computed chips, or a custom entity-backed chip. */
  kind: 'devicesUp' | 'minRuntime' | 'containers' | 'entity';
  label: string;
  /** For kind 'entity': the sensor to display. */
  entity_id?: string;
  unit?: string;
}

/** NOC dashboard configuration for a `kind: 'sensors'` view. */
export interface NocConfig {
  nodes: NocNode[];
  /** Optional WAN-latency sensor entity_ids charted in the Internet panel. */
  wanLatency?: string[];
  /** Optional sensor surfaced as the "clients connected" banner chip. */
  clientsEntity?: string;
  /** User-configurable bottom-row panels. When absent, sensible defaults are
   *  derived from the nodes; the builder can materialize & edit them. */
  panels?: NocPanel[];
  /** User-configurable banner chips. When absent, defaults are computed. */
  chips?: NocChip[];
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
