// Per-language keyword sets (brainstorm section 3). Mail is matched against every
// language, because it is parsed in the language it arrives in, not the app language.
// To add a language, add one entry to LANGUAGES.

export interface LanguageKeywords {
  // A mail counts when it is a warranty document or states a warranty length for a product (the
  // owner's rule); plain invoices and order mails without a length do not. `documentTerms` go into the Gmail subject search; `document` checks the subject
  // and PDF file names of what comes back; `repair` drops warranty claim and repair updates.
  documentTerms: string[];
  document: RegExp;
  repair: RegExp;
  statedTerms: string[]; // Gmail body phrases for a stated warranty length, e.g. "24 hó gar."
  returnTerms: string[]; // Gmail body search for cancellations and refunds (section 11)
  returned: RegExp; // cancellation, refund, return words (specific phrases, not footer links)
  delivered: RegExp; // goods arrived or were picked up
  monthUnit: string; // regex alternation for "month" words
  yearUnit: string;
  warrantyWord: string; // regex alternation for "warranty" words
  quantityUnit: string; // "pcs" words that follow a quantity, e.g. "1 db"
  nonProduct: RegExp; // line items that are not products (shipping, vouchers, fees)
}

const en: LanguageKeywords = {
  documentTerms: ['warranty', 'guarantee'],
  document: /\b(warranty|guarantee)/i,
  repair: /\b(claim|repair|replacement|rma)\b/i,
  statedTerms: ['"months warranty"', '"month warranty"', '"year warranty"', '"years warranty"'],
  returnTerms: ['"refund has been"', '"refund was"', '"issued a refund"', '"order has been cancelled"', '"order was cancelled"'],
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
  documentTerms: ['garancia', 'garanciális', 'jótállás', 'jótállási', 'jotallas'],
  document: /(garanci|jótállás|jotallas)/i,
  repair: /(csere|beérkezett|ügyintézés|javítás|szerviz)/i,
  statedTerms: ['"hó gar"', '"hónap garancia"', '"hónap jótállás"', '"év garancia"', '"év jótállás"'],
  returnTerms: ['visszatérítés', '"állapota: törölve"', '"rendelés törölve"', 'stornó'],
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

// shortcut: hard-coded senders (domains or full addresses) for digital goods, food, services and
// payment receipts, which never carry a product warranty. Upgrade to a user-editable
// "always ignore this sender" list in the Ignored screen when that screen is built.
export const IGNORED_SENDERS = new Set([
  'steampowered.com',
  'epicgames.com',
  'google.com', // Google Play receipts
  'youtube.com',
  'xsolla.com',
  'g2g.com',
  'foodora.hu',
  'wolt.com',
  'pizzahut.hu',
  'paypal.com', // payment receipts; the shop's own invoice is the warranty proof
  'noreply_simple@szamlazz.hu', // SimplePay payment receipts (other szamlazz.hu mail are real shop invoices)
  'rackhost.hu', // web hosting
  'discord.com',
  'riotgames.com',
  'gls-hungary.com', // courier cash-on-delivery receipts, not the shop's invoice
  'otp.hu', // bank: "számla" also means bank account
  'szigetfestival.com',
]);

export const DEFAULT_WARRANTY_MONTHS = 24; // EU 2-year legal guarantee, always shown as suggested
