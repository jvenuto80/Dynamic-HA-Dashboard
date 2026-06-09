import { useEffect, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import { resolveArtwork } from '../lib/entityInfo';
import { useArtworkColor } from '../hooks/useArtworkColor';
import { clockTime } from '../lib/format';
import { MediaProgress } from './DetailPanel';

type CallHA = (
  domain: string,
  service: string,
  data?: Record<string, unknown>,
  target?: { entity_id: string | string[] },
) => Promise<void>;

interface Props {
  entityId: string;
  entities: HassEntities;
  callHA: CallHA;
  /** Companion media_player to pull now-playing artwork from. */
  artworkEntity?: string;
  onClose: () => void;
  /** Open the regular detail flyout for this player (closes the takeover). */
  onOpenDetail: (entityId: string) => void;
}

/** Media states where the takeover no longer makes sense and self-dismisses. */
const GONE_STATES = ['off', 'unavailable', 'standby', 'unknown'];

/**
 * Full-bleed "lock screen" for the playing media (issue #18): the album art
 * takes over the whole viewport — blurred wall-to-wall behind a large artwork
 * card — with title/artist, live progress, transport controls and volume.
 * Tapping the backdrop (or Escape) returns to the dashboard.
 */
export function NowPlayingTakeover({ entityId, entities, callHA, artworkEntity, onClose, onOpenDetail }: Props) {
  const entity = entities[entityId];
  const gone = !entity || GONE_STATES.includes(entity.state);

  // Lock-screen clock, ticking on the minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Self-dismiss when the player turns off / disappears.
  useEffect(() => {
    if (gone) onClose();
  }, [gone, onClose]);

  const artwork = !gone ? resolveArtwork(entity, entityId, entities, artworkEntity) : undefined;
  const tint = useArtworkColor(artwork);

  if (gone) return null;

  const a = entity.attributes;
  const title = a.media_title as string | undefined;
  const artist = a.media_artist as string | undefined;
  const app = a.app_name as string | undefined;
  const deviceName = (a.friendly_name as string) || entityId;
  const volume = a.volume_level as number | undefined;
  const playing = entity.state === 'playing';
  const clock = clockTime(now);

  const media = (service: string) =>
    callHA('media_player', service, undefined, { entity_id: entityId });

  return (
    <div
      className="np-takeover"
      style={tint ? ({ '--art-tint': tint } as React.CSSProperties) : undefined}
      onClick={onClose}
    >
      {artwork && (
        <div className="np-backdrop" style={{ backgroundImage: `url("${artwork}")` }} aria-hidden="true" />
      )}
      <div className="np-scrim" aria-hidden="true" />

      <div className="np-head" onClick={(e) => e.stopPropagation()}>
        <div className="np-clock">
          {clock.time}
          {clock.suffix && <span className="np-clock-suffix">{clock.suffix}</span>}
        </div>
        <div className="np-head-actions">
          <button
            className="np-icon-btn"
            title="Device details"
            onClick={() => {
              onClose();
              onOpenDetail(entityId);
            }}
          >
            <span className="mdi mdi-tune-variant" />
          </button>
          <button className="np-icon-btn" title="Close" onClick={onClose}>
            <span className="mdi mdi-chevron-down" />
          </button>
        </div>
      </div>

      <div className="np-body" onClick={(e) => e.stopPropagation()}>
        {artwork ? (
          <img key={artwork} className="np-art" src={artwork} alt={title || 'Now playing'} />
        ) : (
          <div className="np-art np-art-empty">
            <span className="mdi mdi-music" />
          </div>
        )}

        <div className="np-meta">
          <div className="np-title">{title || deviceName}</div>
          <div className="np-sub">
            {artist || app || (title ? deviceName : entity.state)}
          </div>
          <div className="np-device">
            <span className="mdi mdi-speaker" /> {deviceName}
          </div>
        </div>

        <div className="np-progress">
          <MediaProgress entity={entity} />
        </div>

        <div className="np-controls">
          <button className="np-ctl" title="Previous" onClick={() => media('media_previous_track')}>
            <span className="mdi mdi-skip-previous" />
          </button>
          <button className="np-ctl np-ctl-main" title={playing ? 'Pause' : 'Play'} onClick={() => media('media_play_pause')}>
            <span className={`mdi ${playing ? 'mdi-pause' : 'mdi-play'}`} />
          </button>
          <button className="np-ctl" title="Next" onClick={() => media('media_next_track')}>
            <span className="mdi mdi-skip-next" />
          </button>
        </div>

        {volume !== undefined && (
          <div className="np-volume">
            <span className="mdi mdi-volume-low" />
            <input
              type="range"
              className="light-slider"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) =>
                callHA(
                  'media_player',
                  'volume_set',
                  { volume_level: parseInt(e.target.value) / 100 },
                  { entity_id: entityId },
                )
              }
            />
            <span className="mdi mdi-volume-high" />
          </div>
        )}
      </div>
    </div>
  );
}
