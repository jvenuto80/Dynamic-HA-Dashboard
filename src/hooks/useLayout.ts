import { useCallback, useEffect, useRef, useState } from 'react';
import { views as defaultViews } from '../config';
import { withRows } from '../lib/layout';
import type { DashRow, DashView, GlanceButtonConfig, RoomEntity, TileSize } from '../types';

// Resolve the layout API relative to the app's base path so it works behind
// HA Ingress (served under /api/hassio_ingress/<token>/) as well as at root.
const ENDPOINT = `${import.meta.env.BASE_URL}layout`.replace(/\/\/+/g, '/');
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

  // ── Glance summary buttons ──
  const setGlance = useCallback(
    (viewId: string, glance: GlanceButtonConfig[]) => {
      mutateView(viewId, (v) => {
        v.glance = glance;
      });
    },
    [mutateView],
  );

  // ── Views (pages) ──
  /** Append a new empty tile page and return its id so callers can navigate to it. */
  const addView = useCallback((): string => {
    const id = `view-${Date.now().toString(36)}`;
    setViews((prev) => {
      const next = clone(prev);
      next.push({
        id,
        name: 'New Page',
        icon: 'mdi-view-dashboard-outline',
        sections: [],
        rows: [{ title: '', columns: [{ title: '', entities: [] }] }],
      });
      persist(next);
      return next;
    });
    return id;
  }, [persist]);

  /** Remove a page. The last remaining page is never removed. */
  const removeView = useCallback(
    (viewId: string) => {
      setViews((prev) => {
        if (prev.length <= 1) return prev;
        const next = clone(prev).filter((v) => v.id !== viewId);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const renameView = useCallback(
    (viewId: string, name: string) => {
      mutateView(viewId, (v) => {
        v.name = name;
      });
    },
    [mutateView],
  );

  const updateViewIcon = useCallback(
    (viewId: string, icon: string) => {
      mutateView(viewId, (v) => {
        v.icon = icon;
      });
    },
    [mutateView],
  );

  const moveView = useCallback(
    (fromIdx: number, toIdx: number) => {
      setViews((prev) => {
        if (toIdx < 0 || toIdx >= prev.length || fromIdx === toIdx) return prev;
        const next = clone(prev);
        const [v] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, v);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  /** Switch a page between a normal tile grid and the auto "Now Playing" media view. */
  const setViewKind = useCallback(
    (viewId: string, kind: DashView['kind']) => {
      mutateView(viewId, (v) => {
        if (kind === 'tiles') delete v.kind;
        else v.kind = kind;
      });
    },
    [mutateView],
  );

  /** Hide/show a specific media_player on a `kind: 'media'` page. */
  /** Hide/show media_player(s) on a `kind: 'media'` page. Pass all of a device's
   *  member entity_ids so the whole device toggles together. With `hidden`
   *  omitted it toggles based on the first id's current state. */
  const toggleMediaExclude = useCallback(
    (viewId: string, entityId: string | string[], hidden?: boolean) => {
      const ids = Array.isArray(entityId) ? entityId : [entityId];
      mutateView(viewId, (v) => {
        const set = new Set(v.mediaExclude ?? []);
        const makeHidden = hidden ?? !set.has(ids[0]);
        for (const id of ids) {
          if (makeHidden) set.add(id);
          else set.delete(id);
        }
        v.mediaExclude = [...set];
      });
    },
    [mutateView],
  );

  /** Toggle the Music Assistant search button on a `kind: 'media'` page. */
  const toggleMediaSearch = useCallback(
    (viewId: string) => {
      mutateView(viewId, (v) => {
        if (v.mediaHideSearch) delete v.mediaHideSearch;
        else v.mediaHideSearch = true;
      });
    },
    [mutateView],
  );

  /** Manually merge the given media_player entity_ids into one device, folding in
   *  any existing merge group that overlaps them. */
  const mergeMediaDevices = useCallback(
    (viewId: string, entityIds: string[]) => {
      mutateView(viewId, (v) => {
        const existing = v.mediaMerge ?? [];
        const union = new Set(entityIds);
        const rest: string[][] = [];
        for (const g of existing) {
          if (g.some((id) => union.has(id))) g.forEach((id) => union.add(id));
          else rest.push(g);
        }
        rest.push([...union]);
        v.mediaMerge = rest;
      });
    },
    [mutateView],
  );

  /** Split a manually-merged device back apart (remove merge groups overlapping
   *  any of the given entity_ids). */
  const unmergeMediaDevices = useCallback(
    (viewId: string, entityIds: string[]) => {
      mutateView(viewId, (v) => {
        if (!v.mediaMerge) return;
        const ids = new Set(entityIds);
        v.mediaMerge = v.mediaMerge.filter((g) => !g.some((id) => ids.has(id)));
        if (!v.mediaMerge.length) delete v.mediaMerge;
      });
    },
    [mutateView],
  );

  /** Set the media page tile width. */
  const setMediaTileSize = useCallback(
    (viewId: string, size: DashView['mediaTileSize']) => {
      mutateView(viewId, (v) => {
        if (!size || size === 'medium') delete v.mediaTileSize;
        else v.mediaTileSize = size;
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

  /** Replace the layout with a minimal, generic starter so a new user can build
   *  from a clean slate with no code: one empty Home page plus a zero-config
   *  Media page that auto-fills with whatever is playing. */
  const startBlank = useCallback(() => {
    const blank: DashView[] = [
      {
        id: 'main',
        name: 'Home',
        icon: 'mdi-home',
        sections: [],
        rows: [{ title: '', columns: [{ title: '', entities: [] }] }],
      },
      {
        id: 'media',
        name: 'Media',
        icon: 'mdi-speaker',
        kind: 'media',
        sections: [],
      },
    ];
    setViews(withRows(clone(blank)));
    persist(withRows(clone(blank)));
  }, [persist]);

  /** Serialize the current layout to a pretty JSON string (for export/download). */
  const exportLayout = useCallback(() => {
    // Strip the derived `rows` so the export matches the on-disk schema.
    const clean = views.map(({ rows: _rows, ...v }) => v);
    return JSON.stringify(clean, null, 2);
  }, [views]);

  /** Replace the entire layout from imported JSON (string or parsed array). */
  const importLayout = useCallback(
    (data: string | DashView[]) => {
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Layout must be a non-empty array of views.');
      }
      if (!parsed.every((v) => v && typeof v.id === 'string')) {
        throw new Error('Each view needs a string "id".');
      }
      const next = withRows(parsed as DashView[]);
      setViews(next);
      persist(next);
    },
    [persist],
  );

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
    setGlance,
    addView,
    removeView,
    renameView,
    updateViewIcon,
    moveView,
    setViewKind,
    toggleMediaExclude,
    toggleMediaSearch,
    mergeMediaDevices,
    unmergeMediaDevices,
    setMediaTileSize,
    resetLayout,
    startBlank,
    exportLayout,
    importLayout,
  };
}
