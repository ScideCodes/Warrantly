import { DEFAULT_WARRANTY_MONTHS, IGNORED_SENDERS, LANGUAGES, type LanguageKeywords } from './keywords.ts';
import type { Item, Kind, MailMessage, ParseResult, RequiredField, Status, StoreRules } from './types.ts';
import { todayYmd } from '../warranty.ts';
import { findDate } from './dates.ts';

const NOREPLY = /no-?reply|do-?not-?reply/i;

// Brainstorm section 8, steps 1, 2 and 4: classify the mail, extract from the body, and
// report missing required fields. Step 3 (PDF text) runs later on `pdfAttachments`.
export function parseEmail(msg: MailMessage, storeRules: StoreRules = {}): ParseResult {
  const text = cleanText(msg.text);
  const all = `${msg.subject}\n${text}`;
  const storeDomain = registrableDomain(msg.from);
  const receivedDay = todayYmd(new Date(msg.date));
  // A later invoice/forward must not move the purchase to the day the email was sent.
  const purchaseDate = findDate(msg.text, receivedDay, true) ?? receivedDay;
  const orderNumber = findOrderNumber(msg.subject) ?? findOrderNumber(text);
  const pdfAttachments = msg.attachments
    .filter((a) => a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.filename))
    .map((a) => a.filename);
  const deliveredDate = LANGUAGES.some((l) => l.delivered.test(all)) ? receivedDay : null;

  let kind: Kind;
  if (IGNORED_SENDERS.has(storeDomain) || IGNORED_SENDERS.has(msg.from.toLowerCase())) kind = 'ignored';
  else if (LANGUAGES.some((l) => l.returned.test(all))) kind = 'return';
  else kind = 'purchase';

  const extracted = findItems(text);
  // An item-specific guarantee must never silently fill another product's missing length.
  const emailMonths = extracted.some(i => i.months !== null) ? null : findWarrantyMonths(all);
  const ruleMonths = storeRules[storeDomain]?.defaultWarrantyMonths ?? null;
  const items: Item[] = extracted.map(({ name, months }) => {
    if (months) return { name, warrantyMonths: months, warrantySource: 'email' };
    if (emailMonths) return { name, warrantyMonths: emailMonths, warrantySource: 'email' };
    if (ruleMonths) return { name, warrantyMonths: ruleMonths, warrantySource: 'store_rule' };
    return { name, warrantyMonths: null, warrantySource: null };
  });

  // A warranty document (by subject or PDF name, not claim/repair updates), or a mail that states a
  // warranty length for a product ("24 hó gar."). Invoice bodies saying "garancia" alone do not count.
  const isDocument =
    LANGUAGES.some((l) => l.document.test(msg.subject) || pdfAttachments.some((f) => l.document.test(f))) &&
    !LANGUAGES.some((l) => l.repair.test(msg.subject));
  const statesWarranty = items.some((i) => i.warrantySource === 'email');
  const isPurchase = (isDocument || statesWarranty) && (orderNumber || items.length || pdfAttachments.length);
  if (kind === 'purchase' && !isPurchase) kind = 'ignored';

  const missingFields: RequiredField[] = [];
  if (kind === 'purchase') {
    if (!items.length) missingFields.push('productName');
    const lengthKnown = items.length ? items.every((i) => i.warrantyMonths) : Boolean(emailMonths ?? ruleMonths);
    if (!lengthKnown) missingFields.push('warrantyMonths');
  }
  const status: Status =
    kind === 'ignored' ? 'ignored' : kind === 'return' || missingFields.length ? 'needs_input' : 'complete';

  return {
    messageId: msg.id,
    subject: msg.subject,
    sender: msg.from,
    receivedAt: msg.date,
    kind,
    status,
    storeName: msg.fromName?.trim() || storeDomain,
    storeDomain,
    purchaseDate,
    deliveredDate,
    suggestedStartDate: deliveredDate ?? purchaseDate,
    orderNumber,
    items,
    missingFields,
    suggestedWarrantyMonths: missingFields.includes('warrantyMonths') ? DEFAULT_WARRANTY_MONTHS : null,
    contactEmail: findContactEmail(msg, text, storeDomain),
    contactPhone: text.match(PHONE)?.[0].trim() ?? null,
    websiteUrl: `https://${storeDomain}`,
    pdfAttachments,
  };
}

