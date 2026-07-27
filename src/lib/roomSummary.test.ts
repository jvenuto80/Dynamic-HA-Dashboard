import { describe, it, expect } from 'vitest';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import {
  averageByDeviceClass,
  buildRoomSummary,
  countLightsOn,
  detectRoomProblems,
  entitiesInArea,
  entityIdsInArea,
  normalizeTempUnit,
  preferAreaDefaultSensor,
} from './roomSummary';
import { normalizeAreaEntry, normalizeDeviceEntry, normalizeEntityEntry } from './areaRegistry';
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
} from '../types';

function ent(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown> = {},
): HassEntity {
  return {
    entity_id,
    state,
    attributes: { friendly_name: entity_id, ...attributes },
    context: { id: 'x', parent_id: null, user_id: null },
    last_changed: '',
    last_updated: '',
  } as unknown as HassEntity;
}

const areaLiving: AreaRegistryEntry = {
  area_id: 'living_room',
  name: 'Living Room',
};

const areas: AreaRegistryEntry[] = [areaLiving];

const devices: DeviceRegistryEntry[] = [
  { id: 'dev_sensor', area_id: 'living_room' },
  { id: 'dev_orphan', area_id: 'bedroom' },
];

const entityReg: EntityRegistryEntry[] = [
  { entity_id: 'sensor.lr_temp', area_id: 'living_room' },
  { entity_id: 'sensor.lr_temp_2', area_id: null, device_id: 'dev_sensor' },
  { entity_id: 'sensor.lr_humidity', area_id: 'living_room' },
  { entity_id: 'light.lr_ceiling', area_id: 'living_room' },
  { entity_id: 'light.lr_lamp', area_id: 'living_room' },
  { entity_id: 'binary_sensor.lr_smoke', area_id: 'living_room' },
  { entity_id: 'lock.lr_door', area_id: 'living_room' },
  { entity_id: 'sensor.hidden_temp', area_id: 'living_room', hidden_by: 'user' },
  { entity_id: 'sensor.bed_temp', area_id: null, device_id: 'dev_orphan' },
];

describe('normalizeTempUnit', () => {
  it('normalizes celsius / fahrenheit variants', () => {
    expect(normalizeTempUnit('°C')).toBe('°C');
    expect(normalizeTempUnit('C')).toBe('°C');
    expect(normalizeTempUnit('℃')).toBe('°C');
    expect(normalizeTempUnit('°F')).toBe('°F');
    expect(normalizeTempUnit('f')).toBe('°F');
  });
});

