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