// HTML-to-text output is full of link debris and hard line wraps. Strip links and URLs,
// then join wrapped lines inside a paragraph so a product name split over two lines reads as one.
export function cleanText(raw: string): string {
  return raw
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\(\s*\)/g, '')
    .split(/\n[ \t]*\n/)
    .map((p) => p.split('\n').map((line, i, lines) => {
      const previous = lines[i - 1] ?? '';
      // Table rows and separate quantity-led items are structural, not soft line wraps.
      const boundary = previous.includes('|') || line.includes('|') || /^\s*\d+\s*(?:[x×]|db|darab|pcs|[\.\)])\s+/i.test(line);
      return (i ? boundary ? '\n' : ' ' : '') + line.trim();
    }).join('').trim())
    .filter(Boolean)
    .join('\n');
}

// shortcut: takes the last two labels, wrong for "co.uk"-style suffixes. Upgrade to a
// public-suffix list when a store on such a domain shows up.
export function registrableDomain(email: string): string {
  return email.toLowerCase().split('@').pop()!.split('.').slice(-2).join('.');
}

const ORDER_PATTERNS = [
  // [\wáéíóöőúüű]*: Hungarian suffixes and compounds, e.g. "rendelésének", "Rendelésszám"
  /\b(?:order|megrendelés|rendelés)[\wáéíóöőúüű]*\s*(?:#|no\.?|number|nr\.?|id|száma|azonosító(?:ja)?)?\s*[:#]?\s*([A-Z0-9][\w/.-]*\d[\w/-]*)/i,
  /\b([A-Z0-9][\w/-]*\d[\w/-]*)\s*sz\.\s*(?:megr|rend)/i,
  /\bAzonosító:\s*([\w/-]*\d[\w/-]*)/i,
];

export function findOrderNumber(s: string): string | null {
  for (const re of ORDER_PATTERNS) {
    const m = s.match(re);
    if (m) return m[1];
  }
  return null;
}

function toMonths(n: string, unit: string, lang: LanguageKeywords): number | null {
  const months = new RegExp(`^(?:${lang.yearUnit})`, 'i').test(unit) ? Number(n) * 12 : Number(n);
  return months >= 1 && months <= 120 ? months : null;
}

// "24 hó gar.", "2-year warranty", "Warranty: 2 years", "jótállás időtartama 3 év"
export function findWarrantyMonths(s: string): number | null {
  for (const lang of LANGUAGES) {
    const unit = `(${lang.monthUnit}|${lang.yearUnit})`;
    const before = new RegExp(`(\\d{1,3})[\\s-]*${unit}\\.?\\s*(?:${lang.warrantyWord})`, 'i');
    const after = new RegExp(`(?:${lang.warrantyWord})\\w*[^.\\n\\d]{0,25}?(\\d{1,3})[\\s-]*${unit}`, 'i');
    for (const re of [before, after]) {
      const m = s.match(re);
      const months = m && toMonths(m[1], m[2], lang);
      if (months) return months;
    }
  }
  return null;
}

function cleanProductName(raw: string): string {
  let s = raw.trim();
  // Strip leading pipes, bullets, dashes
  s = s.replace(/^[|•–-]\s*/, '');
  // Strip leading list numbers or quantity markers
  s = s.replace(/^\s*(?:\d+[\.\)]\s+|\d+\s*(?:[x×]|db|darab|db\.|pcs|qty)\s+)/i, '');
  // Strip leading ID / SKU / item code prefixes e.g. "Azonosító: 260901/900001", "Cikkszám: 12345"
  s = s.replace(/^(?:azonosító|cikkszám|sku|item\s*no\.?|id|kód)\s*[:：]?\s*\S+\s+/i, '');
  // Strip labelled prefixes e.g. "Termék:", "Megnevezés:", "Termék megnevezése:", "Product:"
  s = s.replace(/^(?:termék(?:\s*megnevezése|\s*neve)?|megnevezés|tétel(?:\s*megnevezése)?|cikk(?:\s*megnevezése)?|item(?:\s*name)?|product(?:\s*name)?|description)\s*[:：-]\s*/i, '');
  // Strip markdown link debris e.g. "[](#)" or "[](url)"
  s = s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\(\s*\)/g, '').trim();
  // Strip trailing price amounts e.g. "19 990 Ft", "499.00 EUR", "$29.99"
  s = s.replace(/\s+[0-9]{1,3}(?:[\s.][0-9]{3})*(?:[.,][0-9]{2})?\s*(?:ft|huf|eur|usd|gbp|chf|pln|czk|ron|€|\$|£)\s*$/i, '');
  // Strip trailing quantity and warranty markers in either order
  for (let iter = 0; iter < 2; iter++) {
    s = s.replace(/\s+(?:[x×]\s*\d+|\d+\s*[x×]|\d+\s*(?:db|darab|db\.|pcs))\s*$/i, '');
    for (const lang of LANGUAGES) {
      s = s.replace(
        new RegExp(`\\s+(?:\\([\\w-]+\\)\\s*)?\\d{1,3}[\\s-]*(${lang.monthUnit}|${lang.yearUnit})\\.?\\s*(?:${lang.warrantyWord})\\b.*$`, 'i'),
        '',
      );
    }
  }
  // Strip trailing separators or stray punctuation
  s = s.replace(/\s+[-–|/]\s*$/, '').trim();
  // Normalize internal whitespace (e.g. collapsing multiple spaces from OCR)
  return s.replace(/\s+/g, ' ');
}

