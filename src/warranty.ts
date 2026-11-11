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
// drop bracketed codes and a trailing "12+" (from "12+12 hó gar."), cut at the first " - ", " / ", " | "
// or ", " when two words remain, then stop after the model code (first word with a digit, "D300") if it
// comes within 5 words; otherwise show 4 words and "…". The full name stays in the database.
export function shortName(name: string): string {
  const base = name.replace(/\s*[([][^)\]]*[)\]]/g, '').replace(/\s+\d+\+$/, '').trim();
  const head = base.split(/\s+[-–|/]\s+|,\s+/)[0].trim();
  const words = (head.split(/\s+/).length >= 2 ? head : base).split(/\s+/);
  const model = words.findIndex((w) => /\d/.test(w));
  if (model >= 0 && model < 5) return words.slice(0, model + 1).join(' ');
  return words.length > 5 ? `${words.slice(0, 4).join(' ')}…` : words.join(' ');
}

// Expiry reminders (section 16): 90, 60 and 30 days before, then weekly until expiry, and on the day.
const REMINDER_DAYS = [90, 60, 30, 23, 16, 9, 2, 0];

export interface Reminder {
  warrantyId: number;
  date: string; // YYYY-MM-DD, delivered at a fixed local time
  daysLeft: number;
}

// The nearest `limit` reminders from today on, over all warranties. Only these are scheduled, because iOS
// keeps at most 64 pending notifications; the plan is rebuilt on every app open, sync and edit (rolling
// window). Today's are included: the caller drops them once their time of day has passed.
export function reminderPlan(warranties: { id: number; end_date: string }[], today: string, limit = 60): Reminder[] {
  return warranties
    .flatMap((w) =>
      REMINDER_DAYS.map((daysLeft) => ({ warrantyId: w.id, daysLeft, date: addDays(w.end_date, -daysLeft) })).filter((r) => r.date >= today),
    )
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

export interface ListFilter {
  query: string;
  store: string | null;
  soon: boolean; // expiring within 30 days
  account: 'all' | 'manual' | number;
  tab: 'active' | 'expired';
}

export function filterWarranties<W extends { product_name: string | null; store_name: string; end_date: string; account_id: number | null }>(
  list: W[],
  f: ListFilter,
  today: string,
): W[] {
  const words = plain(f.query).split(/\s+/).filter(Boolean);
  return list.filter((w) => {
    const days = daysUntil(w.end_date, today);
    if ((days >= 0) !== (f.tab === 'active')) return false;
    if (f.account !== 'all' && (f.account === 'manual' ? w.account_id !== null : w.account_id !== f.account)) return false;
    if (f.store && w.store_name !== f.store) return false;
    if (f.soon && (days < 0 || days > 30)) return false;
    const text = plain(`${w.product_name ?? ''} ${w.store_name}`);
    return words.every((word) => text.includes(word));
  });
}
