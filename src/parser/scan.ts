import { findItems, findOrderNumber, findWarrantyMonths, MAX_TEXT } from './parse.ts';
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
      // Start only at the head of a letter run: same matches, without re-scanning the run from every letter.
      const m = line.match(/(?<![A-Za-z$€£])(?:([A-Za-z$€£]+)\s*)?([0-9\s.,]+)\s*([A-Za-z$€£]+)?/);
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
    const m = line.match(/([0-9]{1,3}(?:[\s.][0-9]{3}){1,4}|[0-9]{1,12}(?:[.,][0-9]{2})?)\s*(ft|huf|eur|usd|gbp|chf|pln|czk|ron|€|\$|£)\b/i);
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
  const match = text.match(/(?:számlaszám|számla\s*sorszáma|bizonylatszám|számla\s*száma|invoice\s*(?:no\.?|#|number))\s*(?:[:#]\s*)?([A-Za-z0-9][\w/.-]{0,39}\d[\w/-]{0,39})/i);
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

const KNOWN_RETAILERS: [RegExp, string][] = [
  [/\b(?:alza(?:\.hu|\.cz|\.sk)?)\b/i, 'Alza'],
  [/\b(?:emag(?:\.hu|\.ro)?)\b/i, 'eMAG'],
  [/\b(?:media\s*markt)\b/i, 'MediaMarkt'],
  [/\b(?:istyle(?:\.hu)?)\b/i, 'iStyle'],
  [/\b(?:euronics(?:\.hu)?)\b/i, 'Euronics'],
  [/\b(?:aqua(?:\s*optima|\.hu)?)\b/i, 'Aqua'],
  [/\b(?:pcx(?:\.hu)?)\b/i, 'PCX'],
  [/\b(?:praktiker(?:\.hu)?)\b/i, 'Praktiker'],
  [/\b(?:ikea(?:\.com|\.hu)?)\b/i, 'IKEA'],
  [/\b(?:tesco(?:\.hu)?)\b/i, 'Tesco'],
  [/\b(?:auchan(?:\.hu)?)\b/i, 'Auchan'],
  [/\b(?:lidl(?:\.hu)?)\b/i, 'Lidl'],
  [/\b(?:aldi(?:\.hu)?)\b/i, 'Aldi'],
  [/\b(?:amazon(?:\.com|\.de|\.co\.uk)?)\b/i, 'Amazon'],
  [/\b(?:apple(?:\.com)?)\b/i, 'Apple'],
  [/\b(?:conrad(?:\.hu|\.de)?)\b/i, 'Conrad'],
  [/\b(?:notino(?:\.hu)?)\b/i, 'Notino'],
  [/\b(?:zalando(?:\.hu)?)\b/i, 'Zalando'],
  [/\b(?:pepita(?:\.hu)?)\b/i, 'Pepita'],
  [/\b(?:ipon(?:\.hu)?)\b/i, 'iPon'],
  [/\b(?:extreme\s*digital)\b/i, 'Extreme Digital'],
];

const SELLER_LABEL = /^(?:eladó|forgalmazó|kereskedő|szállító|kibocsátó|értékesítő|seller|vendor|store|merchant|sold\s*by|issued\s*by)\b\s*[:：-]?\s*(.*)$/i;
const LEGAL_FORM = /\b(?:kft|zrt|nyrt|bt|kkt|e\.v\.|egyéni vállalkozó|gmbh|ag|ltd|llc|inc|corp|s\.r\.o\.|b\.v\.|s\.a\.|sp\.\s*z\s*o\.o\.)\.?\b/i;
const NOISE_START = /^(?:kedves|tisztelt|üdvözöl|dear|hello|hi|köszönjük|thank\s*you|rendelés|megrendelés|order|szállítás|értesítés|számla|nyugta|invoice|receipt|garanciajegy|jótállási|szállítólevél|eredeti|másolat|díjbekérő|vevő|vásárló|customer|buyer|bill\s+to|ship\s+to|gls|dpd|foxpost|packeta|magyar\s+posta|mpl|express\s+one|dhl|ups|fedex)\b/i;
const METADATA_CONTENT = /(?:adószám|adoszam|tax|vat|bankszámla|iban|swift|bic|cégjegyzék|tel:|telefon|email|e-mail|honlap|web:|\d{4}\s+[A-ZÁÉÍÓÖŐÚÜŰ][a-záéíóöőúüű]+|(?:utca|út|tér|krt|körút|sor|dűlő|street|road|ave)\b)/i;

function cleanStoreCandidate(raw: string): string | null {
  let s = raw.trim();
  s = s.replace(/^(?:cégnév|eladó|forgalmazó|kereskedő|szállító|kibocsátó|értékesítő|seller|vendor|store|merchant|sold\s*by|issued\s*by)\s*[:：-]\s*/i, '');
  s = s.split(/(?:,|\s-\s|;|\sadószám|\sadoszam|\stax|\scím:)/i)[0].trim();
  if (s.length < 3 || s.length > 60 || NOISE_START.test(s) || METADATA_CONTENT.test(s)) return null;
  if (!/\p{L}{2}/u.test(s)) return null;
  return s;
}

// Multi-stage merchant extraction:
// 1. Email From / Feladó header
// 2. Explicit seller anchor block (same line or next lines)
// 3. Official corporate entity detection (Kft, Zrt, GmbH, Ltd, etc.)
// 4. Known retailer matching
// 5. Domain heuristic
// 6. Strict noise-filtered fallback
function findStore(lines: string[]): string | null {
  // 1. Email sender header
  for (const line of lines.slice(0, 15)) {
    const fromMatch = line.match(/^(?:from|feladó)\s*[:：]\s*(?:(?:"?([^"<>\n]*[^"<>\s])"?\s*)?<[^>]+>|([^\n<]+))/i);
    if (fromMatch) {
      const sender = (fromMatch[1] || fromMatch[2] || '').trim();
      const cleaned = cleanStoreCandidate(sender);
      if (cleaned) {
        for (const [re, canonical] of KNOWN_RETAILERS) {
          if (re.test(cleaned)) return canonical;
        }
        return cleaned;
      }
    }
  }

  // 2. Explicit seller anchor block (same line or next line)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(SELLER_LABEL);
    if (m) {
      if (m[1] && m[1].trim().length >= 3) {
        const cleaned = cleanStoreCandidate(m[1]);
        if (cleaned) return cleaned;
      }
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        const next = lines[j];
        if (NOISE_START.test(next) || METADATA_CONTENT.test(next)) continue;
        const cleaned = cleanStoreCandidate(next);
        if (cleaned) return cleaned;
      }
    }
  }

  // 3. Corporate legal entities in document header (before Buyer section)
  let pastBuyer = false;
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const line = lines[i];
    if (/^(?:vevő|vásárló|customer|buyer|bill\s+to|ship\s+to)\b/i.test(line)) {
      pastBuyer = true;
      continue;
    }
    if (!pastBuyer && LEGAL_FORM.test(line)) {
      const cleaned = cleanStoreCandidate(line);
      if (cleaned) return cleaned;
    }
  }

  // 4. Known retailer matching across top 20 lines
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i];
    for (const [re, canonical] of KNOWN_RETAILERS) {
      if (re.test(line)) {
        const cleaned = cleanStoreCandidate(line);
        return cleaned && cleaned.length <= canonical.length + 6 ? cleaned : canonical;
      }
    }
  }

  // 5. Web domain or email domain in top 25 lines
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const domainMatch = lines[i].match(/(?:www\.|@)([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
    if (domainMatch) {
      const dom = domainMatch[1].toLowerCase();
      for (const [re, canonical] of KNOWN_RETAILERS) {
        if (re.test(dom)) return canonical;
      }
    }
  }

  // 6. Strict fallback on top lines (no greetings, no dates, no sentences)
  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i];
    if (NOISE_START.test(line) || METADATA_CONTENT.test(line)) continue;
    if (/[.!?]$/.test(line.trim())) continue;
    if (/\d/.test(line)) continue;
    const cleaned = cleanStoreCandidate(line);
    if (cleaned && cleaned.split(/\s+/).length <= 4) {
      return cleaned;
    }
  }

  return null;
}

export function parseScanText(fullText: string, today: string): ScanResult {
  const text = fullText.slice(0, MAX_TEXT);
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