describe('entityIdsInArea / entitiesInArea', () => {
  it('includes entities with area_id and entities via device area', () => {
    const ids = entityIdsInArea('living_room', entityReg, devices);
    expect(ids).toContain('sensor.lr_temp');
    expect(ids).toContain('sensor.lr_temp_2'); // via device
    expect(ids).not.toContain('sensor.bed_temp');
    expect(ids).not.toContain('sensor.hidden_temp'); // hidden_by
  });

  it('returns live states and honors excludes', () => {
    const states: HassEntities = {
      'sensor.lr_temp': ent('sensor.lr_temp', '22', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      'light.lr_ceiling': ent('light.lr_ceiling', 'on'),
      'light.lr_lamp': ent('light.lr_lamp', 'off'),
    };
    const list = entitiesInArea('living_room', entityReg, devices, states, [
      'light.lr_lamp',
    ]);
    expect(list.map((e) => e.entity_id).sort()).toEqual(
      ['light.lr_ceiling', 'sensor.lr_temp'].sort(),
    );
  });
});

describe('averageByDeviceClass', () => {
  it('averages same-unit temperature sensors', () => {
    const entities = [
      ent('sensor.a', '20', { device_class: 'temperature', unit_of_measurement: '°C' }),
      ent('sensor.b', '24', { device_class: 'temperature', unit_of_measurement: '°C' }),
      ent('sensor.c', 'unavailable', { device_class: 'temperature', unit_of_measurement: '°C' }),
    ];
    const avg = averageByDeviceClass(entities, 'temperature');
    expect(avg?.value).toBe(22);
    expect(avg?.unit).toBe('°C');
  });

  it('does not mix °C and °F — prefers the larger group', () => {
    const entities = [
      ent('sensor.c1', '21', { device_class: 'temperature', unit_of_measurement: '°C' }),
      ent('sensor.c2', '23', { device_class: 'temperature', unit_of_measurement: 'C' }),
      ent('sensor.f1', '70', { device_class: 'temperature', unit_of_measurement: '°F' }),
    ];
    const avg = averageByDeviceClass(entities, 'temperature');
    expect(avg?.unit).toBe('°C');
    expect(avg?.value).toBe(22);
  });

  it('returns undefined when no matching sensors', () => {
    expect(averageByDeviceClass([ent('light.x', 'on')], 'temperature')).toBeUndefined();
  });
});

describe('preferAreaDefaultSensor', () => {
  it('uses area temperature_entity_id when readable', () => {
    const area: AreaRegistryEntry = {
      ...areaLiving,
      temperature_entity_id: 'sensor.preferred',
    };
    const states: HassEntities = {
      'sensor.preferred': ent('sensor.preferred', '19.5', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      'sensor.other': ent('sensor.other', '30', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
    };
    const entities = [states['sensor.other']!, states['sensor.preferred']!];
    const result = preferAreaDefaultSensor(area, entities, states, 'temperature');
    expect(result?.value).toBe(19.5);
    expect(result?.sourceEntityId).toBe('sensor.preferred');
  });

  it('falls back to mean when preferred is unavailable', () => {
    const area: AreaRegistryEntry = {
      ...areaLiving,
      temperature_entity_id: 'sensor.preferred',
    };
    const states: HassEntities = {
      'sensor.preferred': ent('sensor.preferred', 'unavailable', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      'sensor.a': ent('sensor.a', '20', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      'sensor.b': ent('sensor.b', '24', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
    };
    const entities = [states['sensor.a']!, states['sensor.b']!];
    const result = preferAreaDefaultSensor(area, entities, states, 'temperature');
    expect(result?.value).toBe(22);
    expect(result?.sourceEntityId).toBeUndefined();
  });
});

describe('countLightsOn', () => {
  it('counts only light.* that are on', () => {
    const entities = [
      ent('light.a', 'on'),
      ent('light.b', 'off'),
      ent('switch.a', 'on'),
    ];
    expect(countLightsOn(entities)).toBe(1);
  });
});

describe('detectRoomProblems', () => {
  it('flags active smoke / gas / moisture as critical', () => {
    const entities = [
      ent('binary_sensor.smoke', 'on', { device_class: 'smoke' }),
      ent('binary_sensor.leak', 'on', { device_class: 'moisture' }),
      ent('binary_sensor.clear', 'off', { device_class: 'smoke' }),
    ];
    const problems = detectRoomProblems(entities);
    expect(problems).toHaveLength(2);
    expect(problems.every((p) => p.severity === 'critical')).toBe(true);
    expect(problems.map((p) => p.reason).sort()).toEqual(['moisture', 'smoke']);
  });

  it('flags unavailable light/lock/climate as warnings by default', () => {
    const entities = [
      ent('light.dead', 'unavailable'),
      ent('sensor.noise', 'unavailable', { device_class: 'illuminance' }),
    ];
    const problems = detectRoomProblems(entities);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      entity_id: 'light.dead',
      reason: 'unavailable',
      severity: 'warning',
    });
  });

  it('can disable important-unavailable flagging', () => {
    const entities = [ent('lock.x', 'unavailable')];
    expect(detectRoomProblems(entities, { flagImportantUnavailable: false })).toHaveLength(0);
  });
});

describe('buildRoomSummary', () => {
  it('composes climate, lights, and problems for an area', () => {
    const states: HassEntities = {
      'sensor.lr_temp': ent('sensor.lr_temp', '21', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      'sensor.lr_temp_2': ent('sensor.lr_temp_2', '23', {
        device_class: 'temperature',
        unit_of_measurement: '°C',
      }),
      'sensor.lr_humidity': ent('sensor.lr_humidity', '40', {
        device_class: 'humidity',
        unit_of_measurement: '%',
      }),
      'light.lr_ceiling': ent('light.lr_ceiling', 'on'),
      'light.lr_lamp': ent('light.lr_lamp', 'on'),
      'binary_sensor.lr_smoke': ent('binary_sensor.lr_smoke', 'off', {
        device_class: 'smoke',
      }),
      'lock.lr_door': ent('lock.lr_door', 'unavailable'),
    };

    const summary = buildRoomSummary({
      areaId: 'living_room',
      areas,
      entityReg,
      deviceReg: devices,
      states,
    });

    expect(summary.areaName).toBe('Living Room');
    expect(summary.temperature?.value).toBe(22);
    expect(summary.humidity?.value).toBe(40);
    expect(summary.lightsOn).toBe(2);
    expect(summary.problems).toHaveLength(1);
    expect(summary.problems[0]?.entity_id).toBe('lock.lr_door');
  });

  it('returns empty-safe summary for unknown area', () => {
    const summary = buildRoomSummary({
      areaId: 'nope',
      areas,
      entityReg,
      deviceReg: devices,
      states: {},
    });
    expect(summary.areaName).toBe('nope');
    expect(summary.lightsOn).toBe(0);
    expect(summary.problems).toEqual([]);
    expect(summary.temperature).toBeUndefined();
  });

  it('applies excludes to lights and problems', () => {
    const states: HassEntities = {
      'light.lr_ceiling': ent('light.lr_ceiling', 'on'),
      'light.lr_lamp': ent('light.lr_lamp', 'unavailable'),
    };
    const summary = buildRoomSummary({
      areaId: 'living_room',
      areas,
      entityReg,
      deviceReg: devices,
      states,
      opts: { exclude: ['light.lr_lamp'] },
    });
    expect(summary.lightsOn).toBe(1);
    expect(summary.problems).toHaveLength(0);
  });
});

describe('areaRegistry normalizers', () => {
  it('maps raw HA registry rows', () => {
    expect(
      normalizeAreaEntry({
        area_id: 'kitchen',
        name: 'Kitchen',
        temperature_entity_id: 'sensor.k_temp',
      }),
    ).toMatchObject({
      area_id: 'kitchen',
      name: 'Kitchen',
      temperature_entity_id: 'sensor.k_temp',
    });
    expect(normalizeDeviceEntry({ id: 'd1', area_id: 'kitchen' }).id).toBe('d1');
    expect(normalizeEntityEntry({ entity_id: 'light.x', area_id: null }).area_id).toBeNull();
  });
});
