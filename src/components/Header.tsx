import type { HassEntities } from 'home-assistant-js-websocket';
import { useEffect, useState } from 'react';
import { AnimatedNumber } from './AnimatedNumber';
import { PersonTracker } from './PersonTracker';
import { resolvePersons } from '../lib/persons';
import { resolveWeatherId, getWeatherIcon, getWeatherColor } from '../lib/weather';
import { dedupeMediaPlayers } from '../lib/mediaDevices';
import { useHaTempUnit } from '../hooks/useHomeAssistant';
import { useTranslation } from 'react-i18next';

interface ForecastDay {
  datetime: string;
  condition: string;
  temperature: number;
  templow?: number;
}

interface Props {
  entities: HassEntities;
  getForecast?: (entityId: string, type?: 'daily' | 'hourly') => Promise<unknown[]>;
  /** Per-board visibility — lets a board strip widgets it doesn't need. */
  hideGreeting?: boolean;
  hideWeather?: boolean;
  hidePeople?: boolean;
}

/** Join names naturally: "Jeff", "Jeff & Carissa", "Jeff, Carissa & Sam". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

/** Names of the people currently home, auto-discovered from `person.*`. */
function getHomeNames(entities: HassEntities): string[] {
  return resolvePersons(entities)
    .filter((p) => entities[p.entity_id]?.state === 'home')
    .map((p) => p.name);
}

export function Header({ entities, getForecast, hideGreeting, hideWeather, hidePeople }: Props) {
  const { t, i18n } = useTranslation();
  const haTempUnit = useHaTempUnit();
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return t('greeting_night');
    if (h < 12) return t('greeting_morning');
    if (h < 17) return t('greeting_afternoon');
    if (h < 21) return t('greeting_evening');
    return t('greeting_night');
  })();
  const weatherId = resolveWeatherId(entities);
  const weather = weatherId ? entities[weatherId] : undefined;
  const temp = weather?.attributes?.temperature as number | undefined;
  const tempUnit = (weather?.attributes?.temperature_unit as string | undefined) ?? haTempUnit;
  const state = weather?.state || '';
  const humidity = weather?.attributes?.humidity as number | undefined;

  const [forecast, setForecast] = useState<ForecastDay[]>([]);

  useEffect(() => {
    if (!getForecast || !weather || !weatherId) return;
    let active = true;
    // Prefer attribute forecast (older HA), else fetch via service.
    const attrForecast = weather.attributes?.forecast as ForecastDay[] | undefined;
    if (attrForecast && attrForecast.length) {
      setForecast(attrForecast.slice(0, 4));
      return;
    }
    getForecast(weatherId, 'daily').then((data) => {
      if (active) setForecast((data as ForecastDay[]).slice(0, 4));
    });
    return () => {
      active = false;
    };
  }, [getForecast, weather, weatherId]);

  const mediaPlaying = dedupeMediaPlayers(
    Object.values(entities).filter(
      (e) => e.entity_id.startsWith('media_player.') && e.state === 'playing',
    ),
  );

  const homeNames = getHomeNames(entities);
  const greetingName = joinNames(homeNames);

  if (hideGreeting && hideWeather && hidePeople) return null;

  return (
    <header className="header">
      {!hideGreeting ? (
        <div className="greeting">
          <h1>
            {greeting}
            {greetingName ? `, ${greetingName}!` : ''}
          </h1>
          <p className="subtitle">
            {mediaPlaying.length > 0
              ? t('greeting_media_playing', { count: mediaPlaying.length })
              : t('greeting_everything_quiet')}
            {' · '}
            {new Date().toLocaleDateString(i18n.language, { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>
      ) : (
        <div className="greeting" />
      )}
      <div className="header-right">
        {!hideWeather && weather && (
          <div className="weather-widget">
          <div className="weather-now">
            <span className={`mdi ${getWeatherIcon(state)}`} style={{ fontSize: 36, color: getWeatherColor(state) }} />
            <div>
              <div className="weather-temp">
                <AnimatedNumber value={Math.round(temp ?? 0)} /><sup>{tempUnit}</sup>
              </div>
              <div className="weather-details">
                {state.replace(/-/g, ' ')} · {humidity}% {t('weather_humidity')}
              </div>
            </div>
          </div>
          {forecast.length > 0 && (
            <div className="weather-forecast">
              {forecast.map((d, i) => (
                <div className="forecast-day" key={d.datetime ?? i}>
                  <div className="dow">
                    {i === 0
                      ? t('greeting_today')
                      : new Date(d.datetime).toLocaleDateString(i18n.language, { weekday: 'short' }).toUpperCase()}
                  </div>
                  <span className={`mdi ${getWeatherIcon(d.condition)}`} style={{ fontSize: 20, color: getWeatherColor(d.condition) }} />
                  <div className="temp">
                    {Math.round(d.temperature)}°
                    {d.templow !== undefined && (
                      <span className="low"> {Math.round(d.templow)}°</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        )}
        {!hidePeople && <PersonTracker entities={entities} variant="compact" />}
      </div>
    </header>
  );
}
