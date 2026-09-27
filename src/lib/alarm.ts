import type { HassEntity } from 'home-assistant-js-websocket';

/** Arming actions, in display order. `feature` is HA's AlarmControlPanelEntityFeature bit. */
export const ALARM_MODES = [
  { mode: 'arm_home', feature: 1, state: 'armed_home', icon: 'mdi-shield-home' },
  { mode: 'arm_away', feature: 2, state: 'armed_away', icon: 'mdi-shield-lock' },
  { mode: 'arm_night', feature: 4, state: 'armed_night', icon: 'mdi-shield-moon' },
  { mode: 'arm_vacation', feature: 32, state: 'armed_vacation', icon: 'mdi-shield-airplane' },
  { mode: 'arm_custom_bypass', feature: 16, state: 'armed_custom_bypass', icon: 'mdi-security' },
] as const;

export type AlarmMode = (typeof ALARM_MODES)[number]['mode'];

const TRIGGER_FEATURE = 8;

export type AlarmTone = 'disarmed' | 'armed' | 'transition' | 'triggered' | 'unknown';

export function alarmTone(state: string): AlarmTone {
  if (state === 'disarmed') return 'disarmed';
  if (state === 'triggered') return 'triggered';
  if (state === 'arming' || state === 'pending' || state === 'disarming') return 'transition';
  if (state.startsWith('armed_')) return 'armed';
  return 'unknown';
}

export function alarmIcon(state: string): string {
  const mode = ALARM_MODES.find((m) => m.state === state);
  if (mode) return mode.icon;
  switch (alarmTone(state)) {
    case 'disarmed':
      return 'mdi-shield-off-outline';
    case 'triggered':
      return 'mdi-bell-ring';
    case 'transition':
      return 'mdi-shield-sync';
    default:
      return 'mdi-shield-alert-outline';
  }
}

/** Arming actions this panel supports (from `supported_features`). */
export function supportedAlarmModes(entity: HassEntity): (typeof ALARM_MODES)[number][] {
  const features = Number(entity.attributes.supported_features ?? 0);
  return ALARM_MODES.filter((m) => (features & m.feature) !== 0);
}

export function alarmSupportsTrigger(entity: HassEntity): boolean {
  return (Number(entity.attributes.supported_features ?? 0) & TRIGGER_FEATURE) !== 0;
}

/** 'number' → keypad, 'text' → text field, null → no code. */
export function alarmCodeFormat(entity: HassEntity): 'number' | 'text' | null {
  const f = entity.attributes.code_format;
  return f === 'number' || f === 'text' ? f : null;
}

/** Whether a code must be sent for this action. Disarm always needs one when the panel has a code. */
export function alarmNeedsCode(entity: HassEntity, action: AlarmMode | 'disarm' | 'trigger'): boolean {
  if (!alarmCodeFormat(entity)) return false;
  if (action === 'disarm') return true;
  // HA defaults code_arm_required to true when the attribute is absent.
  return entity.attributes.code_arm_required !== false;
}

/** i18n key for a panel state (`alarm_state_<state>`), falling back to unknown. */
export function alarmStateKey(state: string): string {
  const known = [
    'disarmed', 'armed_home', 'armed_away', 'armed_night', 'armed_vacation',
    'armed_custom_bypass', 'arming', 'pending', 'disarming', 'triggered',
  ];
  return known.includes(state) ? `alarm_state_${state}` : 'alarm_state_unknown';
}
