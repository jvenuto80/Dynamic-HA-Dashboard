import type { DashRow, DashView } from '../types';

/** Normalize a view to its row/column model.
 *  Falls back to one full-width column per legacy section. */
export function viewRows(view: DashView): DashRow[] {
  if (view.rows && view.rows.length) return view.rows;
  return (view.sections ?? []).map((s) => ({ columns: [{ title: s.title, entities: s.entities }] }));
}

/** Ensure every view in a list carries a populated `rows` array. */
export function withRows(views: DashView[]): DashView[] {
  return views.map((v) => ({ ...v, rows: viewRows(v) }));
}
