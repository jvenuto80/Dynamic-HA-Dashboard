import { useTranslation } from 'react-i18next';
import { eventTimeLabel, nextEventSummary, type CalendarEvent } from '../lib/calendar';

interface Props {
  events: CalendarEvent[];
  name: string;
  icon: string;
  onOpen?: () => void;
}

/**
 * Wide "Up next" calendar tile (issue #25) — a special (non-entity) tile
 * placeable from the picker, spanning two columns like other span tiles. Shows
 * the next event with a "then …" second line and how many more remain today;
 * tapping opens the 7-day agenda flyout.
 */
export function CalendarTile({ events, name, icon, onOpen }: Props) {
  const { t } = useTranslation();
  const headline = nextEventSummary(events);
  const next = headline?.next;
  // The event after the headline one, for the "then …" line.
  const then = next
    ? events.filter((e) => e.end.getTime() > Date.now() && e !== next)[0]
    : undefined;

  return (
    <div className="tile span calendar-tile" onClick={onOpen}>
      <div className="tile-top">
        <span className={`mdi ${icon} tile-icon cal-tile-icon`} />
        {headline && headline.moreToday > 0 && (
          <span className="cal-tile-more">
            {headline.moreToday} {t('cal_more_today')}
          </span>
        )}
      </div>
      <div className="tile-info">
        {next ? (
          <>
            <div className="tile-name">{next.summary}</div>
            <div className="tile-sub">
              <span className="cal-tile-time">{eventTimeLabel(next)}</span>
              {then && (
                <span className="cal-tile-then">
                  {' '}· then {then.summary} {eventTimeLabel(then)}
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="tile-name">{name}</div>
            <div className="tile-sub">{t('cal_nothing_short')}</div>
          </>
        )}
      </div>
    </div>
  );
}
