import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { RoomEntity, RoomSummary } from '../types';
import { formatRoomFaceStats, roomShow } from '../lib/roomTile';
import { sizeToSpan } from '../lib/tileSize';

interface Props {
  re: RoomEntity;
  summary: RoomSummary;
  onOpen: () => void;
  /** Entrance cascade index (matches DeviceTile). */
  enterIndex?: number;
}

/**
 * Area-based Room Summary face (issue #48).
 * Tap opens the room flyout (not a single-entity detail panel).
 */
export function RoomTile({ re, summary, onOpen, enterIndex }: Props) {
  const { t } = useTranslation();
  const show = roomShow(re);
  const size = re.size ?? '2x1';
  const { span, tall } = sizeToSpan(size);
  const problems = show.problems ? summary.problems : [];
  const crit = problems.some((p) => p.severity === 'critical');
  const hasProblems = problems.length > 0;
  const stats = formatRoomFaceStats(summary, show, (n) => t('room_lights_on', { count: n }));
  const name = re.name || summary.areaName || summary.areaId;
  const empty = !stats && !hasProblems;

  return (
    <button
      type="button"
      className={[
        'tile',
        'room-summary-tile',
        span ? 'span' : '',
        tall ? 'tall' : '',
        hasProblems ? (crit ? 'room-tile-crit' : 'room-tile-warn') : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={onOpen}
      style={
        enterIndex != null
          ? ({ '--enter-i': enterIndex } as CSSProperties)
          : undefined
      }
    >
      <div className="tile-top">
        <span className={`mdi ${re.icon || 'mdi-floor-plan'} tile-icon room-tile-icon`} />
        {hasProblems && (
          <span className={`room-tile-badge${crit ? ' crit' : ''}`}>
            <span className="mdi mdi-alert" aria-hidden="true" /> {problems.length}
          </span>
        )}
      </div>
      <div className="tile-info">
        <div className="tile-name">{name}</div>
        <div className="tile-sub">
          {stats || (empty ? t('room_empty_sensors') : '')}
        </div>
      </div>
    </button>
  );
}
