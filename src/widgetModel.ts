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

// Room for each part in dp, measured on a device at font scale 1 and grown with it (Android scales widget
// text too), so the chosen content always fits instead of being cut at the bottom edge.
export const PAD = 14;
const HEADER = 18;
const ACTION = 32; // round icon button in the header
const ROW = 20; // one line: name left, days right
const MORE = 16;
const HERO = 20 + 34 + 4; // name over a big day count

export function widgetLayout(width: number, height: number, fontScale: number, wantsActions: boolean) {
  const s = Math.max(1, fontScale);
  const size = widgetSize(width, height, s);
  const available = Math.max(0, height - 2 * PAD);
  const inner = Math.max(0, width - 2 * PAD);
  const rowH = Math.ceil(ROW * s) + 12;
  const textHeader = Math.ceil(HEADER * s);
  const header = available >= textHeader + 6 + rowH;
  // Icon buttons sit in the header beside the title (about 7 characters wide), never in a row of their own.
  const fitActions = (n: number) => inner >= Math.ceil(90 * s) + n * (ACTION + 6);
  const actions = wantsActions && header ? (size === 'large' && fitActions(3) ? 3 : fitActions(2) ? 2 : 0) : 0;
  const headerH = header ? Math.max(textHeader, actions ? ACTION : 0) + 6 : 0;
  const body = available - headerH;
  const moreH = Math.ceil(MORE * s) + 4;
  let rows = Math.max(1, Math.min(5, Math.floor(body / rowH)));
  // "+N more" under the list when it fits; a long list gives up its last row for it.
  let more = false;
  if (rows >= 2 && body - rows * rowH >= moreH) more = true;
  else if (rows >= 3) { rows -= 1; more = true; }
  // A narrow (2x2) or one-row widget shows the next item big instead, like an iOS small widget.
  const hero = body >= Math.ceil(HERO * s) && (rows === 1 || inner < 170);
  if (hero) {
    rows = 1;
    more = body - Math.ceil(HERO * s) >= moreH;
  }
  return { size, rows, header, more, actions, hero };
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
