import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { HassEntities } from 'home-assistant-js-websocket';
import {
  activeCalendarIds,
  calendarColor,
  eventTimeLabel,
  groupByDay,
  type CalendarEvent,
} from '../lib/calendar';

interface Props {
  events: CalendarEvent[];
  entities: HassEntities;
  onClose: () => void;
}

/**
 * Rolling 7-day agenda flyout (issue #25), opened from the at-a-glance
 * calendar chip or the "Up next" tile. Reuses the detail-panel chrome: events
 * grouped per day, a colored dot per source calendar, all-day events pinned
 * first, and a calendar legend when more than one feeds the list.
 */
export function CalendarFlyout({ events, entities, onClose }: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const calendarIds = activeCalendarIds(entities);
  const days = groupByDay(events, 7);

  const calendarName = (id: string) =>
    (entities[id]?.attributes.friendly_name as string) || id.replace('calendar.', '');

  return (
    <>
      <div className="detail-overlay open" onClick={onClose} />
      <div className="detail-panel open">
        <div className="detail-header">
          <h2>
            <span className="mdi mdi-calendar-month" style={{ color: 'var(--accent-primary)', marginRight: 8 }} />
            {t('cal_next_7_days')}
          </h2>
          <button className="detail-close" onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        {days.length === 0 ? (
          <div className="cal-empty">
            <span className="mdi mdi-calendar-check" />
            <p>{t('cal_nothing_scheduled')}</p>
          </div>
        ) : (
          days.map((day) => (
            <div className="cal-day" key={day.date.toDateString()}>
              <div className="cal-day-label">{day.label}</div>
              {day.events.map((e, i) => (
                <div className="cal-event glass-card" key={`${e.calendarId}-${e.start.getTime()}-${i}`}>
                  <span className="cal-dot" style={{ background: calendarColor(e.calendarId, calendarIds) }} />
                  <span className={`cal-time ${e.allDay ? 'all-day' : ''}`}>{eventTimeLabel(e)}</span>
                  <span className="cal-body">
                    <span className="cal-summary">{e.summary}</span>
                    {e.location && (
                      <span className="cal-location">
                        <span className="mdi mdi-map-marker-outline" /> {e.location}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}

        {calendarIds.length > 1 && (
          <div className="cal-legend">
            {calendarIds.map((id) => (
              <span className="cal-legend-item" key={id}>
                <span className="cal-dot" style={{ background: calendarColor(id, calendarIds) }} />
                {calendarName(id)}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
