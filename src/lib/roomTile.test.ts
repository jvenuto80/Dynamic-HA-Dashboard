import { describe, it, expect } from 'vitest';
import {
  areaIdFromRoomTile,
  formatRoomFaceStats,
  groupRoomDevices,
  isRoomTile,
  makeRoomTile,
  roomAreaId,
  roomDeviceDomains,
  roomSummaryOpts,
  roomTileId,
  ROOM_DEFAULT_DEVICE_DOMAINS,
} from './roomTile';
import type { RoomSummary } from '../types';

const summary: RoomSummary = {
  areaId: 'gostinaia',
  areaName: 'Гостиная',
  temperature: { value: 25.89, unit: '°C' },
  humidity: { value: 43.17, unit: '%' },
  lightsOn: 2,
  problems: [{ entity_id: 'binary_sensor.smoke', reason: 'smoke', severity: 'critical' }],
  entityIds: ['sensor.t', 'light.a', 'light.b'],
};

describe('roomTile ids', () => {
  it('round-trips area ids', () => {
    expect(roomTileId('gostinaia')).toBe('glance.room.gostinaia');
    expect(isRoomTile('glance.room.gostinaia')).toBe(true);
    expect(isRoomTile('glance.room')).toBe(false);
    expect(isRoomTile('glance.calendar')).toBe(false);
    expect(areaIdFromRoomTile('glance.room.gostinaia')).toBe('gostinaia');
  });

  it('makeRoomTile sets defaults', () => {
    const re = makeRoomTile('gostinaia');
    expect(re.name).toBeUndefined();
    expect(re.entity_id).toBe('glance.room.gostinaia');
    expect(re.areaId).toBe('gostinaia');
    expect(re.size).toBe('2x1');
    expect(re.type).toBe('room');
    expect(roomAreaId(re)).toBe('gostinaia');
  });
});

describe('formatRoomFaceStats', () => {
  it('formats climate + lights', () => {
    expect(formatRoomFaceStats(summary)).toBe('25.9°C · 43% · 2 lights');
  });

  it('honors show toggles', () => {
    expect(formatRoomFaceStats(summary, { avgHumidity: false, lightsOn: false })).toBe('25.9°C');
  });

  it('uses custom lights label', () => {
    expect(formatRoomFaceStats(summary, {}, (n) => `${n} Licht`)).toContain('2 Licht');
  });
});

describe('room tile customization', () => {
  it('maps tile settings to engine options', () => {
    const re = {
      ...makeRoomTile('office'),
      exclude: ['sensor.cpu'],
      tempSource: 'sensor.ac_temp',
      flagUnavailable: false,
    };
    expect(roomSummaryOpts(re)).toEqual({
      exclude: ['sensor.cpu'],
      temperatureEntity: 'sensor.ac_temp',
      humidityEntity: undefined,
      flagImportantUnavailable: false,
    });
  });

  it('defaults the flyout to controllable domains', () => {
    expect(roomDeviceDomains(makeRoomTile('office'))).toEqual(ROOM_DEFAULT_DEVICE_DOMAINS);
  });

  it('groups by domain in display order and counts hidden entities', () => {
    const ids = ['sensor.t', 'light.b', 'switch.s', 'light.a', 'update.fw', 'number.x'];
    const { groups, hidden } = groupRoomDevices(ids, ['switch', 'light', 'other']);
    expect(groups).toEqual([
      { domain: 'light', ids: ['light.b', 'light.a'] },
      { domain: 'switch', ids: ['switch.s'] },
      { domain: 'other', ids: ['update.fw', 'number.x'] },
    ]);
    expect(hidden).toBe(1);
  });
});
