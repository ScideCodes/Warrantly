// Home-screen widget content (shortlist 23–30), apart from drawing. Pure, tested in Node.
import { daysUntil, returnDeadline } from './warranty.ts';

export type WidgetContent = 'expiring' | 'returns';
export type WidgetNames = 'auto' | 'show' | 'hide';
// Saved per placed widget (its own id); anything unknown falls back to the defaults.
export interface WidgetConfig { content: WidgetContent; names: WidgetNames; photos: boolean; actions: boolean }
export const DEFAULT_WIDGET: WidgetConfig = { content: 'expiring', names: 'auto', photos: false, actions: true };

export function parseWidgetConfig(text: string | null): WidgetConfig {
  try {
    const v = text ? JSON.parse(text) : {};
    return {
      content: v.content === 'returns' ? 'returns' : 'expiring',
      names: v.names === 'show' || v.names === 'hide' ? v.names : 'auto',
      photos: v.photos === true,
      actions: v.actions !== false,
    };
  } catch {
    return DEFAULT_WIDGET;
  }
}

// Size tiers from the widget's size in dp (font scale makes text take more room, so it counts too).
export type WidgetSize = 'small' | 'medium' | 'large';
export function widgetSize(widthDp: number, heightDp: number, fontScale = 1): WidgetSize {
  const h = heightDp / Math.max(1, fontScale);
  if (h < 110 || widthDp < 160) return 'small';
  if (h < 220) return 'medium';
  return 'large';
}
export const ROWS: Record<WidgetSize, number> = { small: 1, medium: 2, large: 5 };

// Reserve actual text and control space before choosing row count. Android scales widget text too.
export function widgetLayout(width: number, height: number, fontScale: number, wantsActions: boolean, actionLabels: string[]) {
  const scale = Math.max(1, fontScale);
  const size = widgetSize(width, height, scale);
  const available = Math.max(0, height - 24);
  const showTitle = available >= 33 * scale + 8;
  const rowHeight = showTitle ? 33 * scale + 8 : Math.max(32, 16 * scale + 8);
  const headerHeight = 18 * scale + 4;
  const header = available >= headerHeight + rowHeight;
  const more = size !== 'small' && showTitle;
  const moreHeight = more ? 16 * scale + 2 : 0;
  const actionHeight = Math.max(44, Math.ceil(18 * scale + 16));
  const actionWidth = Math.max(60, ...actionLabels.map((s) => s.length * 13 * 0.65 * scale + 20));
  let actions = 0;
  if (wantsActions && width - 24 >= actionWidth * 2 && available >= (header ? headerHeight : 0) + rowHeight + moreHeight + actionHeight + 8) {
    actions = size === 'large' && width - 24 >= actionWidth * 3 ? 3 : 2;
  }
  const remaining = available - (header ? headerHeight : 0) - moreHeight - (actions ? actionHeight + 8 : 0);
  const rows = Math.max(1, Math.min(size === 'small' ? 1 : 5, Math.floor(remaining / rowHeight)));
  return { size, rows, header, more, showTitle, actions, actionHeight };
}

interface Item { id: number; product_name: string | null; store_name: string; end_date: string; origin: string; warranty_start_date: string; photo_path: string | null }
export interface WidgetRow { id: number; title: string | null; days: number; photo: string | null }

// "expiring": active warranties by end date. "returns": items still inside their return window, by deadline.
// Titles are null when names are hidden (privacy); photos only when asked and names are shown.
export function widgetRows(list: Item[], cfg: WidgetConfig, showNames: boolean, today: string, max: number): WidgetRow[] {
  const rows = cfg.content === 'returns'
    ? list.map((w) => ({ w, end: returnDeadline(w) })).filter((x): x is { w: Item; end: string } => !!x.end && x.end >= today).sort((a, b) => a.end.localeCompare(b.end))
    : list.filter((w) => w.end_date >= today).map((w) => ({ w, end: w.end_date }));
  return rows.slice(0, max).map(({ w, end }) => ({
    id: w.id,
    title: showNames ? w.product_name ?? w.store_name : null,
    days: daysUntil(end, today),
    photo: showNames && cfg.photos ? w.photo_path : null,
  }));
}

export const namesShown = (cfg: WidgetConfig, appDefault: boolean): boolean => (cfg.names === 'auto' ? appDefault : cfg.names === 'show');
