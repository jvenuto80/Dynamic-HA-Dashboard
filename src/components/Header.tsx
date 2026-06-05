import type { HassEntities } from 'home-assistant-js-websocket';
import { useEffect, useState } from 'react';
import { AnimatedNumber } from './AnimatedNumber';
import { PersonTracker } from './PersonTracker';
import { resolvePersons } from '../lib/persons';
import { resolveWeatherId } from '../lib/weather';
import { dedupeMediaPlayers } from '../lib/mediaDevices';

interface ForecastDay {
  datetime: string;
  condition: string;
  temperature: number;
  templow?: number;
}

interface Props {
  entities: HassEntities;
  getForecast?: (entityId: string, type?: 'daily' | 'hourly') => Promise<unknown[]>;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
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

function getWeatherIcon(state: string): string {
  const map: Record<string, string> = {
    sunny: 'mdi-weather-sunny',
    'clear-night': 'mdi-weather-night',
    partlycloudy: 'mdi-weather-partly-cloudy',
    cloudy: 'mdi-weather-cloudy',
    rainy: 'mdi-weather-rainy',
    pouring: 'mdi-weather-pouring',
    snowy: 'mdi-weather-snowy',
    fog: 'mdi-weather-fog',
    lightning: 'mdi-weather-lightning',
    'lightning-rainy': 'mdi-weather-lightning-rainy',
    windy: 'mdi-weather-windy',
  };
  return map[state] || 'mdi-weather-cloudy';
}

/** Condition-appropriate icon hue so the forecast reads at a glance instead of
 *  a wall of identical amber: sun amber, rain blue, cloud slate, night indigo. */
function getWeatherColor(state: string): string {
  const map: Record<string, string> = {
    sunny: '#fbbf24',
    'clear-night': '#a5b4fc',
    partlycloudy: '#cbd5e1',
    cloudy: '#94a3b8',
    rainy: '#60a5fa',
    pouring: '#3b82f6',
    snowy: '#bae6fd',
    'snowy-rainy': '#93c5fd',
    fog: '#cbd5e1',
    hail: '#bae6fd',
    lightning: '#c084fc',
    'lightning-rainy': '#a78bfa',
    windy: '#94a3b8',
    'windy-variant': '#94a3b8',
    exceptional: '#f87171',
  };
  return map[state] || '#cbd5e1';
}

export function Header({ entities, getForecast }: Props) {
  const weatherId = resolveWeatherId(entities);
  const weather = weatherId ? entities[weatherId] : undefined;
  const temp = weather?.attributes?.temperature as number | undefined;
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

  return (
    <header className="header">
      <div className="greeting">
        <h1>
          {getGreeting()}
          {greetingName ? `, ${greetingName}!` : ''}
        </h1>
        <p className="subtitle">
          {mediaPlaying.length > 0
            ? `${mediaPlaying.length} media playing`
            : 'Everything quiet'}
          {' · '}
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>
      </div>
      <div className="header-right">
        {weather && (
          <div className="weather-widget">
          <div className="weather-now">
            <span className={`mdi ${getWeatherIcon(state)}`} style={{ fontSize: 36, color: getWeatherColor(state) }} />
            <div>
              <div className="weather-temp">
                <AnimatedNumber value={Math.round(temp ?? 0)} /><sup>°F</sup>
              </div>
              <div className="weather-details">
                {state.replace(/-/g, ' ')} · {humidity}% humidity
              </div>
            </div>
          </div>
          {forecast.length > 0 && (
            <div className="weather-forecast">
              {forecast.map((d, i) => (
                <div className="forecast-day" key={d.datetime ?? i}>
                  <div className="dow">
                    {i === 0
                      ? 'TODAY'
                      : new Date(d.datetime).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
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
        <PersonTracker entities={entities} variant="compact" />
      </div>
    </header>
  );
}
