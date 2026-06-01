import type { HassEntities } from 'home-assistant-js-websocket';
import { useEffect, useState } from 'react';
import { AnimatedNumber } from './AnimatedNumber';

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

export function Header({ entities, getForecast }: Props) {
  const weather = entities['weather.forecast_home_2'];
  const temp = weather?.attributes?.temperature as number | undefined;
  const state = weather?.state || '';
  const humidity = weather?.attributes?.humidity as number | undefined;

  const [forecast, setForecast] = useState<ForecastDay[]>([]);

  useEffect(() => {
    if (!getForecast || !weather) return;
    let active = true;
    // Prefer attribute forecast (older HA), else fetch via service.
    const attrForecast = weather.attributes?.forecast as ForecastDay[] | undefined;
    if (attrForecast && attrForecast.length) {
      setForecast(attrForecast.slice(0, 4));
      return;
    }
    getForecast('weather.forecast_home_2', 'daily').then((data) => {
      if (active) setForecast((data as ForecastDay[]).slice(0, 4));
    });
    return () => {
      active = false;
    };
  }, [getForecast, weather]);

  const mediaPlaying = Object.values(entities).filter(
    (e) => e.entity_id.startsWith('media_player.') && e.state === 'playing'
  );

  return (
    <header className="header">
      <div className="greeting">
        <h1>{getGreeting()}, Jeff!</h1>
        <p className="subtitle">
          {mediaPlaying.length > 0
            ? `${mediaPlaying.length} media playing`
            : 'Everything quiet'}
          {' · '}
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </p>
      </div>
      {weather && (
        <div className="weather-widget">
          <div className="weather-now">
            <span className={`mdi ${getWeatherIcon(state)}`} style={{ fontSize: 36, color: '#f59e0b' }} />
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
                  <span className={`mdi ${getWeatherIcon(d.condition)}`} style={{ fontSize: 20, color: '#f59e0b' }} />
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
    </header>
  );
}
