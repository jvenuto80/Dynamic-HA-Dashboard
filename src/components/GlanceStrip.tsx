import { useMemo } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import { persons } from '../config';
import { AnimatedNumber } from './AnimatedNumber';

interface Props {
  entities: HassEntities;
}

interface Stat {
  key: string;
  icon: string;
  value: string;
  /** When set, the value counts up/down smoothly instead of snapping. */
  num?: number;
  numSuffix?: string;
  label: string;
  active: boolean;
}

/**
 * Compact "at a glance" strip: a few live summary stats (lights on, indoor
 * temperature, who's home, media playing) derived entirely from current
 * entity state. Stats with no data are omitted.
 */
export function GlanceStrip({ entities }: Props) {
  const stats = useMemo<Stat[]>(() => {
    const list = Object.values(entities);

    // Lights currently on.
    const lightsOn = list.filter(
      (e) => e.entity_id.startsWith('light.') && e.state === 'on'
    ).length;

    // Average current temperature across climate entities (indoor).
    const temps = list
      .filter((e) => e.entity_id.startsWith('climate.'))
      .map((e) => e.attributes.current_temperature as number | undefined)
      .filter((t): t is number => typeof t === 'number');
    const avgTemp = temps.length
      ? Math.round(temps.reduce((a, b) => a + b, 0) / temps.length)
      : undefined;

    // People home.
    const homeCount = persons.filter((p) => entities[p.entity_id]?.state === 'home').length;

    // Media playing.
    const mediaPlaying = list.filter(
      (e) => e.entity_id.startsWith('media_player.') && e.state === 'playing'
    ).length;

    const out: Stat[] = [];

    out.push({
      key: 'lights',
      icon: 'mdi-lightbulb-group',
      value: String(lightsOn),
      label: lightsOn === 1 ? 'light on' : 'lights on',
      active: lightsOn > 0,
    });

    if (avgTemp !== undefined) {
      out.push({
        key: 'temp',
        icon: 'mdi-thermometer',
        value: `${avgTemp}°`,
        num: avgTemp,
        numSuffix: '°',
        label: 'indoor',
        active: true,
      });
    }

    out.push({
      key: 'home',
      icon: 'mdi-account-group',
      value: String(homeCount),
      label: homeCount === 1 ? 'home' : 'home',
      active: homeCount > 0,
    });

    if (mediaPlaying > 0) {
      out.push({
        key: 'media',
        icon: 'mdi-play-circle',
        value: String(mediaPlaying),
        label: mediaPlaying === 1 ? 'playing' : 'playing',
        active: true,
      });
    }

    return out;
  }, [entities]);

  if (!stats.length) return null;

  return (
    <div className="glance-strip">
      {stats.map((s) => (
        <div key={s.key} className={`glance-stat ${s.active ? 'active' : ''}`}>
          <span className={`mdi ${s.icon} glance-icon`} />
          <div className="glance-text">
            <span className="glance-value">
              {s.num != null ? <AnimatedNumber value={s.num} suffix={s.numSuffix} /> : s.value}
            </span>
            <span className="glance-label">{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
