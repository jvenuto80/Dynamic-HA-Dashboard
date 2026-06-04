import type { SceneConfig, PersonConfig, Room, DashView } from './types';
import { getHaUrl, getHaToken } from './settings';

// Live bindings: ES module imports update when these are reassigned, so calling
// refreshConnection() after adopting a server-shared connection updates every
// consumer (image/camera URL builders, the WebSocket hook, etc.).
export let HA_URL = getHaUrl();
export let HA_TOKEN = getHaToken();

/** Re-read the effective connection (used after hydrating from the server). */
export function refreshConnection(): void {
  HA_URL = getHaUrl();
  HA_TOKEN = getHaToken();
}

export const scenes: SceneConfig[] = [
  // Global
  { entity_id: 'input_boolean.party', name: 'Party', icon: 'mdi-party-popper', color: '#a855f7' },
  { entity_id: 'input_boolean.bed_time', name: 'Night', icon: 'mdi-bed', color: '#6366f1' },
  { entity_id: 'scene.downstairs_lights_on', name: 'Lights On', icon: 'mdi-lightbulb-on', color: '#f59e0b' },
  { entity_id: 'scene.downstairs_lights_off', name: 'Lights Off', icon: 'mdi-lightbulb-off', color: '#64748b' },
  { entity_id: 'input_boolean.simulate_presence', name: 'Away', icon: 'mdi-home-export-outline', color: '#10b981' },
  // Bedroom
  { entity_id: 'scene.turn_bedroom_lamps_on', name: 'Lamps On', icon: 'mdi-lamp', color: '#f59e0b' },
  { entity_id: 'scene.turn_bedroom_lamps_off', name: 'Lamps Off', icon: 'mdi-lamp', color: '#64748b' },
  { entity_id: 'scene.turn_bedroom_fan_light_on', name: 'Fan Light On', icon: 'mdi-ceiling-fan-light', color: '#f59e0b' },
  { entity_id: 'scene.turn_bedroom_fan_light_off', name: 'Fan Light Off', icon: 'mdi-ceiling-fan', color: '#64748b' },
  // Guest
  { entity_id: 'scene.guest_room_lamps_on', name: 'Lamps On', icon: 'mdi-lamp', color: '#f59e0b' },
  { entity_id: 'scene.guest_room_all_lights_off', name: 'All Off', icon: 'mdi-lightbulb-off', color: '#64748b' },
  { entity_id: 'scene.guest_bathroom_scene_day', name: 'Bath Day', icon: 'mdi-shower', color: '#38bdf8' },
  { entity_id: 'scene.guest_bathroom_scene', name: 'Bath Night', icon: 'mdi-shower', color: '#6366f1' },
  // Office
  { entity_id: 'scene.office_on', name: 'Office', icon: 'mdi-desktop-tower-monitor', color: '#3b82f6' },
  { entity_id: 'scene.office_off', name: 'Office Off', icon: 'mdi-desktop-tower-monitor', color: '#64748b' },
  { entity_id: 'scene.office_on_without_blinds', name: 'No Blinds', icon: 'mdi-blinds', color: '#3b82f6' },
  { entity_id: 'scene.office_blinds_up', name: 'Blinds Up', icon: 'mdi-blinds-open', color: '#f59e0b' },
  { entity_id: 'scene.office_blinds_down', name: 'Blinds Down', icon: 'mdi-blinds', color: '#64748b' },
  // Outdoor
  { entity_id: 'scene.backyard_lights_on_at_sunset', name: 'Backyard', icon: 'mdi-weather-sunset', color: '#f97316' },
  { entity_id: 'scene.pool_time', name: 'Pool Time', icon: 'mdi-pool', color: '#06b6d4' },
  { entity_id: 'scene.pool_time_end', name: 'Pool Off', icon: 'mdi-pool', color: '#64748b' },
];

export const persons: PersonConfig[] = [
  { entity_id: 'person.jv', name: 'Jeff' },
  { entity_id: 'person.carissa', name: 'Carissa' },
];

