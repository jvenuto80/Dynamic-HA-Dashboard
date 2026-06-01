import { useEffect, useMemo, useState } from 'react';
import type { HassEntities } from 'home-assistant-js-websocket';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DashView, DashRow, RoomEntity } from '../types';
import { DeviceTile } from './DeviceTile';
import { CameraGrid } from './CameraGrid';
import { effectiveSize, sizeToSpan } from '../lib/tileSize';
import { viewRows } from '../lib/layout';
import { HA_URL } from '../config';
import { TileSettings } from './TileSettings';

type CallHA = (domain: string, service: string, data?: Record<string, unknown>, target?: { entity_id: string | string[] }) => Promise<void>;

/** Build a camera proxy URL for a tile's optional embedded thumbnail. */
function tileCameraUrl(entities: HassEntities, cameraId?: string): string | undefined {
  if (!cameraId) return undefined;
  const cam = entities[cameraId];
  if (!cam || cam.state === 'unavailable') return undefined;
  // Prefer entity_picture (HA-signed path that's always valid); fall back to access_token.
  const pic = cam.attributes.entity_picture as string | undefined;
  if (pic) return pic.startsWith('http') ? pic : `${HA_URL}${pic}`;
  const token = cam.attributes.access_token as string | undefined;
  if (!token) return undefined;
  return `${HA_URL}/api/camera_proxy/${cameraId}?token=${token}`;
}

export interface LayoutActions {
  setRows: (viewId: string, rows: DashRow[]) => void;
  addRow: (viewId: string) => void;
  removeRow: (viewId: string, rowIdx: number) => void;
  renameRow: (viewId: string, rowIdx: number, title: string) => void;
  moveRow: (viewId: string, fromIdx: number, toIdx: number) => void;
  addColumn: (viewId: string, rowIdx: number) => void;
  removeColumn: (viewId: string, rowIdx: number, colIdx: number) => void;
  renameColumn: (viewId: string, rowIdx: number, colIdx: number, title: string) => void;
  cycleTileSize: (viewId: string, rowIdx: number, colIdx: number, entIdx: number) => void;
  removeTile: (viewId: string, rowIdx: number, colIdx: number, entIdx: number) => void;
  addTile: (viewId: string, rowIdx: number, colIdx: number, entity: RoomEntity) => void;
  updateTile: (viewId: string, rowIdx: number, colIdx: number, entIdx: number, patch: Partial<RoomEntity>) => void;
}

interface Props {
  view: DashView;
  entities: HassEntities;
  onToggle: (entityId: string) => void;
  onOpenDetail: (entityId: string) => void;
  callHA: CallHA;
  getHistory?: (entityId: string, hours?: number) => Promise<number[]>;
  editing: boolean;
  layout: LayoutActions;
}

