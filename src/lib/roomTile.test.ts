import { describe, it, expect } from 'vitest';
import {
  areaIdFromRoomTile,
  formatRoomFaceStats,
  isRoomTile,
  makeRoomTile,
  roomAreaId,
  roomTileId,
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
    const re = makeRoomTile('gostinaia', 'Гостиная');
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
