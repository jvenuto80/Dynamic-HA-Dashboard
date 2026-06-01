import { useEffect, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';

interface Props {
  entities: HassEntities;
}

type TimeOfDay = 'night' | 'dawn' | 'day' | 'dusk';

function timeOfDay(date = new Date()): TimeOfDay {
  const h = date.getHours();
  if (h >= 5 && h < 8) return 'dawn';
  if (h >= 8 && h < 17) return 'day';
  if (h >= 17 && h < 20) return 'dusk';
  return 'night';
}

/** Map a weather state to a coarse precipitation kind for the backdrop layer. */
function weatherKind(state?: string): 'rain' | 'snow' | 'none' {
  if (!state) return 'none';
  if (/(rain|pour|drizzle|lightning)/i.test(state)) return 'rain';
  if (/(snow|hail|sleet)/i.test(state)) return 'snow';
  return 'none';
}

/**
 * Ambient layers behind the UI: a time-of-day tint (set as a data attribute on
 * the root so CSS can recolor the background gradient) plus a subtle, optional
 * precipitation layer driven by the weather entity. Purely decorative.
 */
export function AmbientBackdrop({ entities }: Props) {
  const [tod, setTod] = useState<TimeOfDay>(() => timeOfDay());

  // Refresh the time-of-day attribute periodically so the tint drifts with the
  // real clock without a full reload.
  useEffect(() => {
    const apply = () => {
      const todOverride =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('tod')
          : null;
      const t =
        todOverride === 'night' ||
        todOverride === 'dawn' ||
        todOverride === 'dusk' ||
        todOverride === 'day'
          ? (todOverride as TimeOfDay)
          : timeOfDay();
      setTod(t);
      document.documentElement.setAttribute('data-tod', t);
    };
    apply();
    const id = setInterval(apply, 60_000);
    return () => clearInterval(id);
  }, []);

  const weather =
    entities['weather.forecast_home_2'] ||
    Object.values(entities).find((e) => e.entity_id.startsWith('weather.'));

  // Dev preview override: ?precip=rain|snow|none forces the precipitation layer
  // regardless of real weather, and ?tod=night|dawn|dusk|day forces the tint.
  const override =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('precip')
      : null;
  const kind =
    override === 'rain' || override === 'snow' || override === 'none'
      ? (override as 'rain' | 'snow' | 'none')
      : weatherKind(weather?.state);

  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const showPrecip = kind !== 'none' && !reduced;

  // A handful of drops/flakes is enough to read as "weather" without cost.
  const count = kind === 'rain' ? 28 : 22;
  const cells = showPrecip
    ? Array.from({ length: count }, (_, i) => {
        const left = (i * 37) % 100;
        const delay = (i % 10) * (kind === 'rain' ? 0.18 : 0.4);
        const dur = kind === 'rain' ? 0.7 + (i % 5) * 0.18 : 4 + (i % 6) * 0.9;
        return (
          <span
            key={i}
            className={`precip-${kind}`}
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${dur}s`,
            }}
          />
        );
      })
    : null;

  return (
    <>
      <div className={`ambient-tod ambient-tod-${tod}`} aria-hidden="true" />
      {showPrecip && (
        <div className={`ambient-weather ambient-${kind}`} aria-hidden="true">
          {cells}
        </div>
      )}
    </>
  );
}
