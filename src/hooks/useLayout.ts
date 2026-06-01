import { useCallback, useEffect, useRef, useState } from 'react';
import { views as defaultViews } from '../config';
import { withRows } from '../lib/layout';
import type { DashRow, DashView, RoomEntity, TileSize } from '../types';

const ENDPOINT = '/layout';
const SIZE_CYCLE: TileSize[] = ['1x1', '2x1', '1x2', '2x2'];

function clone<T>(v: T): T {
  return typeof structuredClone === 'function'
    ? structuredClone(v)
    : JSON.parse(JSON.stringify(v));
}

export function useLayout() {
  const [views, setViews] = useState<DashView[]>(() => withRows(clone(defaultViews)));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved layout (falls back to defaults on 204/error).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ENDPOINT);
        if (res.ok && res.status !== 204) {
          const data = (await res.json()) as DashView[];
          if (!cancelled && Array.isArray(data) && data.length) {
            setViews(withRows(data));
          }
        }
      } catch {
        /* keep defaults */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: DashView[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next),
        });
      } catch {
        /* ignore */
      } finally {
        setSaving(false);
      }
    }, 500);
  }, []);

  /** Apply a mutation to one view, update state, and queue a save. */
  const mutateView = useCallback(
    (viewId: string, fn: (view: DashView) => void) => {
      setViews((prev) => {
        const next = clone(prev);
        const v = next.find((x) => x.id === viewId);
        if (v) {
          if (!v.rows) v.rows = [];
          fn(v);
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  // ── Bulk (used by drag-and-drop to commit a whole reorder) ──
  const setRows = useCallback(
    (viewId: string, rows: DashRow[]) => {
      mutateView(viewId, (v) => {
        v.rows = rows;
      });
    },
    [mutateView],
  );

  // ── Rows ──
  const addRow = useCallback(
    (viewId: string) => {
      mutateView(viewId, (v) => {
        v.rows!.push({ title: 'New Row', columns: [{ title: 'Column', entities: [] }] });
      });
    },
    [mutateView],
  );

  const removeRow = useCallback(
    (viewId: string, rowIdx: number) => {
      mutateView(viewId, (v) => {
        v.rows!.splice(rowIdx, 1);
      });
    },
    [mutateView],
  );

  const renameRow = useCallback(
    (viewId: string, rowIdx: number, title: string) => {
      mutateView(viewId, (v) => {
        if (v.rows![rowIdx]) v.rows![rowIdx].title = title;
      });
    },
    [mutateView],
  );

  const moveRow = useCallback(
    (viewId: string, fromIdx: number, toIdx: number) => {
      mutateView(viewId, (v) => {
        const [r] = v.rows!.splice(fromIdx, 1);
        if (r) v.rows!.splice(toIdx, 0, r);
      });
    },
    [mutateView],
  );

  // ── Columns ──
  const addColumn = useCallback(
    (viewId: string, rowIdx: number) => {
      mutateView(viewId, (v) => {
        v.rows![rowIdx]?.columns.push({ title: 'Column', entities: [] });
      });
    },
    [mutateView],
  );

  const removeColumn = useCallback(
    (viewId: string, rowIdx: number, colIdx: number) => {
      mutateView(viewId, (v) => {
        v.rows![rowIdx]?.columns.splice(colIdx, 1);
      });
    },
    [mutateView],
  );

  const renameColumn = useCallback(
    (viewId: string, rowIdx: number, colIdx: number, title: string) => {
      mutateView(viewId, (v) => {
        const col = v.rows![rowIdx]?.columns[colIdx];
        if (col) col.title = title;
      });
    },
    [mutateView],
  );

  // ── Tiles ──
  const cycleTileSize = useCallback(
    (viewId: string, rowIdx: number, colIdx: number, entIdx: number) => {
      mutateView(viewId, (v) => {
        const e = v.rows![rowIdx]?.columns[colIdx]?.entities[entIdx];
        if (!e) return;
        const cur = e.size ?? '1x1';
        const i = SIZE_CYCLE.indexOf(cur);
        e.size = SIZE_CYCLE[(i + 1) % SIZE_CYCLE.length];
      });
    },
    [mutateView],
  );

  const removeTile = useCallback(
    (viewId: string, rowIdx: number, colIdx: number, entIdx: number) => {
      mutateView(viewId, (v) => {
        v.rows![rowIdx]?.columns[colIdx]?.entities.splice(entIdx, 1);
      });
    },
    [mutateView],
  );

  const addTile = useCallback(
    (viewId: string, rowIdx: number, colIdx: number, entity: RoomEntity) => {
      mutateView(viewId, (v) => {
        v.rows![rowIdx]?.columns[colIdx]?.entities.push(entity);
      });
    },
    [mutateView],
  );

  /** Patch an existing tile's fields (name, icon, size, camera, links, actions…). */
  const updateTile = useCallback(
    (viewId: string, rowIdx: number, colIdx: number, entIdx: number, patch: Partial<RoomEntity>) => {
      mutateView(viewId, (v) => {
        const e = v.rows![rowIdx]?.columns[colIdx]?.entities[entIdx];
        if (e) Object.assign(e, patch);
      });
    },
    [mutateView],
  );

  // ── Scenes (per-view list of scene entity_ids shown in the Scenes card) ──
  const addScene = useCallback(
    (viewId: string, entityId: string) => {
      mutateView(viewId, (v) => {
        if (!v.scenes) v.scenes = [];
        if (!v.scenes.includes(entityId)) v.scenes.push(entityId);
      });
    },
    [mutateView],
  );

  const removeScene = useCallback(
    (viewId: string, entityId: string) => {
      mutateView(viewId, (v) => {
        if (v.scenes) v.scenes = v.scenes.filter((s) => s !== entityId);
      });
    },
    [mutateView],
  );

  const moveScene = useCallback(
    (viewId: string, fromIdx: number, toIdx: number) => {
      mutateView(viewId, (v) => {
        if (!v.scenes) return;
        const [s] = v.scenes.splice(fromIdx, 1);
        v.scenes.splice(toIdx, 0, s);
      });
    },
    [mutateView],
  );

  const resetLayout = useCallback(() => {
    setViews(withRows(clone(defaultViews)));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    fetch(ENDPOINT, { method: 'DELETE' }).finally(() => setSaving(false));
  }, []);

  return {
    views,
    loaded,
    saving,
    setRows,
    addRow,
    removeRow,
    renameRow,
    moveRow,
    addColumn,
    removeColumn,
    renameColumn,
    cycleTileSize,
    removeTile,
    addTile,
    updateTile,
    addScene,
    removeScene,
    moveScene,
    resetLayout,
  };
}
