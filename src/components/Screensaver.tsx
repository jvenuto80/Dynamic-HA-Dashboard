import { useEffect, useMemo, useState } from 'react';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import { resolveWeatherId, getWeatherIcon, getWeatherColor } from '../lib/weather';
import { resolveArtwork } from '../lib/entityInfo';
import { clockTime } from '../lib/format';

interface Props {
  entities: HassEntities;
}

/** The playing media player to feature, if any — feeds the ambient art
 *  background and the now-playing line. A device often exposes several playing
 *  entities (Cast/ADB/...) where one carries the `media_title` and another the
 *  picture; prefer the title-carrier — resolveArtwork borrows companion art —
 *  and fall back to any picture-carrier. */
function findPlaying(entities: HassEntities): HassEntity | undefined {
  const playing = Object.values(entities).filter(
    (e) => e.entity_id.startsWith('media_player.') && e.state === 'playing',
  );
  return (
    playing.find((e) => !!e.attributes.media_title) ??
    playing.find((e) => !!(e.attributes.entity_picture || e.attributes.entity_picture_local))
  );
}

/** Anchor spots the clock block drifts between (percent offsets from center).
 *  Moving it every minute keeps OLED wall tablets from burning in. */
const DRIFT_SPOTS: [number, number][] = [
  [0, 0],
  [-12, -10],
  [12, 8],
  [-10, 9],
  [11, -9],
  [0, 11],
];

/**
 * Idle "screensaver" for wall tablets (issue #20): after the configured idle
 * time the dashboard drifts to a dimmed full-screen clock with the date,
 * outside temperature, and — when something is playing — ambient blurred album
 * art with a now-playing line. Any touch/movement wakes the dashboard (the
 * parent unmounts this via useIdle).
 */
export function Screensaver({ entities }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 5_000);
    return () => clearInterval(t);
  }, []);

  // Drift the clock to a new anchor each minute.
  const [spot, setSpot] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSpot((s) => (s + 1) % DRIFT_SPOTS.length), 60_000);
    return () => clearInterval(t);
  }, []);
  const [dx, dy] = DRIFT_SPOTS[spot];

  const weatherId = resolveWeatherId(entities);
  const weather = weatherId ? entities[weatherId] : undefined;
  const temp = weather?.attributes?.temperature as number | undefined;

  const playing = useMemo(() => findPlaying(entities), [entities]);
  const artwork = playing
    ? resolveArtwork(playing, playing.entity_id, entities)
    : undefined;
  // Title falls back through app name to the device name so the pill is never
  // empty when something is audibly playing without metadata (e.g. live TV).
  // Android players report raw package ids ("org.smarttube.beta") as app_name;
  // those read as noise, so prefer the device name instead.
  const appName = playing?.attributes.app_name as string | undefined;
  const isPackageId = !!appName && /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(appName);
  const title =
    (playing?.attributes.media_title as string | undefined) ||
    (!isPackageId ? appName : undefined) ||
    (playing?.attributes.friendly_name as string | undefined);
  const artist = playing?.attributes.media_artist as string | undefined;

  const clock = clockTime(now);
  const dateLine = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="screensaver" role="presentation">
      {artwork && (
        <div
          className="ss-backdrop"
          key={artwork}
          style={{ backgroundImage: `url("${artwork}")` }}
          aria-hidden="true"
        />
      )}
      <div className="ss-scrim" aria-hidden="true" />

      <div className="ss-center" style={{ transform: `translate(${dx}%, ${dy}%)` }}>
        <div className="ss-clock">
          {clock.time}
          {clock.suffix && <span className="ss-clock-suffix">{clock.suffix}</span>}
        </div>
        <div className="ss-date">{dateLine}</div>
        {weather && temp != null && (
          <div className="ss-weather">
            <span
              className={`mdi ${getWeatherIcon(weather.state)}`}
              style={{ color: getWeatherColor(weather.state) }}
            />
            {Math.round(temp)}°
          </div>
        )}
      </div>

      {playing && title && (
        <div className="ss-nowplaying">
          {artwork && <img src={artwork} alt="" />}
          <div className="ss-np-text">
            <span className="ss-np-title">{title}</span>
            {artist && <span className="ss-np-artist">{artist}</span>}
          </div>
          <div className="ss-np-eq" aria-hidden="true">
            <span /><span /><span />
          </div>
        </div>
      )}
    </div>
  );
}
