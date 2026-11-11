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
