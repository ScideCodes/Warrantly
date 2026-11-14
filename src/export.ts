import { serialSummary } from './serialNumbers.ts';
import type { TFunction } from 'i18next';
import type { Warranty } from './db/repo.ts';

// Export (section 13): the warranty list as CSV (spreadsheets) or as an HTML table printed to PDF
// (insurance claims, resale proof). Product names come from shop emails, so both formats escape them.

const COLUMNS = [
  'product_name', 'store_name', 'category', 'coverage', 'purchase_date', 'warranty_start_date', 'warranty_months', 'end_date',
  'price', 'currency', 'order_number', 'serial_number', 'contact_email', 'contact_phone', 'website_url', 'notes',
] as const;

// A cell starting with = + - @ would run as a formula in Excel or Sheets; a leading ' keeps it text.
const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCsv(list: Warranty[], t: TFunction): string {
  const header = COLUMNS.map((c) => csvCell(t(`export.col.${c}`))).join(',');
  return [header, ...list.map((w) => COLUMNS.map((c) => csvCell(c === 'serial_number' ? serialSummary(w) : w[c])).join(','))].join('\r\n') + '\r\n';
}

const html = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function toHtml(list: Warranty[], t: TFunction, title: string): string {
  const cols = ['product_name', 'store_name', 'purchase_date', 'end_date', 'price', 'order_number', 'serial_number'] as const;
  const cell = (w: Warranty, c: (typeof cols)[number]) => c === 'serial_number' ? serialSummary(w) : (c === 'price' && w.price !== null ? `${w.price} ${w.currency ?? ''}` : w[c]);
  return `<html><head><meta charset="utf-8"><style>
body{font-family:sans-serif;font-size:10px;margin:24px}h1{font-size:16px}table{border-collapse:collapse;width:100%}
th,td{border:1px solid #999;padding:4px;text-align:left;vertical-align:top;white-space:pre-line}th{background:#eee}
</style></head><body><h1>${html(title)}</h1><table><tr>${cols.map((c) => `<th>${html(t(`export.col.${c}`))}</th>`).join('')}</tr>
${list.map((w) => `<tr>${cols.map((c) => `<td>${html(cell(w, c))}</td>`).join('')}</tr>`).join('\n')}
</table></body></html>`;
}
