import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { resolvePersons } from './persons';
import type { GlanceButtonConfig, GlanceMetric } from '../types';
import { dedupeMediaPlayers } from './mediaDevices';

/** How a flyout list row can be toggled, if at all. */
export type ToggleKind = 'switch' | 'lock' | 'cover' | null;

export interface GlanceItem {
  id: string;
  name: string;
  icon: string;
  /** Right-aligned status text (brightness %, temperature, now-playing title…). */
  detail: string;
  /** Whether this entity is in its "active" state (on / unlocked / open / home). */
  on: boolean;
  /** How tapping this row toggles it; null means tapping opens the detail panel. */
  toggleKind: ToggleKind;
  /** For a group row, the member entity_ids it controls (for display only). */
  members?: string[];
}

export interface MetricResult {
  /** Numeric count for the chip (lights on, people home, …). */
  count: number;
  /** Display string on the chip (usually the count, or an average temperature). */
  value: string;
  /** When set, the chip value counts up/down smoothly. */
  num?: number;
  numSuffix?: string;
  /** Chip label (e.g. "lights on"). */
  label: string;
  /** Chip accent (highlighted) state. */
  active: boolean;
  /** Whether the flyout should render a multi-column toggle grid (vs. a list). */
  toggleable: boolean;
  /** Entities behind this metric, for the flyout. */
  items: GlanceItem[];
  /** Message shown in the flyout when there are no items. */
  empty: string;
}

interface MetricDef {
  /** Default chip label. */
  label: string;
  /** Icon shown on the chip and as the flyout heading. */
  icon: string;
  /** Flyout rows act as on/off toggles laid out in a grid. */
  toggleable: boolean;
}

export const METRICS: Record<GlanceMetric, MetricDef> = {
  lights: { label: 'lights on', icon: 'mdi-lightbulb-group', toggleable: true },
  switches: { label: 'switches on', icon: 'mdi-toggle-switch', toggleable: true },
  fans: { label: 'fans on', icon: 'mdi-fan', toggleable: true },
  locks: { label: 'unlocked', icon: 'mdi-lock-open-variant', toggleable: true },
  covers: { label: 'open', icon: 'mdi-window-shutter-open', toggleable: true },
  climate: { label: 'indoor', icon: 'mdi-thermometer', toggleable: false },
  people: { label: 'home', icon: 'mdi-account-group', toggleable: false },
  media: { label: 'playing', icon: 'mdi-play-circle', toggleable: false },
};

export const METRIC_OPTIONS: { metric: GlanceMetric; nameKey: string }[] = [
  { metric: 'lights', nameKey: 'glance_metric_lights' },
  { metric: 'switches', nameKey: 'glance_metric_switches' },
  { metric: 'fans', nameKey: 'glance_metric_fans' },
  { metric: 'locks', nameKey: 'glance_metric_locks' },
  { metric: 'covers', nameKey: 'glance_metric_covers' },
  { metric: 'climate', nameKey: 'glance_metric_climate' },
  { metric: 'people', nameKey: 'glance_metric_people' },
  { metric: 'media', nameKey: 'glance_metric_media' },
];

/** Default glance buttons used when a view has none configured yet. */
export const DEFAULT_GLANCE: GlanceButtonConfig[] = [
  { id: 'g-lights', metric: 'lights', flyout: true },
  { id: 'g-climate', metric: 'climate', flyout: true },
  { id: 'g-locks', metric: 'locks', flyout: true },
  { id: 'g-people', metric: 'people', flyout: true },
  { id: 'g-media', metric: 'media', flyout: true },
];

const friendly = (e: HassEntity) => (e.attributes.friendly_name as string) || e.entity_id;

/** A `light.*` entity is a group when it aggregates other lights via `entity_id`. */
function lightMembers(e: HassEntity): string[] {
  const m = e.attributes.entity_id;
  return Array.isArray(m) ? (m as string[]) : [];
}

/**
 * Tablet/kiosk screen-brightness entities are exposed as `light.*` but aren't
 * real lights, so they're filtered from the lights metric by default. Users can
 * still add their own excludes for anything this heuristic misses.
 */