export const rooms: Room[] = [
  {
    id: 'living_room',
    name: 'Living Room',
    icon: 'mdi-sofa',
    entities: [
      { entity_id: 'light.living_room_lamp', name: 'Lamps' },
      { entity_id: 'light.livingroom_overhead_light', name: 'Overhead' },
      { entity_id: 'light.livingroom_fan_lights', name: 'Fan' },
      { entity_id: 'cover.living_room_blinds', name: 'Blinds' },
      { entity_id: 'media_player.living_room_tv_cast', name: 'TV' },
    ],
  },
  {
    id: 'kitchen',
    name: 'Kitchen',
    icon: 'mdi-countertop',
    entities: [
      { entity_id: 'light.kitchen_lights', name: 'Lights' },
      { entity_id: 'light.kitchen_table_light', name: 'Table' },
      { entity_id: 'light.dining_room', name: 'Dining' },
    ],
  },
  {
    id: 'hallway',
    name: 'Hallway & Foyer',
    icon: 'mdi-foot-print',
    entities: [
      { entity_id: 'light.foyer', name: 'Foyer' },
      { entity_id: 'light.hallway_lights', name: 'Hallway' },
      { entity_id: 'light.hallway_lamp', name: 'Hall Lamp' },
      { entity_id: 'light.downstairs_bath', name: 'Bath' },
      { entity_id: 'switch.attic_light', name: 'Attic' },
    ],
  },
  {
    id: 'bedroom',
    name: 'Master Bedroom',
    icon: 'mdi-bed-king',
    entities: [
      { entity_id: 'light.master_bedroom_lights', name: 'All Lights' },
      { entity_id: 'light.bedroom_lamps', name: 'Lamps' },
      { entity_id: 'light.bedroom_fan_lights', name: 'Fan' },
      { entity_id: 'light.mb_overhead_light', name: 'Overhead' },
      { entity_id: 'light.mb_fan', name: 'Fan Light' },
      { entity_id: 'media_player.mb_tv_cast', name: 'TV' },
      { entity_id: 'climate.main_floor', name: 'Climate' },
    ],
  },
  {
    id: 'master_bath',
    name: 'Master Bath',
    icon: 'mdi-shower',
    entities: [
      { entity_id: 'light.mb_toilet', name: 'Toilet' },
      { entity_id: 'light.sink_lights', name: 'Sink' },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    icon: 'mdi-desktop-tower-monitor',
    entities: [
      { entity_id: 'light.office_lights', name: 'Lights' },
      { entity_id: 'light.office_fan_lights', name: 'Fan' },
      { entity_id: 'light.office_lamps', name: 'Lamps' },
      { entity_id: 'light.wled', name: 'WLED' },
      { entity_id: 'cover.office_blinds', name: 'Blinds' },
      { entity_id: 'switch.kauf_plug_3_tvcenter', name: 'TV Center' },
      { entity_id: 'switch.printer_power', name: 'Printer' },
      { entity_id: 'media_player.office_shield', name: 'Shield' },
      { entity_id: 'climate.office_ac_t6_pro_thermostat', name: 'Climate' },
      { entity_id: 'sensor.upstairs_power', name: 'Power' },
    ],
  },
  {
    id: 'cs_office',
    name: "C's Office",
    icon: 'mdi-laptop',
    entities: [
      { entity_id: 'light.c_s_office', name: 'Lights' },
      { entity_id: 'switch.office_desk_lamp', name: 'Desk Lamp' },
    ],
  },
  {
    id: 'guest_room',
    name: 'Guest Room',
    icon: 'mdi-bed-double',
    entities: [
      { entity_id: 'light.guest_bedroom_fan_lights', name: 'Fan Lights' },
      { entity_id: 'switch.guest_lamps', name: 'Lamps' },
      { entity_id: 'light.guest_bathroom', name: 'Bathroom' },
      { entity_id: 'sensor.guest_temp_sensor_temperature', name: 'Temperature' },
    ],
  },
  {
    id: 'outdoor',
    name: 'Outdoor',
    icon: 'mdi-tree',
    entities: [
      { entity_id: 'light.backyard_porch', name: 'Porch' },
      { entity_id: 'light.backyard_floodlight', name: 'Floodlight' },
      { entity_id: 'light.backyard_spotlights', name: 'Spotlights' },
    ],
  },
  {
    id: 'garage',
    name: 'Garage',
    icon: 'mdi-garage',
    entities: [
      { entity_id: 'cover.garagedoor_door', name: 'Door' },
      { entity_id: 'light.garagedoor_light', name: 'Door Light' },
      { entity_id: 'switch.garage_overhead_light', name: 'Overhead' },
    ],
  },
];

export const cameras = [
  { entity_id: 'camera.front_door_camera_low_resolution_channel', name: 'Front Door' },
  { entity_id: 'camera.front_yard_camera_low_resolution_channel', name: 'Front Yard' },
  { entity_id: 'camera.backyard_camera_low_resolution_channel', name: 'Backyard' },
  { entity_id: 'camera.garage_camera_low_resolution_channel', name: 'Garage' },
  { entity_id: 'camera.front_door_camera_package_camera', name: 'Package Cam' },
];

export const locks = [
  { entity_id: 'lock.door', name: 'Front Door' },
  { entity_id: 'lock.backdoor', name: 'Back Door' },
];

export const climateEntities = [
  { entity_id: 'climate.main_floor', name: 'Downstairs' },
  { entity_id: 'climate.office_ac_t6_pro_thermostat', name: 'Upstairs' },
];

export const sensorWidgets = [
  { entity_id: 'sensor.main_floor_temperature', name: 'Downstairs', icon: 'mdi-thermometer', unit: '°F' },
  { entity_id: 'sensor.main_floor_humidity', name: 'Humidity', icon: 'mdi-water-percent', unit: '%' },
  { entity_id: 'sensor.upstairs_power', name: 'Office Power', icon: 'mdi-flash', unit: 'W' },
  { entity_id: 'sensor.server_plug_power', name: 'Server', icon: 'mdi-server', unit: 'W' },
  { entity_id: 'sensor.energy_billing_cycle', name: 'Energy Cycle', icon: 'mdi-currency-usd', unit: 'kWh' },
  { entity_id: 'sensor.tower_cpu_temperature', name: 'Unraid CPU', icon: 'mdi-chip', unit: '°C' },
];

/**
 * Dashboard views — mirrors the Home Assistant Lovelace dashboard tabs and their
 * titled sections. Generated from the live HA config (scripts/extract-views.mjs).
 */
export const views: DashView[] = [
  {
    id: 'main',
    name: 'Home',
    icon: 'mdi-home',
    scenes: [
      'input_boolean.party',
      'input_boolean.bed_time',
      'scene.downstairs_lights_on',
      'scene.downstairs_lights_off',
      'scene.backyard_lights_on_at_sunset',
      'scene.pool_time',
      'input_boolean.simulate_presence',
    ],
    sections: [
      {
        title: 'Lighting',
        entities: [
          { entity_id: 'light.living_room_lamp', name: 'Living Room' },
          { entity_id: 'light.livingroom_overhead_light', name: 'Overhead' },
          { entity_id: 'light.livingroom_fan_lights', name: 'Fan' },
          { entity_id: 'light.kitchen_lights', name: 'Kitchen' },
          { entity_id: 'light.kitchen_table_light', name: 'Table' },
          { entity_id: 'light.dining_room', name: 'Dining' },
          { entity_id: 'light.foyer', name: 'Foyer' },
          { entity_id: 'light.hallway_lights', name: 'Hallway' },
          { entity_id: 'light.hallway_lamp', name: 'Hall Lamp' },
        ],
      },
      {
        title: 'Security & Access',
        entities: [
          { entity_id: 'lock.door', name: 'Front Door' },
          { entity_id: 'lock.backdoor', name: 'Back Door' },
          { entity_id: 'cover.garagedoor_door', name: 'Garage', camera: 'camera.garage_camera_low_resolution_channel' },
          { entity_id: 'cover.living_room_blinds', name: 'Blinds' },
        ],
      },
      {
        title: 'Outdoor',
        entities: [
          { entity_id: 'light.backyard_porch', name: 'Porch' },
          { entity_id: 'light.backyard_floodlight', name: 'Floodlight' },
          { entity_id: 'light.backyard_spotlights', name: 'Spotlights' },
        ],
      },
      {
        title: 'Climate & Utilities',
        entities: [
          { entity_id: 'climate.main_floor', name: 'Downstairs' },
          { entity_id: 'light.garagedoor_light', name: 'Garage Light' },
          { entity_id: 'switch.garage_overhead_light', name: 'Garage Overhead' },
          { entity_id: 'switch.attic_light', name: 'Attic' },
          { entity_id: 'light.downstairs_bath', name: 'Downstairs Bath' },
        ],
      },
      {
        title: 'Quick Actions',
        entities: [
          { entity_id: 'script.remote_finder_livingroom', name: 'Find Remote' },
          { entity_id: 'input_boolean.bed_time', name: 'Night' },
          { entity_id: 'input_boolean.simulate_presence', name: 'Away' },
        ],
      },
    ],
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    icon: 'mdi-bed-king',
    scenes: [
      'scene.turn_bedroom_lamps_on',
      'scene.turn_bedroom_lamps_off',
      'scene.turn_bedroom_fan_light_on',
      'scene.turn_bedroom_fan_light_off',
      'input_boolean.bed_time',
    ],
    sections: [
      {
        title: 'Bedroom Lighting',
        entities: [
          { entity_id: 'light.master_bedroom_lights', name: 'All Lights' },
          { entity_id: 'light.bedroom_lamps', name: 'Lamps' },
          { entity_id: 'light.bedroom_fan_lights', name: 'Fan' },
        ],
      },
      {
        title: 'Master Bath',
        entities: [
          { entity_id: 'light.mb_toilet', name: 'Toilet' },
          { entity_id: 'light.sink_lights', name: 'Sink' },
          { entity_id: 'light.mb_overhead_light', name: 'Overhead' },
          { entity_id: 'light.mb_fan', name: 'Fan' },
        ],
      },
      {
        title: 'Outdoor',
        entities: [
          { entity_id: 'light.backyard_porch', name: 'Porch' },
          { entity_id: 'light.backyard_floodlight', name: 'Floodlight' },
          { entity_id: 'light.backyard_spotlights', name: 'Spotlights' },
        ],
      },
      {
        title: 'Climate & Quick Actions',
        entities: [
          { entity_id: 'climate.main_floor', name: 'Downstairs' },
          { entity_id: 'script.remote_finder_master_bedroom', name: 'Find Remote' },
        ],
      },
    ],
  },
  {
    id: 'guest',
    name: 'Guest',
    icon: 'mdi-bed-double',
    scenes: [
      'scene.guest_room_lamps_on',
      'scene.guest_room_all_lights_off',
      'scene.guest_bathroom_scene_day',
      'scene.guest_bathroom_scene',
    ],
    sections: [
      {
        title: 'Guest Room',
        entities: [
          { entity_id: 'light.guest_bedroom_fan_lights', name: 'Fan Lights' },
          { entity_id: 'switch.guest_lamps', name: 'Lamps' },
        ],
      },
      {
        title: 'Climate',
        entities: [
          { entity_id: 'climate.office_ac_t6_pro_thermostat', name: 'Upstairs' },
          { entity_id: 'sensor.guest_temp_sensor_temperature', name: 'Temperature' },
        ],
      },
    ],
  },
  {
    id: 'office',
    name: 'Office',
    icon: 'mdi-desktop-tower-monitor',
    scenes: [
      'scene.office_on',
      'scene.office_off',
      'scene.office_on_without_blinds',
      'scene.office_blinds_up',
      'scene.office_blinds_down',
    ],
    sections: [
      {
        title: 'Office Lighting',
        entities: [
          { entity_id: 'light.office_lights', name: 'Lights' },
          { entity_id: 'light.office_fan_lights', name: 'Fan' },
          { entity_id: 'light.office_lamps', name: 'Lamps' },
          { entity_id: 'light.wled', name: 'WLED' },
        ],
      },
      {
        title: 'Devices & Blinds',
        entities: [
          { entity_id: 'switch.kauf_plug_3_tvcenter', name: 'TV Center' },
          { entity_id: 'switch.printer_power', name: 'Printer' },
          { entity_id: 'cover.office_blinds', name: 'Blinds' },
        ],
      },
      {
        title: 'Climate & Utilities',
        entities: [
          { entity_id: 'climate.office_ac_t6_pro_thermostat', name: 'Upstairs' },
          { entity_id: 'light.guest_bathroom', name: 'Guest Bath' },
          { entity_id: 'script.restart_matter_server', name: 'Restart Matter' },
          { entity_id: 'input_boolean.stop_office_lights_on_automation', name: 'Pause Auto Lights' },
        ],
      },
    ],
  },
  {
    id: 'cs_office',
    name: "C's Office",
    icon: 'mdi-laptop',
    scenes: [
      'scene.office_on',
    ],
    sections: [
      {
        title: 'Lighting',
        entities: [
          { entity_id: 'light.c_s_office', name: 'Lights' },
          { entity_id: 'switch.office_desk_lamp', name: 'Desk Lamp' },
        ],
      },
    ],
  },
  {
    id: 'radio',
    name: 'Media',
    icon: 'mdi-radio',
    kind: 'media',
    scenes: [
      'input_boolean.party',
      'input_boolean.bed_time',
    ],
    sections: [
      {
        title: 'Media Players',
        entities: [
          { entity_id: 'media_player.living_room_tv_cast', name: 'Living Room TV' },
          { entity_id: 'media_player.mb_tv_cast', name: 'Bedroom TV' },
        ],
      },
    ],
  },
  {
    id: 'vacuum',
    name: 'Vacuum',
    icon: 'mdi-robot-vacuum',
    sections: [
      {
        title: 'Robot',
        entities: [
          { entity_id: 'vacuum.x40_ultra', name: 'X40 Ultra' },
          { entity_id: 'select.x40_ultra_cleaning_mode', name: 'Cleaning Mode' },
        ],
      },
    ],
  },
  {
    id: 'servers',
    name: 'Servers',
    icon: 'mdi-server-network',
    kind: 'sensors',
    sections: [
      {
        title: 'Temperatures',
        entities: [
          { entity_id: 'sensor.udm_se_udm_se_cpu_temperature', name: 'UDM SE' },
          { entity_id: 'sensor.unvr_cpu_temperature', name: 'UNVR' },
          { entity_id: 'sensor.usw_pro_max_16_poe_temperature', name: 'Switch' },
        ],
      },
      {
        title: 'Utilization',
        entities: [
          { entity_id: 'sensor.udm_se_cpu_utilization_2', name: 'UDM CPU' },
          { entity_id: 'sensor.unvr_cpu_utilization', name: 'UNVR CPU' },
          { entity_id: 'sensor.usw_pro_max_16_poe_cpu_utilization', name: 'Switch CPU' },
          { entity_id: 'sensor.udm_se_memory_utilization_2', name: 'UDM Mem' },
          { entity_id: 'sensor.unvr_memory_utilization', name: 'UNVR Mem' },
          { entity_id: 'sensor.usw_pro_max_16_poe_memory_utilization', name: 'Switch Mem' },
        ],
      },
      {
        title: 'Storage & Power',
        entities: [
          { entity_id: 'sensor.unvr_storage_utilization', name: 'NVR Storage' },
          { entity_id: 'sensor.unvr_recording_capacity_days', name: 'Rec. Days' },
          { entity_id: 'sensor.tower_array_used_space', name: 'Unraid Used' },
          { entity_id: 'sensor.ups_battery_runtime', name: 'UPS Runtime' },
          { entity_id: 'sensor.piups_battery_runtime_2', name: 'Pi UPS' },
        ],
      },
      {
        title: 'Network',
        entities: [
          { entity_id: 'sensor.udm_se_cloudflare_wan_latency', name: 'Cloudflare' },
          { entity_id: 'sensor.udm_se_google_wan_latency', name: 'Google' },
        ],
      },
    ],
  },
  {
    id: 'cameras',
    name: 'Cameras',
    icon: 'mdi-cctv',
    kind: 'cameras',
    sections: [],
  },
];
