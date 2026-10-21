import type { DashRow, DashSection, DashView } from '../types';

/** Normalize a view to its row/column model.
 *  Falls back to one full-width column per legacy section. */
export function viewRows(view: DashView): DashRow[] {
  if (Array.isArray(view.rows)) return view.rows;
  return (view.sections ?? []).map((s) => ({ columns: [{ title: s.title, entities: s.entities }] }));
}

/** Ensure every view in a list carries a populated `rows` array. */
export function withRows(views: DashView[]): DashView[] {
  return views.map((v) => ({ ...v, rows: viewRows(v) }));
}

/** Flatten a view's canonical `rows` into the legacy flat `sections` list
 *  (one section per column). */
export function rowsToSections(view: DashView): DashSection[] {
  return viewRows(view).map((r) =>
    r.columns.map((c) => ({ title: c.title, entities: c.entities })),
  ).flat();
}

/** Keep the legacy `sections` field in lock-step with the canonical `rows`.
 *  Edits only ever touch `rows`, so without this `sections` goes stale and any
 *  consumer that reads it (legacy clients, the export file) resurrects removed
 *  tiles or drops added ones. Rebuilds `sections` from `rows` for every view. */
export function syncSections(views: DashView[]): DashView[] {
  return views.map((v) => {
    const rows = viewRows(v);
    return { ...v, rows, sections: rowsToSections(v) };
  });
}
