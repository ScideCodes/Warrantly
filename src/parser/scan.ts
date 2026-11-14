import { findItems, findOrderNumber, findWarrantyMonths } from './parse.ts';
import { findDate } from './dates.ts';
export { findDate } from './dates.ts';

// Scanned paper documents (brainstorm section 18): OCR text from a receipt, invoice or warranty card,
// read with the same extractors as email. OCR is noisier, so everything found is only a suggestion
// that the user confirms in the form.
export interface ScanResult {
  storeName: string | null;
  productName: string | null;
  purchaseDate: string | null; // YYYY-MM-DD
  warrantyMonths: number | null;
  orderNumber: string | null;
}

// The shop's name is usually printed first; skip lines that are only numbers, dates or addresses.
function findStore(lines: string[]): string | null {
  return lines.find((l) => /\p{L}{3}/u.test(l) && l.length <= 40 && !/\d{4}\s+\p{L}+,|adószám|tax|nyugta|számla|invoice|receipt/iu.test(l)) ?? null;
}

export function parseScanText(text: string, today: string): ScanResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = findItems(lines.join('\n'));
  return {
    storeName: findStore(lines),
    productName: items[0]?.name ?? null,
    purchaseDate: findDate(text, today),
    warrantyMonths: items[0]?.months ?? (items.some(i => i.months !== null) ? null : findWarrantyMonths(text)),
    orderNumber: findOrderNumber(text),
  };
}
