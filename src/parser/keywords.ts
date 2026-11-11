// Per-language keyword sets (brainstorm section 3). Mail is matched against every
// language, because it is parsed in the language it arrives in, not the app language.
// To add a language, add one entry to LANGUAGES.

export interface LanguageKeywords {
  searchTerms: string[]; // Gmail search words that find candidate mails (section 7)
  purchase: RegExp; // order, invoice, receipt words
  returned: RegExp; // cancellation, refund, return words (specific phrases, not footer links)
  delivered: RegExp; // goods arrived or were picked up
  monthUnit: string; // regex alternation for "month" words
  yearUnit: string;
  warrantyWord: string; // regex alternation for "warranty" words
  quantityUnit: string; // "pcs" words that follow a quantity, e.g. "1 db"
  nonProduct: RegExp; // line items that are not products (shipping, vouchers, fees)
}

const en: LanguageKeywords = {
  searchTerms: ['warranty', 'guarantee', 'receipt', 'invoice', '"order confirmation"', '"your order"', 'refund', 'cancelled'],
  purchase: /\b(order|invoice|receipt|purchase)\b/i,
  returned:
    /\b(refund(ed)? (has been|was) (issued|approved|processed)|refund (has been|was) approved|order (has been|was) (cancel+ed)|cancel+ation confirmed|return (has been|was) (received|accepted))\b|\bissued a refund\b/i,
  delivered: /\b(has been delivered|was delivered|delivered to you|picked up)\b/i,
  monthUnit: 'months?|mo\\.',
  yearUnit: 'years?|yrs?',
  warrantyWord: 'warranty|guarantee',
  quantityUnit: 'pcs',
  nonProduct: /\b(shipping|delivery|payment|voucher|gift card|discount|fee)\b/i,
};

const hu: LanguageKeywords = {
  searchTerms: ['garancia', 'jótállás', 'számla', 'rendelés', 'megrendelés', 'visszatérítés', 'törölve'],
  purchase: /(megrendel|rendelés|számla|számlá|vásárl|nyugta|bizonylat)/i,
  returned:
    /(új állapota:\s*törölve|rendelés(ed|ét|e)? (törölve|törölték|töröltük|lemondva)|visszatérít|stornó|elállás(od|i nyilatkozat)? (elfogad|feldolgoz))/i,
  delivered: /(megérkezett|vedd át|átvetted|kézbesítettük|kézbesítve)/i,
  monthUnit: 'hónap|hó',
  yearUnit: 'év',
  warrantyWord: 'garancia|garanciá|gar\\.|gar\\b|jótállás',
  quantityUnit: 'db|darab',
  nonProduct: /(szállítás|kiszállítás|fizetés|utalvány|ajándék|kupon|kedvezmény|díj)/i,
};

export const LANGUAGES: LanguageKeywords[] = [en, hu];

// shortcut: hard-coded sender domains for digital goods and food, which never carry a
// product warranty. Upgrade to a user-editable "always ignore this store" list in the
// Ignored screen when that screen is built.
export const IGNORED_DOMAINS = new Set([
  'steampowered.com',
  'epicgames.com',
  'google.com', // Google Play receipts
  'youtube.com',
  'xsolla.com',
  'g2g.com',
  'foodora.hu',
  'wolt.com',
  'pizzahut.hu',
]);

export const DEFAULT_WARRANTY_MONTHS = 24; // EU 2-year legal guarantee, always shown as suggested