// Line items are recognised by quantity markers ("1x Name", "1 db Name", "Name 1 db"),
// list numbers ("1. Name"), labelled fields ("Termék: Name"), or warranty tags ("Name 24 hó gar.").
export function findItems(text: string): { name: string; months: number | null }[] {
  const found = new Map<string, number | null>();

  // 1. Process table rows (lines with pipes |)
  const rows = text.split('\n').map((row) => {
    const cells = row.split(/\s*\|\s*/);
    for (let i = 1; i < cells.length; i++) {
      if (findWarrantyMonths(cells[i]) && isProductName(cells[i - 1]) && !findWarrantyMonths(cells[i - 1])) {
        cells[i - 1] += ` ${cells[i]}`;
        cells[i] = '';
      }
    }
    return cells.join(' | ');
  });

  const tableSegments = rows.join('\n').split(/\n|\s*\|\s*|\t/).map((s) => s.trim()).filter(Boolean);
  for (const seg of tableSegments) {
    for (const lang of LANGUAGES) {
      const tagged = seg.match(
        new RegExp(`^(.+?)\\s*(?:\\([\\w-]+\\)\\s*)?(\\d{1,3})[\\s-]*(${lang.monthUnit}|${lang.yearUnit})\\.?\\s*(?:${lang.warrantyWord})\\b`, 'i'),
      );
      const name =
        tagged?.[1] ??
        seg.match(/^\d+\s*[x×]\s+(.+)$/i)?.[1] ??
        seg.match(/^(.+?)\s+[x×]\s*\d+\b/i)?.[1] ??
        seg.match(new RegExp(`^(.+?)\\s+\\d+\\s*(?:${lang.quantityUnit})\\b`, 'i'))?.[1];
      if (!name) continue;
      const product = cleanProductName(name);
      if (!isProductName(product)) continue;
      const months = tagged ? toMonths(tagged[2], tagged[3], lang) : null;
      found.set(product, months ?? found.get(product) ?? null);
      break;
    }
  }

  // 2. For non-pipe lines, process line-by-line for full multi-word items, prefix quantities and numbers
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.includes('|'));
  for (const line of lines) {
    let matched = false;
    // Check if line has a warranty tag
    for (const lang of LANGUAGES) {
      const tagged = line.match(
        new RegExp(`^(.+?)\\s*(?:\\([\\w-]+\\)\\s*)?(\\d{1,3})[\\s-]*(${lang.monthUnit}|${lang.yearUnit})\\.?\\s*(?:${lang.warrantyWord})\\b`, 'i'),
      );
      if (tagged) {
        const months = toMonths(tagged[2], tagged[3], lang);
        // If line is a standalone warranty line (e.g. "Jótállás: 24 hó" or "Warranty: 2 years"), attach to previous product
        if (/^(?:jótállás|garancia|warranty|guarantee)\b\s*[:：]?$/i.test(tagged[1].trim())) {
          if (months && found.size > 0) {
            const lastKey = [...found.keys()].pop()!;
            if (found.get(lastKey) === null) {
              found.set(lastKey, months);
            }
          }
          matched = true;
          break;
        }
        const candidate = cleanProductName(tagged[1]);
        if (isProductName(candidate)) {
          found.set(candidate, months ?? found.get(candidate) ?? null);
          matched = true;
          break;
        }
      }
    }
    if (matched) continue;

    // Prefix quantity: "1x Name", "1 × Name", "1 db Name", "1 db. Name"
    const prefixQty = line.match(/^\s*(?:\d+[\.\)]\s+)?(\d+)\s*(?:[x×]|db|darab|db\.|pcs|qty)\s+(.+)$/i);
    if (prefixQty) {
      const candidate = cleanProductName(prefixQty[2]);
      if (isProductName(candidate)) {
        found.set(candidate, found.get(candidate) ?? null);
        continue;
      }
    }

    // Numbered list items: "1. Name", "2) Name"
    const numbered = line.match(/^\s*(\d+)[\.\)]\s+([A-ZÁÉÍÓÖŐÚÜŰ0-9].+)$/i);
    if (numbered && !/^\s*\d+[\.\)]\s*\d/.test(line)) {
      const candidate = cleanProductName(numbered[2]);
      if (isProductName(candidate)) {
        found.set(candidate, found.get(candidate) ?? null);
        continue;
      }
    }

    // Labelled items: "Termék: Name", "Megnevezés: Name", "Termék megnevezése: Name", "Item: Name"
    const labelled = line.match(/^(?:termék(?:\s*megnevezése|\s*neve)?|megnevezés|tétel(?:\s*megnevezése)?|cikk(?:\s*megnevezése)?|item(?:\s*name)?|product(?:\s*name)?|description)\s*[:：-]\s*(.+)$/i);
    if (labelled) {
      const candidate = cleanProductName(labelled[1]);
      if (isProductName(candidate)) {
        found.set(candidate, found.get(candidate) ?? null);
        continue;
      }
    }

    // Suffix quantity: "Name 1 db", "Name × 2"
    for (const lang of LANGUAGES) {
      const suffixQty = line.match(new RegExp(`^(.+?)\\s+(?:[x×]\\s*\\d+|\\d+\\s*[x×]|\\d+\\s*(?:${lang.quantityUnit}))(?:\\s+.*)?$`, 'i'));
      if (suffixQty) {
        const candidate = cleanProductName(suffixQty[1]);
        if (isProductName(candidate)) {
          found.set(candidate, found.get(candidate) ?? null);
          break;
        }
      }
    }
  }

  return [...found].map(([name, months]) => ({ name, months }));
}