export function DashboardView(props: Props) {
  const { view, entities, editing } = props;

  if (view.kind === 'cameras') {
    return (
      <div className="view-rows">
        <section className="view-row">
          {editing ? (
            <div className="edit-empty">Camera view layout isn’t editable.</div>
          ) : (
            <CameraGrid entities={entities} />
          )}
        </section>
      </div>
    );
  }

  if (editing) {
    return <EditableView {...props} />;
  }

  const rows = viewRows(view);
  // Running index across all tiles so each gets a slightly later entrance,
  // producing a gentle cascade when the view mounts/switches.
  let tileIndex = 0;
  return (
    <div className="view-rows" key={view.id}>
      {rows.map((row, ri) => (
        <section className="view-row" key={ri}>
          {row.title && <h2 className="row-title">{row.title}</h2>}
          <div className={`row-columns ${row.columns.length > 1 ? 'multi' : ''}`}>
            {row.columns.map((col, ci) => (
              <div className="row-column" key={ci}>
                {col.title && <h3 className="column-title">{col.title}</h3>}
                <div className="tile-grid">
                  {col.entities
                    .filter((e) => entities[e.entity_id])
                    .map((re) => (
                      <Tile key={re.entity_id} re={re} enterIndex={tileIndex++} {...props} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** A single read-only tile, sized from its effective size. */
function Tile({
  re,
  entities,
  onToggle,
  onOpenDetail,
  callHA,
  getHistory,
  view,
  enterIndex,
}: { re: RoomEntity; enterIndex?: number } & Props) {
  const entity = entities[re.entity_id];
  if (!entity) return null;
  const name = re.name || (entity.attributes.friendly_name as string);
  const domain = re.entity_id.split('.')[0];
  const { span, tall } = sizeToSpan(effectiveSize(re, entity));
  return (
    <DeviceTile
      entity={entity}
      name={name}
      callHA={callHA}
      onToggle={onToggle}
      onOpenDetail={onOpenDetail}
      span={span}
      tall={tall}
      graph={view.kind === 'sensors' && domain === 'sensor'}
      getHistory={getHistory}
      cameraUrl={tileCameraUrl(entities, re.camera)}
      slideDim={re.slideDim}
      reverseSlider={re.reverseSlider}
      mediaArtwork={re.mediaArtwork}
      artworkEntity={re.artworkEntity}
      entities={entities}
      enterIndex={enterIndex}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Editable view: a stack of named rows, each divided into named columns.
// Drag tiles within/between any column (across rows too); manage rows, columns,
// and tiles. Local state mirrors the saved layout and commits on drop.
// ──────────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  re: RoomEntity;
}
interface ColState {
  title?: string;
  items: Item[];
}
interface RowState {
  title?: string;
  columns: ColState[];
}

function buildRows(rows: DashRow[]): RowState[] {
  return rows.map((row, ri) => ({
    title: row.title,
    columns: row.columns.map((col, ci) => ({
      title: col.title,
      items: col.entities.map((re, ei) => ({ id: `r${ri}-c${ci}-i${ei}-${re.entity_id}`, re })),
    })),
  }));
}

const colKey = (ri: number, ci: number) => `col-r${ri}-c${ci}`;

/** Locate the [rowIdx, colIdx] of a draggable item or a column droppable. */
function locate(rows: RowState[], id: string): [number, number] | null {
  const m = /^col-r(\d+)-c(\d+)$/.exec(id);
  if (m) return [Number(m[1]), Number(m[2])];
  for (let ri = 0; ri < rows.length; ri++) {
    for (let ci = 0; ci < rows[ri].columns.length; ci++) {
      if (rows[ri].columns[ci].items.some((it) => it.id === id)) return [ri, ci];
    }
  }
  return null;
}

function EditableView(props: Props) {
  const { view, entities, layout } = props;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rows, setRows] = useState<RowState[]>(() => buildRows(viewRows(view)));
  const [picker, setPicker] = useState<{ ri: number; ci: number } | null>(null);
  const [settings, setSettings] = useState<{ ri: number; ci: number; ei: number } | null>(null);

  // Re-sync from saved layout whenever it changes and we're not mid-drag.
  useEffect(() => {
    if (!activeId) setRows(buildRows(viewRows(view)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, activeId]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const activeItem = useMemo(() => {
    for (const r of rows) for (const c of r.columns) {
      const it = c.items.find((x) => x.id === activeId);
      if (it) return it;
    }
    return null;
  }, [activeId, rows]);

  const commit = (next: RowState[]) => {
    const dashRows: DashRow[] = next.map((r) => ({
      title: r.title,
      columns: r.columns.map((c) => ({ title: c.title, entities: c.items.map((it) => it.re) })),
    }));
    layout.setRows(view.id, dashRows);
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragOver = (e: DragOverEvent) => {
    const { active, over } = e;
    if (!over) return;
    const from = locate(rows, String(active.id));
    const to = locate(rows, String(over.id));
    if (!from || !to) return;
    const [fr, fc] = from;
    const [tr, tc] = to;
    if (fr === tr && fc === tc) return;

    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, columns: r.columns.map((c) => ({ ...c, items: [...c.items] })) }));
      const fromItems = next[fr].columns[fc].items;
      const toItems = next[tr].columns[tc].items;
      const fromIdx = fromItems.findIndex((it) => it.id === active.id);
      if (fromIdx === -1) return prev;
      const [moved] = fromItems.splice(fromIdx, 1);
      const overIdx = toItems.findIndex((it) => it.id === over.id);
      toItems.splice(overIdx === -1 ? toItems.length : overIdx, 0, moved);
      return next;
    });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    if (!over) {
      commit(rows);
      return;
    }
    const from = locate(rows, String(active.id));
    const to = locate(rows, String(over.id));
    let next = rows;
    if (from && to && from[0] === to[0] && from[1] === to[1]) {
      const [ri, ci] = from;
      const items = rows[ri].columns[ci].items;
      const oldIdx = items.findIndex((it) => it.id === active.id);
      const newIdx = items.findIndex((it) => it.id === over.id);
      if (oldIdx !== newIdx && newIdx !== -1) {
        next = rows.map((r, i) =>
          i === ri
            ? {
                ...r,
                columns: r.columns.map((c, j) =>
                  j === ci ? { ...c, items: arrayMove(c.items, oldIdx, newIdx) } : c,
                ),
              }
            : r,
        );
        setRows(next);
      }
    }
    commit(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
    >
      <div className="view-rows editing">
        {rows.map((row, ri) => (
          <section className="edit-row" key={ri}>
            <div className="edit-row-head">
              <span className="mdi mdi-table-row edit-row-icon" />
              <input
                className="row-title-input"
                value={row.title ?? ''}
                placeholder="Row name"
                onChange={(ev) => layout.renameRow(view.id, ri, ev.target.value)}
              />
              <div className="edit-row-tools">
                <button
                  className="edit-icon-btn"
                  title="Move row up"
                  disabled={ri === 0}
                  onClick={() => layout.moveRow(view.id, ri, ri - 1)}
                >
                  <span className="mdi mdi-arrow-up" />
                </button>
                <button
                  className="edit-icon-btn"
                  title="Move row down"
                  disabled={ri === rows.length - 1}
                  onClick={() => layout.moveRow(view.id, ri, ri + 1)}
                >
                  <span className="mdi mdi-arrow-down" />
                </button>
                <button
                  className="edit-icon-btn"
                  title="Add column"
                  onClick={() => layout.addColumn(view.id, ri)}
                >
                  <span className="mdi mdi-table-column-plus-after" />
                </button>
                <button
                  className="edit-icon-btn danger"
                  title="Delete row"
                  onClick={() => {
                    const n = row.columns.reduce((s, c) => s + c.items.length, 0);
                    if (window.confirm(`Delete this row${n ? ` and its ${n} tile${n === 1 ? '' : 's'}` : ''}?`)) {
                      layout.removeRow(view.id, ri);
                    }
                  }}
                >
                  <span className="mdi mdi-delete" />
                </button>
              </div>
            </div>

            <div
              className="edit-row-columns"
              style={{ gridTemplateColumns: `repeat(${row.columns.length}, minmax(220px, 1fr))` }}
            >
              {row.columns.map((col, ci) => (
                <div className="edit-column" key={ci}>
                  <div className="edit-column-head">
                    <input
                      className="column-title-input"
                      value={col.title ?? ''}
                      placeholder="Column name"
                      onChange={(ev) => layout.renameColumn(view.id, ri, ci, ev.target.value)}
                    />
                    <button
                      className="edit-icon-btn danger"
                      title="Delete column"
                      disabled={row.columns.length === 1}
                      onClick={() => {
                        const n = col.items.length;
                        if (window.confirm(`Delete this column${n ? ` and its ${n} tile${n === 1 ? '' : 's'}` : ''}?`)) {
                          layout.removeColumn(view.id, ri, ci);
                        }
                      }}
                    >
                      <span className="mdi mdi-close" />
                    </button>
                  </div>
                  <SortableContext items={col.items.map((it) => it.id)} strategy={rectSortingStrategy}>
                    <ColumnDroppable id={colKey(ri, ci)}>
                      {col.items.map((it, entIdx) => (
                        <SortableTile
                          key={it.id}
                          item={it}
                          rowIdx={ri}
                          colIdx={ci}
                          entIdx={entIdx}
                          onOpenSettings={() => setSettings({ ri, ci, ei: entIdx })}
                          {...props}
                        />
                      ))}
                      {col.items.length === 0 && <div className="edit-empty">Drag tiles here</div>}
                    </ColumnDroppable>
                  </SortableContext>
                  <button className="add-tile-btn" onClick={() => setPicker({ ri, ci })}>
                    <span className="mdi mdi-plus" /> Add Tile
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}

        <button className="add-section-btn" onClick={() => layout.addRow(view.id)}>
          <span className="mdi mdi-plus" /> Add Row
        </button>
      </div>

      <DragOverlay>
        {activeItem
          ? (() => {
              const e = entities[activeItem.re.entity_id];
              if (!e) return null;
              const nm =
                activeItem.re.name || (e.attributes.friendly_name as string) || activeItem.re.entity_id;
              const dm = activeItem.re.entity_id.split('.')[0];
              return (
                <div className="edit-drag-overlay">
                  <DeviceTile
                    entity={e}
                    name={nm}
                    callHA={props.callHA}
                    onToggle={() => {}}
                    onOpenDetail={() => {}}
                    graph={view.kind === 'sensors' && dm === 'sensor'}
                    getHistory={props.getHistory}
                  />
                </div>
              );
            })()
          : null}
      </DragOverlay>

      {picker && (
        <EntityPicker
          entities={entities}
          existing={
            new Set(
              rows.flatMap((r) => r.columns.flatMap((c) => c.items.map((it) => it.re.entity_id))),
            )
          }
          onClose={() => setPicker(null)}
          onPick={(entityId) => {
            layout.addTile(view.id, picker.ri, picker.ci, { entity_id: entityId });
            setPicker(null);
          }}
        />
      )}

      {settings && (() => {
        const re = rows[settings.ri]?.columns[settings.ci]?.items[settings.ei]?.re;
        if (!re) return null;
        return (
          <TileSettings
            re={re}
            entities={entities}
            onChange={(patch) =>
              layout.updateTile(view.id, settings.ri, settings.ci, settings.ei, patch)
            }
            onRemove={() => layout.removeTile(view.id, settings.ri, settings.ci, settings.ei)}
            onClose={() => setSettings(null)}
            callHA={props.callHA}
            getHistory={props.getHistory}
          />
        );
      })()}
    </DndContext>
  );
}

function ColumnDroppable({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useSortable({ id });
  return (
    <div className="tile-grid" ref={setNodeRef} data-col={id}>
      {children}
    </div>
  );
}

function SortableTile({
  item,
  rowIdx,
  colIdx,
  entIdx,
  entities,
  layout,
  view,
  callHA,
  getHistory,
  onOpenSettings,
}: { item: Item; rowIdx: number; colIdx: number; entIdx: number; onOpenSettings: () => void } & Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const [confirmDel, setConfirmDel] = useState(false);
  // Auto-cancel the delete confirmation after a few seconds if not acted on.
  useEffect(() => {
    if (!confirmDel) return;
    const t = setTimeout(() => setConfirmDel(false), 4000);
    return () => clearTimeout(t);
  }, [confirmDel]);
  const entity = entities[item.re.entity_id];
  // In edit mode every tile occupies a single uniform grid cell so the
  // sortable math stays smooth and tiles never overlap while dragging.
  // The chosen size is still shown/edited via the resize control below.
  const size = effectiveSize(item.re, entity);
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? 'transform 180ms ease',
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 5 : undefined,
  };

  const name = entity
    ? item.re.name || (entity.attributes.friendly_name as string)
    : item.re.entity_id;
  const domain = item.re.entity_id.split('.')[0];
  const missing = !entity;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`edit-tile-wrap ${missing ? 'missing' : ''}`}
      {...attributes}
      {...listeners}
    >
      {missing ? (
        <div className="tile edit-missing-tile">
          <span className="mdi mdi-help-circle-outline tile-icon" />
          <div className="tile-info">
            <div className="tile-name">{name}</div>
            <div className="tile-sub">Unavailable</div>
          </div>
        </div>
      ) : (
        <DeviceTile
          entity={entity}
          name={name}
          callHA={callHA}
          onToggle={onOpenSettings}
          onOpenDetail={onOpenSettings}
          graph={view.kind === 'sensors' && domain === 'sensor'}
          getHistory={getHistory}
        />
      )}
      <div className="edit-tile-tools" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className="edit-icon-btn"
          title="Edit tile settings"
          onClick={onOpenSettings}
        >
          <span className="mdi mdi-cog" />
        </button>
        <button
          className="edit-icon-btn size-btn"
          title={`Size: ${size} — click to resize`}
          onClick={() => layout.cycleTileSize(view.id, rowIdx, colIdx, entIdx)}
        >
          {size}
        </button>
        {confirmDel ? (
          <button
            className="edit-icon-btn danger confirm-del"
            title="Click again to delete this tile"
            onClick={() => layout.removeTile(view.id, rowIdx, colIdx, entIdx)}
          >
            <span className="mdi mdi-check" /> Delete?
          </button>
        ) : (
          <button
            className="edit-icon-btn danger"
            title="Remove tile"
            onClick={() => setConfirmDel(true)}
          >
            <span className="mdi mdi-close" />
          </button>
        )}
      </div>
      <span className="edit-drag-hint mdi mdi-drag" />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Entity picker modal: searchable list of entities not already on the board.
// ──────────────────────────────────────────────────────────────────────────

const PICKER_DOMAINS = [
  'light', 'switch', 'fan', 'cover', 'lock', 'climate', 'media_player',
  'input_boolean', 'scene', 'script', 'button', 'sensor', 'binary_sensor',
  'vacuum', 'select', 'number',
];

export function EntityPicker({
  entities,
  existing,
  onClose,
  onPick,
  domainFilter,
  title,
}: {
  entities: HassEntities;
  existing: Set<string>;
  onClose: () => void;
  onPick: (entityId: string) => void;
  domainFilter?: string[];
  title?: string;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const allowed = domainFilter ?? PICKER_DOMAINS;
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(entities)
      .filter((e) => {
        const domain = e.entity_id.split('.')[0];
        if (!allowed.includes(domain)) return false;
        if (existing.has(e.entity_id)) return false;
        if (!q) return true;
        const name = String(e.attributes.friendly_name ?? '').toLowerCase();
        return name.includes(q) || e.entity_id.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const an = String(a.attributes.friendly_name ?? a.entity_id);
        const bn = String(b.attributes.friendly_name ?? b.entity_id);
        return an.localeCompare(bn);
      })
      .slice(0, 200);
  }, [entities, existing, query, allowed]);

  return (
    <div className="picker-overlay" onClick={onClose}>
      <div className="picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <span className="mdi mdi-magnify" />
          <input
            autoFocus
            className="picker-search"
            placeholder={title ?? 'Search entities…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="edit-icon-btn" title="Close" onClick={onClose}>
            <span className="mdi mdi-close" />
          </button>
        </div>
        <div className="picker-list">
          {results.length === 0 && <div className="picker-empty">No matching entities.</div>}
          {results.map((e) => {
            const name = String(e.attributes.friendly_name ?? e.entity_id);
            return (
              <button key={e.entity_id} className="picker-item" onClick={() => onPick(e.entity_id)}>
                <span className="picker-item-name">{name}</span>
                <span className="picker-item-id">{e.entity_id}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

