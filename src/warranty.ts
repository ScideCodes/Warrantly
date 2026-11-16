// Date logic for warranties. Dates are plain "YYYY-MM-DD" strings in the phone's local
// calendar; days left and "how long ago" are always computed, never stored (section 12).

const pad = (n: number) => String(n).padStart(2, '0');
const toYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayYmd = (now = new Date()) => toYmd(now);

// Last day of cover: start + N months, clamped to month end (2026-01-31 + 1 month = 2026-02-28).
export function endDate(start: string, months: number): string {
  const s = fromYmd(start);
  const target = new Date(s.getFullYear(), s.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toYmd(new Date(target.getFullYear(), target.getMonth(), Math.min(s.getDate(), lastDay)));
}

// Whole calendar days from today to `ymd` (negative once it is past). Math.round absorbs DST hours.
export function daysUntil(ymd: string, today: string): number {
  return Math.round((fromYmd(ymd).getTime() - fromYmd(today).getTime()) / 86_400_000);
}

// Color bucket for the days-left pill. Day 0 (expires today) still counts as active (section 10).
export type Urgency = 'ok' | 'warning' | 'soon' | 'expired';
export function urgency(daysLeft: number): Urgency {
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'soon';
  if (daysLeft <= 90) return 'warning';
  return 'ok';
}

// "How long ago" as a count and unit for i18n plurals.
export function ago(ymd: string, today: string): { unit: 'days' | 'months' | 'years'; count: number } {
  const days = Math.max(0, -daysUntil(ymd, today));
  if (days < 31) return { unit: 'days', count: days };
  const a = fromYmd(ymd);
  const b = fromYmd(today);
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);
  return months < 12 ? { unit: 'months', count: Math.max(1, months) } : { unit: 'years', count: Math.floor(months / 12) };
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toYmd(fromYmd(s)) === s; // rejects 2026-02-30
}

export type FormField = 'product_name' | 'store_name' | 'purchase_date' | 'warranty_start_date' | 'warranty_months';

// Form check for manual add and edit: required fields, real dates, 1-120 months, start not before purchase.
export function formErrors(f: { product_name: string; store_name: string; purchase_date: string; warranty_start_date: string; warranty_months: string }): FormField[] {
  const errors: FormField[] = [];
  if (!f.product_name.trim()) errors.push('product_name');
  if (!f.store_name.trim()) errors.push('store_name');
  if (!isValidYmd(f.purchase_date)) errors.push('purchase_date');
  if (f.warranty_start_date && (!isValidYmd(f.warranty_start_date) || (isValidYmd(f.purchase_date) && f.warranty_start_date < f.purchase_date))) {
    errors.push('warranty_start_date');
  }
  const months = Number(f.warranty_months);
  if (!Number.isInteger(months) || months < 1 || months > 120) errors.push('warranty_months');
  return errors;
}

// Shop product names are long: "Jonsbo D300 - fekete, 270°-Tempered Glass (D300 BLACK)". For the list,
// drop bracketed codes, quantity prefixes ("1x", "1 db", "1."), trailing "12+" (from "12+12 hó gar."), cut at
// the first " - ", " / ", " | " or ", " when two words remain, then keep at most 3 words, stopping after
// the model code (word with a digit, "D300") but keeping at least 2 words if available.
export function shortName(name: string): string {
  const stripped = name.replace(/^\s*(?:\d+[\.\)]\s+|\d+\s*(?:[x×]|db|darab|pcs)\s+)/i, '');
  const base = stripped.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+\d+\+$/, '').trim();
  const head = base.split(/\s+[-–|/]\s+|,\s+/)[0].trim();
  const words = (head.split(/\s+/).length >= 2 ? head : base).split(/\s+/).filter(Boolean);
  if (words.length <= 2) return words.join(' ');
  const model = words.findIndex((w) => /\d/.test(w));
  const take = model > 0 && model < 3 ? model + 1 : Math.min(3, words.length);
  return words.slice(0, take).join(' ');
}

