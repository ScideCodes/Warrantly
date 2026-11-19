import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { calendarDate, dateFormat, initialDate, monthDays } from './calendar.ts';

test('calendar handles leap years, month ends and local dates', () => {
  assert.equal(monthDays(2024, 1, true).filter(Boolean).length, 29);
  assert.equal(monthDays(2025, 1, true).filter(Boolean).length, 28);
  assert.equal(monthDays(2026, 10, false)[0], '2026-11-01');
  assert.equal(monthDays(2026, 10, true)[6], '2026-11-01');
  assert.equal(monthDays(2026, 11, true).at(-1), '2026-12-31');
  for (const date of ['2026-03-29', '2026-10-25', '2024-02-29']) {
    const parsed = calendarDate(date);
    assert.equal(parsed.getDate(), Number(date.slice(-2)));
    assert.equal(parsed.getHours(), 12);
  }
});
test('reminder picker starts on the minimum date and preserves valid future dates', () => {
  assert.equal(initialDate('2026-01-01', '2026-11-15'), '2026-11-15');
  assert.equal(initialDate('2027-01-01', '2026-11-15'), '2027-01-01');
  assert.equal(initialDate('2026-11-15', '2026-11-15'), '2026-11-15');
});
test('cached date formats match toLocaleDateString and are reused', () => {
  const date = new Date(2026, 10, 19, 12);
  for (const [locale, options] of [['hu-HU', { dateStyle: 'full' }], ['en-US', { month: 'long' }], ['en', { year: 'numeric', month: 'short', day: 'numeric' }]] as const) {
    assert.equal(dateFormat(locale, options).format(date), date.toLocaleDateString(locale, options));
    assert.equal(dateFormat(locale, options), dateFormat(locale, { ...options }));
  }
});
