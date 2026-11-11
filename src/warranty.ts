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
