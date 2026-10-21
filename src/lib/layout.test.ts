import { describe, expect, it } from 'vitest';
import type { DashView } from '../types';
import { syncSections, viewRows, withRows } from './layout';

const legacyView: DashView = {
  id: 'main',
  name: 'Home',
  icon: 'mdi-home',
  sections: [{ title: 'Lights', entities: [{ entity_id: 'light.test' }] }],
};

describe('layout rows', () => {
  it('migrates legacy sections when rows are absent', () => {
    expect(viewRows(legacyView)).toEqual([
      { columns: [{ title: 'Lights', entities: [{ entity_id: 'light.test' }] }] },
    ]);
  });

  it('does not revive legacy sections when rows are explicitly empty', () => {
    expect(viewRows({ ...legacyView, rows: [] })).toEqual([]);
  });

  it('keeps the last row deleted through saving and reloading', () => {
    const loaded = withRows([legacyView]);
    loaded[0].rows!.splice(0, 1);
    const saved = syncSections(loaded);
    expect(saved[0].rows).toEqual([]);
    expect(saved[0].sections).toEqual([]);
    expect(withRows(JSON.parse(JSON.stringify(saved)))[0].rows).toEqual([]);
  });
});