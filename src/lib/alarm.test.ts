import { describe, it, expect } from 'vitest';
import type { HassEntity } from 'home-assistant-js-websocket';
import {
  alarmCodeFormat,
  alarmIcon,
  alarmNeedsCode,
  alarmStateKey,
  alarmSupportsTrigger,
  alarmTone,
  supportedAlarmModes,
} from './alarm';

const panel = (state: string, attributes: Record<string, unknown> = {}): HassEntity =>
  ({ entity_id: 'alarm_control_panel.home', state, attributes } as unknown as HassEntity);

describe('alarm panel helpers', () => {
  it('maps supported_features to arming modes (Alarmo = 15, UNVR = 2)', () => {
    expect(supportedAlarmModes(panel('disarmed', { supported_features: 15 })).map((m) => m.mode)).toEqual([
      'arm_home',
      'arm_away',
      'arm_night',
    ]);
    expect(alarmSupportsTrigger(panel('disarmed', { supported_features: 15 }))).toBe(true);
    expect(supportedAlarmModes(panel('disarmed', { supported_features: 2 })).map((m) => m.mode)).toEqual(['arm_away']);
    expect(alarmSupportsTrigger(panel('disarmed', { supported_features: 2 }))).toBe(false);
    expect(supportedAlarmModes(panel('disarmed', { supported_features: 48 })).map((m) => m.mode)).toEqual([
      'arm_vacation',
      'arm_custom_bypass',
    ]);
  });

  it('classifies states into tones', () => {
    expect(alarmTone('disarmed')).toBe('disarmed');
    expect(alarmTone('armed_night')).toBe('armed');
    expect(alarmTone('arming')).toBe('transition');
    expect(alarmTone('pending')).toBe('transition');
    expect(alarmTone('triggered')).toBe('triggered');
    expect(alarmTone('unavailable')).toBe('unknown');
  });

  it('picks icons and i18n keys per state', () => {
    expect(alarmIcon('armed_away')).toBe('mdi-shield-lock');
    expect(alarmIcon('disarmed')).toBe('mdi-shield-off-outline');
    expect(alarmIcon('triggered')).toBe('mdi-bell-ring');
    expect(alarmStateKey('armed_home')).toBe('alarm_state_armed_home');
    expect(alarmStateKey('unavailable')).toBe('alarm_state_unknown');
  });

  it('requires a code only when the panel has one', () => {
    const noCode = panel('disarmed', { code_format: null, code_arm_required: false });
    expect(alarmCodeFormat(noCode)).toBeNull();
    expect(alarmNeedsCode(noCode, 'disarm')).toBe(false);
    expect(alarmNeedsCode(noCode, 'arm_away')).toBe(false);

    const keypad = panel('armed_away', { code_format: 'number', code_arm_required: false });
    expect(alarmCodeFormat(keypad)).toBe('number');
    expect(alarmNeedsCode(keypad, 'disarm')).toBe(true);
    expect(alarmNeedsCode(keypad, 'arm_home')).toBe(false);

    // HA's default for code_arm_required is true.
    const defaultArm = panel('disarmed', { code_format: 'text' });
    expect(alarmNeedsCode(defaultArm, 'arm_home')).toBe(true);
  });
});