function isProductName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return false;
  // A name ending in a filler word is a sentence ("comes with a 2-year warranty"), not a line item.
  const sentence = /\s(a|an|the|with|has|includes|az|egy|és|and)$/i.test(trimmed);
  const hasLetters = /\p{L}{2}/u.test(trimmed);
  const isNonProduct = LANGUAGES.some((l) => l.nonProduct.test(trimmed));
  const isMetadata = /^(?:adószám|számlaszám|bizonylatszám|dátum|teljesítés|fizetési|vevő|szállító|cím|iban|swift|kelt|date|invoice|total|tax|egységár|ár|mennyiség|összesen|végösszeg|subtotal|price|qty|unit\s*price|quantity|jótállás|garancia|warranty|guarantee)\s*[:：]/i.test(trimmed);
  return hasLetters && !sentence && !isNonProduct && !isMetadata;
}

function findContactEmail(msg: MailMessage, text: string, storeDomain: string): string | null {
  const own = new Set(msg.to.map((t) => t.toLowerCase()));
  const candidates = [msg.from, ...(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])].map((e) => e.toLowerCase());
  return candidates.find((e) => !NOREPLY.test(e) && !own.has(e) && registrableDomain(e) === storeDomain) ?? null;
}

// "+36 30 373 88 36", "(06-1) 319-0250", "06 1 234 5678"
const PHONE = /(?:\+\d{1,3}[\s-]?|\(0\d[-\s]?\d{0,2}\)\s?|\b06[-\s])\d[\d\s/-]{5,14}\d/;