function isScreenLight(e: HassEntity): boolean {
  const hay = `${e.entity_id} ${friendly(e)}`.toLowerCase();
  return /\b(screen|tablet|kiosk|display|monitor)\b|gtab|fully/.test(hay);
}

function brightnessPct(e: HassEntity): string {
  const bri = e.attributes.brightness as number | undefined;
  return typeof bri === 'number' ? `${Math.round((bri / 255) * 100)}%` : 'On';
}

/** Compute the count + flyout items for one glance button. */
export function computeMetric(
  metric: GlanceMetric,
  entities: HassEntities,
  exclude: string[] = [],
): MetricResult {
  const def = METRICS[metric];
  const skip = new Set(exclude);
  const list = Object.values(entities);
  const byName = (a: GlanceItem, b: GlanceItem) => a.name.localeCompare(b.name);

  switch (metric) {
    case 'lights': {
      const lights = list.filter(
        (e) =>
          e.entity_id.startsWith('light.') &&
          !skip.has(e.entity_id) &&
          !isScreenLight(e),
      );
      const groups = lights.filter((e) => lightMembers(e).length > 0);
      const leaves = lights.filter((e) => lightMembers(e).length === 0);
      const leavesOn = leaves.filter((e) => e.state === 'on');

      // Groups that are on collapse their members into a single toggle.
      const groupsOn = groups.filter((e) => e.state === 'on');
      const shownMemberIds = new Set(groupsOn.flatMap((g) => lightMembers(g)));

      const groupItems = groupsOn.map<GlanceItem>((g) => {
        const members = lightMembers(g);
        const onCount = members.filter((id) => entities[id]?.state === 'on').length;
        return {
          id: g.entity_id,
          name: friendly(g),
          icon: 'mdi-lightbulb-group',
          detail: members.length ? `${onCount}/${members.length} on` : brightnessPct(g),
          on: true,
          toggleKind: 'switch',
          members,
        };
      });

      const leafItems = leavesOn
        .filter((e) => !shownMemberIds.has(e.entity_id))
        .map<GlanceItem>((e) => ({
          id: e.entity_id,
          name: friendly(e),
          icon: 'mdi-lightbulb-on',
          detail: brightnessPct(e),
          on: true,
          toggleKind: 'switch',
        }));

      const items = [...groupItems, ...leafItems].sort(byName);
      // "Actual" count = individual leaf lights on (group wrappers excluded).
      const count = leavesOn.length;
      return {
        count,
        value: String(count),
        label: count === 1 ? 'light on' : def.label,
        active: count > 0,
        toggleable: def.toggleable,
        items,
        empty: 'No lights are on.',
      };
    }

    case 'switches':
    case 'fans': {
      const domain = metric === 'switches' ? 'switch.' : 'fan.';
      const on = list.filter(
        (e) => e.entity_id.startsWith(domain) && e.state === 'on' && !skip.has(e.entity_id),
      );
      const items = on
        .map<GlanceItem>((e) => ({
          id: e.entity_id,
          name: friendly(e),
          icon: metric === 'fans' ? 'mdi-fan' : 'mdi-toggle-switch-variant',
          detail: 'On',
          on: true,
          toggleKind: 'switch',
        }))
        .sort(byName);
      return {
        count: on.length,
        value: String(on.length),
        label: on.length === 1 ? (metric === 'fans' ? 'fan on' : 'switch on') : def.label,
        active: on.length > 0,
        toggleable: def.toggleable,
        items,
        empty: metric === 'fans' ? 'No fans are on.' : 'No switches are on.',
      };
    }

    case 'locks': {
      const locks = list.filter(
        (e) => e.entity_id.startsWith('lock.') && !skip.has(e.entity_id),
      );
      const unlocked = locks.filter((e) => e.state === 'unlocked');
      const items = unlocked
        .map<GlanceItem>((e) => ({
          id: e.entity_id,
          name: friendly(e),
          icon: 'mdi-lock-open-variant',
          detail: 'Unlocked',
          on: true,
          toggleKind: 'lock',
        }))
        .sort(byName);
      return {
        count: unlocked.length,
        value: String(unlocked.length),
        label: def.label,
        active: unlocked.length > 0,
        toggleable: def.toggleable,
        items,
        empty: 'Everything is locked.',
      };
    }

    case 'covers': {
      const covers = list.filter(
        (e) => e.entity_id.startsWith('cover.') && !skip.has(e.entity_id),
      );
      const open = covers.filter((e) => e.state === 'open' || e.state === 'opening');
      const items = open
        .map<GlanceItem>((e) => {
          const pos = e.attributes.current_position as number | undefined;
          return {
            id: e.entity_id,
            name: friendly(e),
            icon: 'mdi-window-shutter-open',
            detail: typeof pos === 'number' ? `${pos}%` : 'Open',
            on: true,
            toggleKind: 'cover',
          };
        })
        .sort(byName);
      return {
        count: open.length,
        value: String(open.length),
        label: def.label,
        active: open.length > 0,
        toggleable: def.toggleable,
        items,
        empty: 'Everything is closed.',
      };
    }

    case 'climate': {
      const climate = list.filter(
        (e) =>
          e.entity_id.startsWith('climate.') &&
          typeof e.attributes.current_temperature === 'number' &&
          !skip.has(e.entity_id),
      );
      const items = climate
        .map<GlanceItem>((e) => ({
          id: e.entity_id,
          name: friendly(e),
          icon: 'mdi-thermometer',
          detail: `${Math.round(e.attributes.current_temperature as number)}°`,
          on: e.state !== 'off',
          toggleKind: null,
        }))
        .sort(byName);
      const temps = items.map((i) => parseInt(i.detail, 10));
      const avg = temps.length
        ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
        : undefined;
      return {
        count: items.length,
        value: avg !== undefined ? `${avg}°` : '—',
        num: avg,
        numSuffix: '°',
        label: def.label,
        active: avg !== undefined,
        toggleable: def.toggleable,
        items,
        empty: 'No climate sensors reporting.',
      };
    }

    case 'people': {
      const items = resolvePersons(entities)
        .map<GlanceItem | null>((p) => {
          const e = entities[p.entity_id];
          if (!e) return null;
          const isHome = e.state === 'home';
          return {
            id: p.entity_id,
            name: p.name || friendly(e),
            icon: isHome ? 'mdi-home-account' : 'mdi-home-export-outline',
            detail: isHome ? 'Home' : e.state === 'not_home' ? 'Away' : e.state,
            on: isHome,
            toggleKind: null,
          };
        })
        .filter((i): i is GlanceItem => i !== null)
        .sort((a, b) => Number(b.on) - Number(a.on) || byName(a, b));
      const homeCount = items.filter((i) => i.on).length;
      return {
        count: homeCount,
        value: String(homeCount),
        label: def.label,
        active: homeCount > 0,
        toggleable: def.toggleable,
        items,
        empty: 'Nobody is being tracked.',
      };
    }

    case 'media': {
      const playingRaw = list.filter(
        (e) =>
          e.entity_id.startsWith('media_player.') &&
          e.state === 'playing' &&
          !skip.has(e.entity_id),
      );
      const playing = dedupeMediaPlayers(playingRaw);
      const items = playing
        .map<GlanceItem>((e) => {
          const title = e.attributes.media_title as string | undefined;
          const artist = e.attributes.media_artist as string | undefined;
          return {
            id: e.entity_id,
            name: friendly(e),
            icon: 'mdi-play-circle',
            detail: title ? (artist ? `${title} — ${artist}` : title) : 'Playing',
            on: true,
            toggleKind: null,
          };
        })
        .sort(byName);
      return {
        count: playing.length,
        value: String(playing.length),
        label: def.label,
        active: playing.length > 0,
        toggleable: def.toggleable,
        items,
        empty: 'Nothing is playing.',
      };
    }
  }
}
