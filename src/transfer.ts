// Transfer to a new owner (shortlist 18): the person picks what goes with the item. Pure, tested in Node.
import type { SharedWarranty } from './db/repo.ts';

// Groups of fields the person can leave out. Product, store, dates and warranty length always go: without
// them the new owner has no warranty to rely on.
export const TRANSFER_FIELDS = ['price', 'order_number', 'serial_number', 'contact', 'notes', 'history'] as const;
export type TransferField = (typeof TRANSFER_FIELDS)[number];
const COLUMNS: Record<TransferField, string[]> = {
  price: ['price', 'currency'],
  order_number: ['order_number'],
  serial_number: ['serial_number'],
  contact: ['contact_email', 'contact_phone', 'website_url'],
  notes: ['notes'],
  history: [],
};
// Defaults: what a buyer needs (serial number, store contact); private ones (price paid, order number,
// notes, repair history) start off.
export const DEFAULT_FIELDS: TransferField[] = ['serial_number', 'contact'];

// Only what was chosen survives; left-out fields are removed, not blanked, so nothing private is in the file.
export function transferItem(item: SharedWarranty, fields: Set<TransferField>, documents: Set<number>): SharedWarranty {
  const drop = new Set(TRANSFER_FIELDS.filter((f) => !fields.has(f)).flatMap((f) => COLUMNS[f]));
  drop.add('store_domain'); // tied to this person's mail import
  return {
    warranty: Object.fromEntries(Object.entries(item.warranty).filter(([k]) => !drop.has(k))),
    history: fields.has('history') ? item.history : [],
    documents: item.documents.filter((_, i) => documents.has(i)),
  };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// The one-page summary for the new owner, built only from the transferred item.
export function transferHtml(item: SharedWarranty, labels: { title: string; rows: Record<string, string>; documents: string; note: string }): string {
  const w = item.warranty;
  const rows = Object.entries(labels.rows).filter(([k]) => w[k] !== undefined && w[k] !== null && w[k] !== '')
    .map(([k, label]) => `<tr><th>${esc(label)}</th><td>${esc(w[k])}</td></tr>`).join('');
  const history = item.history.map((h) => `<li>${esc(h.date)}: ${esc(h.note)}</li>`).join('');
  const docs = item.documents.map((d) => `<li>${esc(d.filename)}</li>`).join('');
  return `<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:24px}th{text-align:left;padding:4px 16px 4px 0;color:#555}td{padding:4px 0}</style></head>
<body><h1>${esc(labels.title)}</h1><table>${rows}</table>${history ? `<ul>${history}</ul>` : ''}${docs ? `<h3>${esc(labels.documents)}</h3><ul>${docs}</ul>` : ''}<p style="color:#555">${esc(labels.note)}</p></body></html>`;
}
