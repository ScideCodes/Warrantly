import { findItems, findOrderNumber, findWarrantyMonths } from './parse.ts';

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

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  // Hungarian abbreviations ("jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec.")
  febr: 2, márc: 3, ápr: 4, máj: 5, jún: 6, júl: 7, szept: 9, okt: 10,
};

const ymd = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;

// First plausible date not in the future: "2026.01.15", "2026. 01. 15.", "2026-01-15", "15/01/2026",
// "15.01.2026", "Jan 15, 2026", "2026. jan. 15.".
export function findDate(text: string, today: string): string | null {
  const found: string[] = [];
  for (const m of text.matchAll(/\b(20\d{2})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})\b/g)) found.push(ymd(+m[1], +m[2], +m[3]) ?? '');
  for (const m of text.matchAll(/\b(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(20\d{2})\b/g)) found.push(ymd(+m[3], +m[2], +m[1]) ?? '');
  for (const m of text.matchAll(/\b([A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű]{3,5})\.?\s+(\d{1,2}),?\s+(20\d{2})\b/g)) found.push(ymd(+m[3], MONTHS[m[1].toLowerCase()] ?? 0, +m[2]) ?? '');
  for (const m of text.matchAll(/\b(20\d{2})\.\s*([a-záéíóöőúüű]{3,5})\.?\s*(\d{1,2})\b/gi)) found.push(ymd(+m[1], MONTHS[m[2].toLowerCase()] ?? 0, +m[3]) ?? '');
  return found.filter((d) => d && d <= today).sort((a, b) => text.indexOf(a) - text.indexOf(b))[0] ?? null;
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
    warrantyMonths: items.find((i) => i.months)?.months ?? findWarrantyMonths(text),
    orderNumber: findOrderNumber(text),
  };
}
