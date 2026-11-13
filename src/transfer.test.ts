import test from 'node:test';
import assert from 'node:assert/strict';
import { transferHtml, transferItem } from './transfer.ts';
import type { SharedWarranty } from './db/repo.ts';

const item: SharedWarranty = {
  warranty: { product_name: 'TV', store_name: 'Shop', store_domain: 'shop.hu', purchase_date: '2026-01-01', warranty_start_date: '2026-01-01', warranty_months: 24,
    order_number: 'ORD-1', serial_number: 'SN-9', notes: 'my flat', price: 999, currency: 'HUF', contact_email: 'help@shop.hu', contact_phone: null, website_url: null },
  history: [{ date: '2026-05-01', note: 'repaired' }],
  documents: [{ filename: 'receipt.pdf', local_path: 'a.pdf' }, { filename: 'card.pdf', local_path: 'b.pdf' }],
};

test('transfer leaves out everything not chosen', () => {
  const out = transferItem(item, new Set(['serial_number']), new Set([1]));
  assert.equal(out.warranty.serial_number, 'SN-9');
  for (const k of ['order_number', 'notes', 'price', 'currency', 'contact_email', 'store_domain']) assert.equal(k in out.warranty, false, k);
  assert.equal(out.warranty.product_name, 'TV');
  assert.deepEqual(out.history, []);
  assert.deepEqual(out.documents.map((d) => d.filename), ['card.pdf']);
  const html = transferHtml(out, { title: 'TV', rows: { product_name: 'Product', order_number: 'Order', notes: 'Notes' }, documents: 'Docs', note: 'n' });
  assert.equal(html.includes('ORD-1'), false);
  assert.equal(html.includes('my flat'), false);
  assert.equal(html.includes('repaired'), false);
  assert.equal(html.includes('receipt.pdf'), false);
});

test('transfer keeps what was chosen and escapes it', () => {
  const out = transferItem({ ...item, warranty: { ...item.warranty, notes: '<b>x</b>' } }, new Set(['notes', 'history', 'price']), new Set([0, 1]));
  assert.equal(out.warranty.price, 999);
  assert.equal(out.history.length, 1);
  assert.ok(transferHtml(out, { title: 't', rows: { notes: 'Notes' }, documents: 'D', note: '' }).includes('&lt;b&gt;x&lt;/b&gt;'));
});