// Expiry reminders (section 16): 90, 60 and 30 days before, then weekly until expiry, and on the day.
// Each group can be switched off in Settings.
export const REMINDER_GROUPS = { '90': [90], '60': [60], '30': [30], weekly: [23, 16, 9, 2], daily: Array.from({ length: 30 }, (_, i) => i), '0': [0] } as const;
export type ReminderGroup = keyof typeof REMINDER_GROUPS;
export const ALL_GROUPS: ReminderGroup[] = ['90', '60', '30', 'weekly', '0']; // listed, not Object.keys: number-like keys sort first
export const reminderDays = (groups: readonly ReminderGroup[]): number[] => [...new Set(groups.flatMap((g) => REMINDER_GROUPS[g]))];
const REMINDER_DAYS = reminderDays(ALL_GROUPS);

export interface Reminder {
  warrantyId: number;
  kind: 'expiry' | 'return' | 'custom';
  date: string; // YYYY-MM-DD, delivered at a fixed local time
  daysLeft: number;
}

// EU right of withdrawal: 14 days from delivery for online purchases. Mail imports are online orders;
// their start date is the delivery day when the mail says so, else the order day.
export const RETURN_DAYS = 14;
const RETURN_WARNING = 2; // days before the window closes
export const returnDeadline = (w: { origin: string; warranty_start_date: string; return_by?: string | null }): string | null =>
  w.return_by === '' ? null : w.return_by && isValidYmd(w.return_by) ? w.return_by :
    w.origin === 'gmail' ? addDays(w.warranty_start_date, RETURN_DAYS) : null;

// The nearest `limit` reminders from today on, over all warranties. Only these are scheduled, because iOS
// keeps at most 64 pending notifications; the plan is rebuilt on every app open, sync and edit (rolling
// window). Today's are included: the caller drops them once their time of day has passed.
// `return_by` adds one reminder two days before the return window closes.
// `custom`: per-product dates the user set (shortlist 12), on top of these; only for warranties in the list,
// and a custom date that falls on the same day as another reminder of that product is sent once.
export function reminderPlan(
  warranties: { id: number; end_date: string; return_by?: string | null }[],
  today: string,
  limit = 60,
  days: number[] = REMINDER_DAYS,
  custom: { warrantyId: number; date: string }[] = [],
): Reminder[] {
  const known = new Set(warranties.map((w) => w.id));
  const plan = warranties
    .flatMap((w): Reminder[] => [
      ...days.map((daysLeft) => ({ warrantyId: w.id, kind: 'expiry' as const, daysLeft, date: addDays(w.end_date, -daysLeft) })),
      ...(w.return_by ? [{ warrantyId: w.id, kind: 'return' as const, daysLeft: RETURN_WARNING, date: addDays(w.return_by, -RETURN_WARNING) }] : []),
    ]);
  const taken = new Set(plan.map((r) => `${r.warrantyId}:${r.date}`));
  for (const c of custom) {
    if (!known.has(c.warrantyId) || taken.has(`${c.warrantyId}:${c.date}`)) continue;
    taken.add(`${c.warrantyId}:${c.date}`);
    plan.push({ warrantyId: c.warrantyId, kind: 'custom', daysLeft: 0, date: c.date });
  }
  return plan
    .filter((r) => r.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.warrantyId - b.warrantyId)
    .slice(0, limit);
}

function addDays(ymd: string, days: number): string {
  const d = fromYmd(ymd);
  d.setDate(d.getDate() + days);
  return toYmd(d);
}

// --- Search and filters (section 13) ---

// Lower-case without Hungarian/common accents, so "vizforralo" finds "vízforraló". A fixed map instead of
// String.normalize, which not every JS engine build ships.
const PLAIN: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ö: 'o', ő: 'o', ú: 'u', ü: 'u', ű: 'u', ä: 'a', ß: 'ss' };
export const plain = (s: string): string => s.toLowerCase().replace(/[áéíóöőúüűäß]/g, (c) => PLAIN[c]);

// Fixed categories (keys; names are translated). Stored on the warranty as the key.
export const CATEGORIES = ['electronics', 'computers', 'phones', 'appliances', 'home', 'tools', 'vehicles', 'other'] as const;

