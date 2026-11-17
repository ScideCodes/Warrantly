import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WIDGET, namesShown, parseWidgetConfig, widgetLayout, widgetRows, widgetSize } from './widgetModel.ts';

const item = (id: number, end: string, extra: Partial<{ origin: string; warranty_start_date: string; photo_path: string | null; product_name: string | null }> = {}) => ({
  id, product_name: `P${id}`, store_name: 'S', end_date: end, origin: 'manual', warranty_start_date: '2026-01-01', photo_path: 'p.jpg', ...extra,
});

test('short widgets show one line and never a clipped header or buttons', () => {
  const layout = widgetLayout(250, 80, 1, true);
  assert.deepEqual([layout.rows, layout.header, layout.actions, layout.hero], [1, false, 0, false]);
  const largeText = widgetLayout(180, 80, 2, true);
  assert.deepEqual([largeText.rows, largeText.header, largeText.actions], [1, false, 0]);
});

test('every part the layout picks fits the height', () => {
  for (const w of [110, 160, 180, 250, 320, 400]) {
    for (const h of [60, 80, 110, 150, 220, 300, 420]) {
      for (const s of [1, 1.3, 2]) {
        const l = widgetLayout(w, h, s, true);
        const header = l.header ? Math.max(Math.ceil(18 * s), l.actions ? 32 : 0) + 6 : 0;
        const body = l.hero ? Math.ceil(58 * s) : l.rows * (Math.ceil(20 * s) + 12);
        const more = l.more ? Math.ceil(16 * s) + 4 : 0;
        if (l.rows > 1 || l.header) assert.ok(header + body + more <= h - 28, `${w}x${h}@${s}`);
      }
    }
  }
});

test('buttons sit in the header and drop out with larger fonts', () => {
  const normal = widgetLayout(320, 300, 1, true);
  const scaled = widgetLayout(320, 300, 1.6, true);
  assert.deepEqual([normal.actions, normal.rows, normal.more], [3, 5, true]);
  assert.equal(scaled.actions, 2);
  assert.ok(scaled.rows < normal.rows);
  assert.equal(widgetLayout(180, 300, 1.6, true).actions, 0);
  assert.equal(widgetLayout(320, 300, 1, false).actions, 0);
});

test('a short widget drops the buttons instead of clipping its row', () => {
  const l = widgetLayout(250, 95, 1, true); // 3x1 resized by hand: room for text header + row, not for buttons
  assert.deepEqual([l.header, l.actions, l.rows], [true, 0, 1]);
});

test('a 2x2 widget shows the next item big', () => {
  const l = widgetLayout(160, 170, 1, true);
  assert.deepEqual([l.hero, l.rows, l.header], [true, 1, true]);
  assert.equal(widgetLayout(320, 170, 1, true).hero, false);
});

test('widget config parsing falls back safely', () => {
  assert.deepEqual(parseWidgetConfig(null), DEFAULT_WIDGET);
  assert.deepEqual(parseWidgetConfig('{bad'), DEFAULT_WIDGET);
  assert.deepEqual(parseWidgetConfig('{"content":"returns","names":"hide","photos":true,"actions":false}'), { content: 'returns', names: 'hide', photos: true, actions: false });
  assert.equal(parseWidgetConfig('{"names":"evil"}').names, 'auto');
});

test('widget size tiers follow size and font scale', () => {
  assert.equal(widgetSize(250, 80), 'small');
  assert.equal(widgetSize(250, 150), 'medium');
  assert.equal(widgetSize(250, 150, 1.5), 'small');
  assert.equal(widgetSize(250, 300), 'large');
});

test('widget rows: privacy, photos, expiry order and limits', () => {
  const list = [item(1, '2026-11-01'), item(2, '2026-12-01'), item(3, '2027-01-01')];
  const rows = widgetRows(list, DEFAULT_WIDGET, false, '2026-11-13', 5);
  assert.deepEqual(rows.map((r) => r.id), [2, 3]); // expired one left out
  assert.ok(rows.every((r) => r.title === null && r.photo === null)); // names hidden: no title, no photo
  const shown = widgetRows(list, { ...DEFAULT_WIDGET, photos: true }, true, '2026-11-13', 1);
  assert.deepEqual(shown, [{ id: 2, title: 'P2', days: 18, photo: 'p.jpg' }]);
  assert.equal(namesShown({ ...DEFAULT_WIDGET, names: 'auto' }, false), false);
  assert.equal(namesShown({ ...DEFAULT_WIDGET, names: 'show' }, false), true);
});

test('widget rows: return deadlines only for online purchases inside the window', () => {
  const list = [item(1, '2028-01-01', { origin: 'gmail', warranty_start_date: '2026-11-05' }), item(2, '2028-01-01', { origin: 'manual', warranty_start_date: '2026-11-10' })];
  const rows = widgetRows(list, { ...DEFAULT_WIDGET, content: 'returns' }, true, '2026-11-13', 5);
  assert.deepEqual(rows.map((r) => [r.id, r.days]), [[1, 6]]); // 5 Nov + 14 days = 19 Nov
});
