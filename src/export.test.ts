import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TFunction } from 'i18next';
import type { Warranty } from './db/repo.ts';
import { toCsv, toHtml } from './export.ts';

const t = ((k: string) => k.split('.').pop()) as unknown as TFunction;
const w = {
  product_name: '=HYPERLINK("http://evil")', store_name: 'Shop, "Best"', category: null, coverage: null, purchase_date: '2026-01-01',
  warranty_start_date: '2026-01-01', warranty_months: 24, end_date: '2028-01-01', price: 19990, currency: 'HUF', order_number: null,
  serial_number: null, contact_email: null, contact_phone: null, website_url: null, notes: 'line1\nline2',
} as unknown as Warranty;

test('CSV quotes commas, quotes and newlines, and neutralises formulas from shop data', () => {
  const [header, row] = toCsv([w], t).split('\r\n');
  assert.ok(header.startsWith('product_name,store_name,'));
  assert.ok(row.startsWith(`"'=HYPERLINK(""http://evil"")","Shop, ""Best""",`));
  assert.ok(row.endsWith('"line1\nline2"'));
});

test('HTML export escapes product names', () => {
  const out = toHtml([{ ...w, product_name: '<script>x</script>' } as Warranty], t, 'My <list>');
  assert.ok(!out.includes('<script>') && out.includes('&lt;script&gt;') && out.includes('My &lt;list&gt;'));
});
