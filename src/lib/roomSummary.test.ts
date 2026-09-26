import { describe, it, expect } from 'vitest';
import type { HassEntities, HassEntity } from 'home-assistant-js-websocket';
import {
  averageByDeviceClass,
  buildRoomSummary,
  collapseSubEntities,
  countLightsOn,
  detectRoomProblems,
  entitiesInArea,
  entityIdsInArea,
  normalizeTempUnit,
  preferAreaDefaultSensor,
  redundantGroups,
} from './roomSummary';
import {
  normalizeAreaEntry,
  normalizeDeviceEntry,
  normalizeDisplayEntity,
  normalizeEntityEntry,
} from './areaRegistry';
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
  { entity_id: 'sensor.chip_temp', area_id: 'living_room', entity_category: 'diagnostic' },
  { entity_id: 'button.restart', area_id: 'living_room', entity_category: 'config' },
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

  it('skips diagnostic and config entities', () => {
    const ids = entityIdsInArea('living_room', entityReg, devices);
    expect(ids).not.toContain('sensor.chip_temp');
    expect(ids).not.toContain('button.restart');
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

  it('per-tile override beats the area default', () => {
    const area: AreaRegistryEntry = { ...areaLiving, temperature_entity_id: 'sensor.area_default' };
    const states: HassEntities = {
      'sensor.area_default': ent('sensor.area_default', '30', {
        device_class: 'temperature',
        unit_of_measurement: '°F',
      }),
      'sensor.chosen': ent('sensor.chosen', '75.2', {
        device_class: 'temperature',
        unit_of_measurement: '°F',
      }),
    };
    const result = preferAreaDefaultSensor(area, [], states, 'temperature', 'sensor.chosen');
    expect(result).toMatchObject({ value: 75.2, unit: '°F', sourceEntityId: 'sensor.chosen' });
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

describe('redundantGroups', () => {
  const states: HassEntities = {
    'light.lamp_a': ent('light.lamp_a', 'on'),
    'light.lamp_b': ent('light.lamp_b', 'on'),
    'light.lamps': ent('light.lamps', 'on', { entity_id: ['light.lamp_a', 'light.lamp_b'] }),
    'light.all': ent('light.all', 'on', { entity_id: ['light.lamps', 'light.elsewhere'] }),
    'light.remote_group': ent('light.remote_group', 'on', { entity_id: ['light.elsewhere'] }),
    'light.loop': ent('light.loop', 'on', { entity_id: ['light.loop'] }),
    'scene.evening': ent('scene.evening', 'scening', { entity_id: ['light.lamp_a'] }),
  };

  it('flags groups (incl. nested) whose members are in the room, keeps stand-ins', () => {
    const ids = Object.keys(states);
    expect([...redundantGroups(ids, states)].sort()).toEqual(['light.all', 'light.lamps']);
  });

  it('counts each physical light once in buildRoomSummary', () => {
    const reg: EntityRegistryEntry[] = Object.keys(states).map((entity_id) => ({
      entity_id,
      area_id: 'living_room',
    }));
    const summary = buildRoomSummary({ areaId: 'living_room', areas, entityReg: reg, deviceReg: [], states });
    // lamp_a + lamp_b + remote_group (members elsewhere) + loop (self-referencing)
    expect(summary.lightsOn).toBe(4);
    expect(summary.groupIds?.sort()).toEqual(['light.all', 'light.lamps']);
  });
});

describe('collapseSubEntities', () => {
  it('folds same-device, same-domain entities whose name extends the main one', () => {
    const states: HassEntities = {
      'light.hexa': ent('light.hexa', 'on', { friendly_name: 'Glide Hexa' }),
      'light.hexa_seg_1': ent('light.hexa_seg_1', 'off', { friendly_name: 'Glide Hexa Segment 001' }),
      'light.hexa_seg_2': ent('light.hexa_seg_2', 'on', { friendly_name: 'Glide Hexa Segment 002' }),
      'switch.hexa_power': ent('switch.hexa_power', 'on', { friendly_name: 'Glide Hexa Power Switch' }),
      'light.group': ent('light.group', 'on', { friendly_name: 'Glide Hexa Group' }),
    };
    const deviceIds = {
      'light.hexa': 'd1',
      'light.hexa_seg_1': 'd1',
      'light.hexa_seg_2': 'd1',
      'switch.hexa_power': 'd1',
    };
    const out = collapseSubEntities(Object.keys(states), states, deviceIds);
    expect(out).toEqual([
      { id: 'light.hexa', children: ['light.hexa_seg_1', 'light.hexa_seg_2'] },
      { id: 'switch.hexa_power', children: [] }, // other domain
      { id: 'light.group', children: [] }, // no device
    ]);
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

  it('collapses unavailable entities of one device into a single warning', () => {
    const wled: DeviceRegistryEntry = { id: 'wled', name: 'WLED', name_by_user: 'Office Strip' };
    const deviceOf = (id: string) => (id.startsWith('light.seg') ? wled : undefined);
    const entities = [
      ent('light.seg_1', 'unavailable'),
      ent('light.seg_2', 'unavailable'),
      ent('light.seg_3', 'unavailable'),
      ent('lock.front', 'unavailable'),
    ];
    const problems = detectRoomProblems(entities, {}, deviceOf);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatchObject({ entity_id: 'light.seg_1', label: 'Office Strip', count: 3 });
    expect(problems[1]).toMatchObject({ entity_id: 'lock.front' });
    expect(problems[1]?.count).toBeUndefined();
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

  it('normalizes compact list_for_display rows', () => {
    const cats = { '0': 'config', '1': 'diagnostic' };
    expect(
      normalizeDisplayEntity({ ei: 'sensor.chip', di: 'd1', ec: 1, pl: 'mqtt' }, cats),
    ).toEqual({
      entity_id: 'sensor.chip',
      area_id: null,
      device_id: 'd1',
      platform: 'mqtt',
      disabled_by: null,
      hidden_by: null,
      entity_category: 'diagnostic',
    });
    const hidden = normalizeDisplayEntity({ ei: 'sensor.cost', ai: 'kitchen', hb: true }, cats);
    expect(hidden).toMatchObject({ area_id: 'kitchen', hidden_by: 'hidden', entity_category: null });
    expect(entityIdsInArea('kitchen', [hidden], [])).toEqual([]);
  });
});
