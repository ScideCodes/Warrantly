import { isValidYmd, todayYmd } from './warranty.ts';

export function calendarDate(value: string): Date {
  const [y, m, d] = (isValidYmd(value) ? value : todayYmd()).split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}
export function monthDays(year: number, month: number, mondayFirst: boolean): (string | null)[] {
  const offset = (new Date(year, month, 1, 12).getDay() + (mondayFirst ? 6 : 0)) % 7;
  const count = new Date(year, month + 1, 0, 12).getDate();
  return [...Array<null>(offset).fill(null), ...Array.from({ length: count }, (_, i) => todayYmd(new Date(year, month, i + 1, 12)))];
}
export function initialDate(value: string, minimum?: string): string {
  const date = isValidYmd(value) ? value : todayYmd();
  return minimum && isValidYmd(minimum) && date < minimum ? minimum : date;
}

// Hermes on Android builds a new ICU formatter on every toLocaleDateString call; reuse one per locale and options.
const dateFormats = new Map<string, Intl.DateTimeFormat>();
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) dateFormats.set(key, (format = new Intl.DateTimeFormat(locale, options)));
  return format;
}
