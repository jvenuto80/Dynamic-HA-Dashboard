import { useEffect, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import { getSettings } from '../settings';
import { resolveWeatherId } from '../lib/weather';

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

/** Whether the weather is a thunderstorm, so we add lightning flashes. */
function isStorm(state?: string): boolean {
  return !!state && /(lightning|thunder|storm)/i.test(state);
}

/**
 * Ambient layers behind the UI: a time-of-day tint (set as a data attribute on
 * the root so CSS can recolor the background gradient) plus a subtle, optional
 * precipitation layer driven by the weather entity. Purely decorative.
 */
export function AmbientBackdrop({ entities }: Props) {
  const [tod, setTod] = useState<TimeOfDay>(() => timeOfDay());
  const [effects, setEffects] = useState<boolean>(() => getSettings().ambientEffects);

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

  // Live-preview / persist updates from the Settings modal.
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      setEffects(typeof detail === 'boolean' ? detail : getSettings().ambientEffects);
    };
    window.addEventListener('ha:ambient-effects', onChange);
    return () => window.removeEventListener('ha:ambient-effects', onChange);
  }, []);

  const weatherId = resolveWeatherId(entities);
  const weather = weatherId ? entities[weatherId] : undefined;

  // Dev preview override: ?precip=rain|snow|storm|none forces the precipitation
  // layer regardless of real weather, ?storm=1 forces lightning, and
  // ?tod=night|dawn|dusk|day forces the tint.
  const params =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const override = params?.get('precip') ?? null;
  const stormOverride = params?.get('storm');

  let kind: 'rain' | 'snow' | 'none';
  let storm: boolean;
  if (override === 'rain' || override === 'snow' || override === 'none') {
    kind = override;
    storm = false;
  } else if (override === 'storm') {
    kind = 'rain';
    storm = true;
  } else {
    kind = weatherKind(weather?.state);
    storm = isStorm(weather?.state);
  }
  if (stormOverride === '1' || stormOverride === 'true') storm = true;

  // An explicit URL override (?precip / ?storm) is a deliberate preview request,
  // so it bypasses the reduced-motion gate; automatic real-weather effects still
  // honor the user's reduced-motion preference.
  const forced = override !== null || stormOverride != null;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const showPrecip = effects && kind !== 'none' && (!reduced || forced);
  const showLightning = showPrecip && storm;

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
      {showLightning && <div className="ambient-lightning" aria-hidden="true" />}
    </>
  );
}