// Icon for a product in the list (MaterialCommunityIcons names): the first keyword found in the
// name wins, then the category, then a parcel. Keywords are plain (no accents), English and Hungarian.
const PRODUCT_ICONS: [RegExp, string][] = [
  [/mosogatogep|dishwasher/, 'dishwasher'],
  [/mosogep|washing|washer|szarito|dryer/, 'washing-machine'],
  [/huto|fridge|refrigerator|fagyaszto|freezer/, 'fridge-outline'],
  [/porszivo|vacuum|roomba/, 'vacuum-outline'],
  [/mikro|microwave/, 'microwave'],
  [/kave|coffee|espresso/, 'coffee-maker-outline'],
  [/telefon|phone|iphone|galaxy s|pixel|xiaomi|redmi/, 'cellphone'],
  [/tablet|ipad|galaxy tab/, 'tablet'],
  [/laptop|notebook|macbook|thinkpad|chromebook/, 'laptop'],
  [/monitor|kijelzo/, 'monitor'],
  [/tv|televizio|television|oled|qled/, 'television'],
  [/fulhallgato|headphone|earbud|airpods|buds|headset/, 'headphones'],
  [/hangszoro|speaker|soundbar|hangfal/, 'speaker'],
  [/ora|watch|okosora/, 'watch-variant'],
  [/kamera|camera|fenykepezo|gopro/, 'camera-outline'],
  [/konzol|playstation|ps5|xbox|switch|controller/, 'gamepad-variant-outline'],
  [/nyomtato|printer/, 'printer-outline'],
  [/furo|drill|csavarozo|flex|grinder|saw|fureszgep/, 'hammer-wrench'],
  [/kanape|sofa|couch|matrac|mattress|butor|furniture/, 'sofa-outline'],
  [/auto|kocsi|car |jarmu|vehicle|motor|scooter|roller|bicikli|kerekpar|bike/, 'car-outline'],
];
const CATEGORY_ICONS: Record<string, string> = {
  electronics: 'television',
  computers: 'laptop',
  phones: 'cellphone',
  appliances: 'washing-machine',
  home: 'sofa-outline',
  tools: 'hammer-wrench',
  vehicles: 'car-outline',
};
export function productIcon(name: string | null, category: string | null | undefined): string {
  const text = plain(name ?? '');
  for (const [re, icon] of PRODUCT_ICONS) if (re.test(text)) return icon;
  return (category && CATEGORY_ICONS[category]) || 'package-variant-closed';
}

// Sum of prices per currency, e.g. { HUF: 105263, EUR: 49.9 }. Items without a price are left out.
export function totalValue(list: { price: number | null; currency: string | null }[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const w of list) if (w.price !== null && w.currency) sums[w.currency] = (sums[w.currency] ?? 0) + w.price;
  return sums;
}

export interface ListFilter {
  query: string;
  store: string | null;
  category?: string | null;
  soon: boolean; // expiring within 30 days
  account: 'all' | 'manual' | number;
  tab: 'active' | 'expired';
}

export function filterWarranties<W extends { product_name: string | null; store_name: string; end_date: string; account_id: number | null; category?: string | null }>(
  list: W[],
  f: ListFilter,
  today: string,
): W[] {
  const words = plain(f.query).split(/\s+/).filter(Boolean);
  return list.filter((w) => {
    // ISO calendar dates sort chronologically; most filters need no Date allocations.
    if ((w.end_date >= today) !== (f.tab === 'active')) return false;
    if (f.account !== 'all' && (f.account === 'manual' ? w.account_id !== null : w.account_id !== f.account)) return false;
    if (f.store && w.store_name !== f.store) return false;
    if (f.category && w.category !== f.category) return false;
    if (f.soon && (w.end_date < today || daysUntil(w.end_date, today) > 30)) return false;
    if (!words.length) return true;
    const text = plain(`${w.product_name ?? ''} ${w.store_name}`);
    return words.every((word) => text.includes(word));
  });
}

// Count all filter choices together, once per data change rather than rescanning the
// entire library for every store/category each time the search field changes.
export function warrantyFacets(list: { account_id: number | null; category?: string | null; store_name: string }[]) {
  const accounts = new Map<number | 'manual', number>();
  const categories = new Map<string, number>();
  const stores = new Map<string, number>();
  for (const w of list) {
    const account = w.account_id ?? 'manual';
    accounts.set(account, (accounts.get(account) ?? 0) + 1);
    if (w.category) categories.set(w.category, (categories.get(w.category) ?? 0) + 1);
    stores.set(w.store_name, (stores.get(w.store_name) ?? 0) + 1);
  }
  return { total: list.length, accounts, categories, stores };
}
