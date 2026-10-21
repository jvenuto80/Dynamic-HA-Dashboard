import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (callback: () => unknown) => callback(),
  useEffect: () => {},
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (update: unknown) => {
      hooks.values[index] = typeof update === 'function' ? update(hooks.values[index]) : update;
    }];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
}));
vi.mock('../config', () => ({
  views: [{ id: 'main', name: 'Home', sections: [], rows: [] }],
}));
vi.mock('../settings', () => ({
  getExportableSettings: vi.fn(), applyImportedSettings: vi.fn(),
}));

import { useLayout } from './useLayout';

function renderHook() {
  hooks.cursor = 0;
  return useLayout();
}

describe('layout persistence', () => {
  beforeEach(() => {
    hooks.values = [];
    hooks.cursor = 0;
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each([403, 503])('reports HTTP %s failures and retries the pending layout', async (status) => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status }));
    renderHook().renameView('main', 'Changed');
    await vi.advanceTimersByTimeAsync(500);
    const failed = renderHook();
    expect(failed.saving).toBe(false);
    expect(failed.saveError).toContain(String(status));
    expect(failed.views[0].name).toBe('Changed');
    failed.retrySave();
    expect(renderHook().saving).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][1]?.body).toBe(vi.mocked(fetch).mock.calls[0][1]?.body);
    expect(renderHook().saveError).toBeNull();
    expect(renderHook().saving).toBe(false);
  });

  it('reports network failures', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Network unavailable'));
    renderHook().renameView('main', 'Changed');
    await vi.advanceTimersByTimeAsync(500);
    expect(renderHook().saveError).toBe('Network unavailable');
    expect(renderHook().saving).toBe(false);
  });

  it('reports and retries a failed reset as DELETE', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    renderHook().resetLayout();
    await vi.advanceTimersByTimeAsync(500);
    expect(renderHook().saveError).toContain('503');
    renderHook().retrySave();
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.mocked(fetch).mock.calls.map((call) => call[1]?.method)).toEqual(['DELETE', 'DELETE']);
    expect(renderHook().saveError).toBeNull();
  });

  it('does not let an older failure finish a newer pending save', async () => {
    let rejectOld!: (error: Error) => void;
    vi.mocked(fetch).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectOld = reject; }));
    renderHook().renameView('main', 'First');
    await vi.advanceTimersByTimeAsync(500);
    renderHook().renameView('main', 'Latest');
    rejectOld(new Error('Old save failed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(renderHook().saving).toBe(true);
    expect(renderHook().saveError).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    expect(renderHook().saving).toBe(false);
    expect(renderHook().saveError).toBeNull();
    expect(renderHook().views[0].name).toBe('Latest');
  });
});