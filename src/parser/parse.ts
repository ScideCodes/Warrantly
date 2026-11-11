import { DEFAULT_WARRANTY_MONTHS, IGNORED_DOMAINS, LANGUAGES, type LanguageKeywords } from './keywords.ts';
import type { Item, Kind, MailMessage, ParseResult, RequiredField, Status, StoreRules } from './types.ts';

const NOREPLY = /no-?reply|do-?not-?reply/i;

// Brainstorm section 8, steps 1, 2 and 4: classify the mail, extract from the body, and
// report missing required fields. Step 3 (PDF text) runs later on `pdfAttachments`.
export function parseEmail(msg: MailMessage, storeRules: StoreRules = {}): ParseResult {
  const text = cleanText(msg.text);
  const all = `${msg.subject}\n${text}`;
  const storeDomain = registrableDomain(msg.from);
  const purchaseDate = msg.date.slice(0, 10);
  const orderNumber = findOrderNumber(msg.subject) ?? findOrderNumber(text);
  const pdfAttachments = msg.attachments
    .filter((a) => a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.filename))
    .map((a) => a.filename);
  const deliveredDate = LANGUAGES.some((l) => l.delivered.test(all)) ? purchaseDate : null;

  let kind: Kind;
  if (IGNORED_DOMAINS.has(storeDomain)) kind = 'ignored';
  else if (LANGUAGES.some((l) => l.returned.test(all))) kind = 'return';
  else kind = 'purchase';

  const emailMonths = findWarrantyMonths(all);
  const ruleMonths = storeRules[storeDomain]?.defaultWarrantyMonths ?? null;
  const items: Item[] = findItems(text).map(({ name, months }) => {
    if (months) return { name, warrantyMonths: months, warrantySource: 'email' };
    if (emailMonths) return { name, warrantyMonths: emailMonths, warrantySource: 'email' };
    if (ruleMonths) return { name, warrantyMonths: ruleMonths, warrantySource: 'store_rule' };
    return { name, warrantyMonths: null, warrantySource: null };
  });

  // A purchase needs a purchase word plus something concrete; newsletters that only
  // mention "rendelés" or "order" have none of these.
  const isPurchase = LANGUAGES.some((l) => l.purchase.test(all)) && (orderNumber || items.length || pdfAttachments.length);
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
    .map((p) => p.replace(/[ \t]*\n[ \t]*/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// shortcut: takes the last two labels, wrong for "co.uk"-style suffixes. Upgrade to a
// public-suffix list when a store on such a domain shows up.
export function registrableDomain(email: string): string {
  return email.toLowerCase().split('@').pop()!.split('.').slice(-2).join('.');
}

const ORDER_PATTERNS = [
  /\b(?:order|megrendelés|rendelés)\w*\s*(?:#|no\.?|number|nr\.?|id|száma|azonosító(?:ja)?)?\s*[:#]?\s*([A-Z0-9][\w/.-]*\d[\w/-]*)/i,
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

// Line items are recognised by a quantity marker ("1x Name", "Name × 1", "Name 1 db") or
// by a warranty tag right after the name ("Name (sku) 24 hó gar."). Store templates
// (section 8, later) will handle layouts these generic markers miss.
export function findItems(text: string): { name: string; months: number | null }[] {
  const found = new Map<string, number | null>();
  const segments = text.split(/\n|\s*\|\s*|\s{2,}|\t/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    for (const lang of LANGUAGES) {
      const tagged = seg.match(
        new RegExp(`^(.+?)\\s*(?:\\([\\w-]+\\)\\s*)?(\\d{1,3})[\\s-]*(${lang.monthUnit}|${lang.yearUnit})\\.?\\s*(?:${lang.warrantyWord})`, 'i'),
      );
      const name =
        tagged?.[1] ??
        seg.match(/^\d+\s*x\s+(.+)$/i)?.[1] ??
        seg.match(/^(.+?)\s*×\s*\d+\b/)?.[1] ?? // a variant line ("Black / XL") may follow
        seg.match(new RegExp(`^(.+?)\\s+\\d+\\s*(?:${lang.quantityUnit})\\b`, 'i'))?.[1];
      if (!name || !isProductName(name)) continue;
      found.set(name.trim(), tagged ? toMonths(tagged[2], tagged[3], lang) : null);
      break;
    }
  }
  return [...found].map(([name, months]) => ({ name, months }));
}

function isProductName(name: string): boolean {
  // A name ending in a filler word is a sentence ("comes with a 2-year warranty"), not a line item.
  const sentence = /\s(a|an|the|with|has|includes|az|egy)$/i.test(name.trim());
  return /\p{L}{2}/u.test(name) && !sentence && !name.includes(':') && !LANGUAGES.some((l) => l.nonProduct.test(name));
}

function findContactEmail(msg: MailMessage, text: string, storeDomain: string): string | null {
  const own = new Set(msg.to.map((t) => t.toLowerCase()));
  const candidates = [msg.from, ...(text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])].map((e) => e.toLowerCase());
  return candidates.find((e) => !NOREPLY.test(e) && !own.has(e) && registrableDomain(e) === storeDomain) ?? null;
}

// "+36 30 373 88 36", "(06-1) 319-0250", "06 1 234 5678"
const PHONE = /(?:\+\d{1,3}[\s-]?|\(0\d[-\s]?\d{0,2}\)\s?|\b06[-\s])\d[\d\s/-]{5,14}\d/;
