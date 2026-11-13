// Likely duplicates (shortlist 10): the same purchase entered twice (a Gmail import and a scan, or a manual
// entry). Only suggested with the reasons shown; the user decides. Pure, tested in Node.
import { daysUntil, plain } from './warranty.ts';

export type MatchReason = 'order' | 'serial' | 'name' | 'store' | 'date';
export interface DuplicatePair<W> { a: W; b: W; reasons: MatchReason[] }

interface Item {
  id: number;
  product_name: string | null;
  store_name: string;
  purchase_date: string;
  order_number: string | null;
  serial_number: string | null;
  coverage: string | null;
  bundle_id: number | null;
  status: string;
}

const code = (s: string | null) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = (s: string | null) => plain(s ?? '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
const DAYS = 14;

// Same order or serial number is a strong sign on its own. The same product name counts only together with
// the same store or purchase dates at most 14 days apart. Never a pair: different covers (an extended plan
// beside the standard one), two products of one bundle, ignored mails, or a pair the user said is not one.
export function duplicatePairs<W extends Item>(list: W[], dismissed: Set<string>): DuplicatePair<W>[] {
  const out: DuplicatePair<W>[] = [];
  const items = list.filter((w) => w.status !== 'ignored');
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const [a, b] = items[i].id < items[j].id ? [items[i], items[j]] : [items[j], items[i]];
      if (dismissed.has(`${a.id}:${b.id}`)) continue;
      if ((a.coverage ?? null) !== (b.coverage ?? null)) continue;
      if (a.bundle_id !== null && a.bundle_id === b.bundle_id) continue;
      const reasons: MatchReason[] = [];
      if (code(a.order_number).length >= 4 && code(a.order_number) === code(b.order_number)) reasons.push('order');
      if (code(a.serial_number).length >= 4 && code(a.serial_number) === code(b.serial_number)) reasons.push('serial');
      const wa = words(a.product_name), wb = words(b.product_name);
      const sameName = wa.length > 0 && wb.length > 0 && (wa.join(' ') === wb.join(' ') || (Math.min(wa.length, wb.length) >= 2 && contains(wa, wb)));
      const sameStore = plain(a.store_name).trim() === plain(b.store_name).trim();
      const closeDates = Math.abs(daysUntil(a.purchase_date, b.purchase_date)) <= DAYS;
      if (sameName) reasons.push('name');
      if (sameStore) reasons.push('store');
      if (closeDates) reasons.push('date');
      const strong = reasons.includes('order') || reasons.includes('serial');
      if (strong || (sameName && (sameStore || closeDates))) out.push({ a, b, reasons });
    }
  }
  return out;
}

// One name's words all appear in the other, in order ("Bosch Serie 6 WAU28PH9BY" in the long shop name).
function contains(a: string[], b: string[]): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let k = 0;
  for (const w of long) if (w === short[k]) k++;
  return k === short.length;
}
