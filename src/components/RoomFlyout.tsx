import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import type { RoomEntity, RoomSummary } from '../types';
import { formatRoomFaceStats, groupRoomDevices, roomDeviceDomains, roomShow } from '../lib/roomTile';
import { entityIcon, entitySummary } from '../lib/entityInfo';
import { smartFormatState } from '../lib/format';
import { collapseSubEntities } from '../lib/roomSummary';

const nameOf = (e: HassEntity | undefined, id: string) =>
  (e?.attributes.friendly_name as string) || id;

function displayState(e: HassEntity | undefined): string {
  if (!e) return '—';
  if (e.state === 'unavailable' || e.state === 'unknown') return e.state;
  return smartFormatState(e) ?? entitySummary(e);
}

interface Props {
  re: RoomEntity;
  summary: RoomSummary;
  entities: HassEntities;
  onOpenDetail: (entityId: string) => void;
  onClose: () => void;
}

/**
 * Room Summary flyout (issue #48): climate, problems, then devices in the area.
 * Row tap opens the existing entity DetailPanel.
 */
export function RoomFlyout({ re, summary, entities, onOpenDetail, onClose }: Props) {
  const { t } = useTranslation();
  const show = roomShow(re);
  const name = re.name || summary.areaName || summary.areaId;
  const stats = formatRoomFaceStats(summary, show, (n) => t('room_lights_on', { count: n }));
  const problems = show.problems ? summary.problems : [];
  const folded =
    re.collapseSegments === false
      ? summary.entityIds.map((id) => ({ id, children: [] as string[] }))
      : collapseSubEntities(summary.entityIds, entities, summary.deviceIds ?? {});
  const childCount = new Map(folded.map((f) => [f.id, f.children.length]));
  const groupIds = new Set(summary.groupIds ?? []);
  const { groups, hidden } = groupRoomDevices(
    folded.map((f) => f.id),
    roomDeviceDomains(re),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reasonLabel = (reason: string) => {
    const key = `room_reason_${reason}`;
    const translated = t(key);
    return translated === key ? reason : translated;
  };

  return (
    <div className="detail-overlay open" onClick={onClose}>
      <div className="detail-panel open room-flyout" onClick={(e) => e.stopPropagation()}>
        <div className="detail-header">
          <h2>{name}</h2>
          {stats && <div className="detail-state room-flyout-stats">{stats}</div>}
          <button type="button" className="detail-close" title={t('tile_close')} onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>

        <div className="detail-body room-flyout-body">
          {(show.avgTemp || show.avgHumidity) && (
            <section className="room-flyout-section">
              <h4 className="room-flyout-h">{t('room_climate')}</h4>
              {!summary.temperature && !summary.humidity ? (
                <p className="room-flyout-empty">{t('room_empty_sensors')}</p>
              ) : (
                <ul className="room-flyout-list">
                  {show.avgTemp && summary.temperature && (
                    <li className="room-flyout-row static">
                      <span className="mdi mdi-thermometer" />
                      <span>{t('room_temperature')}</span>
                      <strong>
                        {summary.temperature.value.toFixed(1)}
                        {summary.temperature.unit}
                      </strong>
                    </li>
                  )}
                  {show.avgHumidity && summary.humidity && (
                    <li className="room-flyout-row static">
                      <span className="mdi mdi-water-percent" />
                      <span>{t('room_humidity')}</span>
                      <strong>
                        {Math.round(summary.humidity.value)}
                        {summary.humidity.unit}
                      </strong>
                    </li>
                  )}
                </ul>
              )}
            </section>
          )}

          <section className="room-flyout-section">
            <h4 className="room-flyout-h">{t('room_problems')}</h4>
            {problems.length === 0 ? (
              <p className="room-flyout-empty">{t('room_no_problems')}</p>
            ) : (
              <ul className="room-flyout-list">
                {problems.map((p) => (
                  <li key={p.entity_id}>
                    <button
                      type="button"
                      className={`room-flyout-row problem ${p.severity}`}
                      onClick={() => onOpenDetail(p.entity_id)}
                    >
                      <span className="mdi mdi-alert" />
                      <span className="room-flyout-entity">
                        {p.label ||
                          (entities[p.entity_id]?.attributes.friendly_name as string) ||
                          p.entity_id}
                      </span>
                      <span className="room-flyout-reason">
                        {reasonLabel(p.reason)}
                        {p.count && p.count > 1 ? ` ×${p.count}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="room-flyout-section">
            <h4 className="room-flyout-h">{t('room_sum_devices')}</h4>
            {groups.length === 0 ? (
              <p className="room-flyout-empty">{t('room_empty_devices')}</p>
            ) : (
              groups.map(({ domain, ids }) => (
                <div key={domain} className="room-flyout-group">
                  <h5 className="room-flyout-subh">
                    {t(`room_dom_${domain}`)} <span>{ids.length}</span>
                  </h5>
                  <ul className="room-flyout-list">
                    {ids
                      .map((id) => ({ id, ent: entities[id] }))
                      .sort(
                        (a, b) =>
                          Number(groupIds.has(b.id)) - Number(groupIds.has(a.id)) ||
                          nameOf(a.ent, a.id).localeCompare(nameOf(b.ent, b.id)),
                      )
                      .map(({ id, ent }) => {
                        const offline = !ent || ent.state === 'unavailable' || ent.state === 'unknown';
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              className={`room-flyout-row${offline ? ' offline' : ''}`}
                              onClick={() => onOpenDetail(id)}
                            >
                              <span className={`mdi ${entityIcon(id, ent?.state ?? '')}`} />
                              <span className="room-flyout-entity">{nameOf(ent, id)}</span>
                              {groupIds.has(id) && (
                                <span className="room-flyout-more">{t('room_group_badge')}</span>
                              )}
                              {(childCount.get(id) ?? 0) > 0 && (
                                <span className="room-flyout-more">+{childCount.get(id)}</span>
                              )}
                              <span className="room-flyout-state">{displayState(ent)}</span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                </div>
              ))
            )}
            {hidden > 0 && (
              <p className="room-flyout-empty room-flyout-hidden">
                {t('room_hidden_count', { count: hidden })}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
