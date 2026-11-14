import { findItems, findOrderNumber, findWarrantyMonths } from './parse.ts';
import { findDate, findWarrantyStartDate } from './dates.ts';
import { serialCandidates } from '../serial.ts';
export { findDate, findWarrantyStartDate } from './dates.ts';

// Scanned paper documents (brainstorm section 18): OCR text from a receipt, invoice or warranty card,
// read with the same extractors as email. OCR is noisier, so everything found is only a suggestion
// that the user confirms in the form.
export interface ScanResult {
  storeName: string | null;
  productName: string | null;
  purchaseDate: string | null; // YYYY-MM-DD
  warrantyStartDate: string | null; // YYYY-MM-DD
  warrantyMonths: number | null;
  orderNumber: string | null;
  price: number | null;
  currency: string | null;
  serialNumber: string | null;
  serialNumbers: string[];
}

const CURRENCY_MAP: Record<string, string> = {
  'ft': 'HUF',
  'huf': 'HUF',
  '€': 'EUR',
  'eur': 'EUR',
  '$': 'USD',
  'usd': 'USD',
  '£': 'GBP',
  'gbp': 'GBP',
  'chf': 'CHF',
  'pln': 'PLN',
  'zł': 'PLN',
  'czk': 'CZK',
  'kč': 'CZK',
  'ron': 'RON',
  'lei': 'RON',
};

function normalizePrice(numStr: string, currencyCode: string): number | null {
  let clean = numStr.replace(/\s+/g, '');
  if (!clean) return null;
  if (currencyCode === 'HUF') {
    clean = clean.replace(/[.,-]/g, '');
    const val = parseInt(clean, 10);
    return isNaN(val) ? null : val;
  }
  if (clean.includes('.') && clean.includes(',')) {
    if (clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
      clean = clean.replace(/\./g, '').replace(',', '.');
    } else {
      clean = clean.replace(/,/g, '');
    }
  } else if (clean.includes(',')) {
    if (/,\d{2}$/.test(clean)) clean = clean.replace(',', '.');
    else clean = clean.replace(/,/g, '');
  }
  const val = parseFloat(clean);
  return isNaN(val) ? null : val;
}

export function findPrice(text: string): { price: number | null; currency: string | null } {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const totalKeywords = /(?:fizetendő(?:\s*összeg)?|végösszeg|összesen|bruttó(?:\s*végösszeg|\s*összeg)?|nyugtaösszeg|total(?:\s*amount)?|amount\s*due|grand\s*total|gross\s*total)/i;
  for (const line of lines) {
    if (totalKeywords.test(line)) {
      const m = line.match(/(?:([A-Za-z$€£]+)\s*)?([0-9\s.,]+)\s*([A-Za-z$€£]+)?/);
      if (m) {
        const curSym = (m[3] || m[1] || '').toLowerCase();
        const cur = CURRENCY_MAP[curSym] ?? (curSym ? curSym.toUpperCase() : null);
        if (cur) {
          const num = normalizePrice(m[2], cur);
          if (num !== null && num > 0) return { price: num, currency: cur };
        }
      }
    }
  }
  for (const line of lines) {
    const m = line.match(/([0-9]{1,3}(?:[\s.][0-9]{3})+|[0-9]+(?:[.,][0-9]{2})?)\s*(ft|huf|eur|usd|gbp|chf|pln|czk|ron|€|\$|£)\b/i);
    if (m) {
      const cur = CURRENCY_MAP[m[2].toLowerCase()] ?? m[2].toUpperCase();
      const num = normalizePrice(m[1], cur);
      if (num !== null && num > 0) return { price: num, currency: cur };
    }
  }
  return { price: null, currency: null };
}

function findScanOrderNumber(text: string): string | null {
  const standard = findOrderNumber(text);
  if (standard) return standard;
  const match = text.match(/(?:számlaszám|számla\s*sorszáma|bizonylatszám|számla\s*száma|invoice\s*(?:no\.?|#|number))\s*[:#]?\s*([A-Za-z0-9][\w/.-]*\d[\w/-]*)/i);
  return match?.[1] ?? null;
}

function findScanWarrantyMonths(text: string): number | null {
  const standard = findWarrantyMonths(text);
  if (standard) return standard;
  const m1 = text.match(/(\d{1,2})\s*(?:hó|hónap|honap|months?)\s*(?:jótállás|jotallas|garancia|gar\b|warranty)/i);
  if (m1) {
    const n = Number(m1[1]);
    if (n >= 1 && n <= 120) return n;
  }
  const m2 = text.match(/(\d)\s*(?:év|ev|years?|yr)\s*(?:jótállás|jotallas|garancia|gar\b|warranty)/i);
  if (m2) {
    const n = Number(m2[1]) * 12;
    if (n >= 1 && n <= 120) return n;
  }
  return null;
}

// The shop's name is usually printed first; skip lines that are only numbers, dates or addresses.
function findStore(lines: string[]): string | null {
  const sellerLine = lines.find((l) => /^(?:eladó|forgalmazó|kereskedő|szállító|seller|vendor|store)\s*[:：-]\s*(.+)$/i.test(l));
  if (sellerLine) {
    const m = sellerLine.match(/^(?:eladó|forgalmazó|kereskedő|szállító|seller|vendor|store)\s*[:：-]\s*(.+)$/i);
    if (m && m[1].trim().length >= 3) return m[1].trim();
  }
  return lines.find((l) => /\p{L}{3}/u.test(l) && l.length <= 40 && !/\d{4}\s+\p{L}+,|adószám|tax|nyugta|számla|invoice|receipt/iu.test(l)) ?? null;
}

export function parseScanText(text: string, today: string): ScanResult {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = findItems(lines.join('\n'));
  const purchaseDate = findDate(text, today);
  const warrantyStartDate = findWarrantyStartDate(text, today);
  const { price, currency } = findPrice(text);
  const serials = serialCandidates(lines);
  const months = items[0]?.months ?? (items.some((i) => i.months !== null) ? null : findScanWarrantyMonths(text));
  return {
    storeName: findStore(lines),
    productName: items[0]?.name ?? null,
    purchaseDate,
    warrantyStartDate,
    warrantyMonths: months,
    orderNumber: findScanOrderNumber(text),
    price,
    currency,
    serialNumber: serials[0] ?? null,
    serialNumbers: serials,
  };
}
