import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WIDGET, namesShown, parseWidgetConfig, widgetLayout, widgetRows, widgetSize } from './widgetModel.ts';

const item = (id: number, end: string, extra: Partial<{ origin: string; warranty_start_date: string; photo_path: string | null; product_name: string | null }> = {}) => ({
  id, product_name: `P${id}`, store_name: 'S', end_date: end, origin: 'manual', warranty_start_date: '2026-01-01', photo_path: 'p.jpg', ...extra,
});

test('short widgets reserve room for content instead of clipping action buttons', () => {
  const layout = widgetLayout(250, 80, 1, true, ['Scan', 'Add', 'Search']);
  assert.equal(layout.rows, 1);
  assert.equal(layout.header, false);
  assert.equal(layout.actions, 0);
  assert.equal(layout.showTitle, true);
  const largeText = widgetLayout(180, 80, 2, true, ['Beolvasás', 'Hozzáadás', 'Keresés']);
  assert.equal(largeText.showTitle, false);
  assert.equal(largeText.rows, 1);
  assert.equal(largeText.actions, 0);
});

test('widget content reduces with larger fonts and translated action labels', () => {
  const normal = widgetLayout(320, 300, 1, true, ['Scan', 'Add', 'Search']);
  const scaled = widgetLayout(320, 300, 1.6, true, ['Beolvasás', 'Hozzáadás', 'Keresés']);
  assert.equal(normal.actions, 3);
  assert.equal(normal.rows, 4);
  assert.equal(scaled.actions, 2);
  assert.ok(scaled.rows < normal.rows);
  assert.equal(widgetLayout(180, 300, 1.6, true, ['Beolvasás', 'Hozzáadás', 'Keresés']).actions, 0);
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
