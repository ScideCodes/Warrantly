// Home list views (shortlist 1, 3, 4): sort orders, quick filters and the summary counts. Pure, tested in Node.
import { daysUntil, plain } from './warranty.ts';

// "Expiring soon" everywhere in the app: cover ends within 30 days (today included).
export const EXPIRING_DAYS = 30;

export const SORT_KEYS = ['expiry', 'added', 'price', 'name'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type QuickFilter = 'expiring' | 'nodocs' | null;

interface Item {
  id: number;
  product_name: string | null;
  end_date: string;
  created_at: string;
  price: number | null;
  currency: string | null;
  doc_count: number;
}

// expiry: soonest end first. added: newest first. name: A-Z, accents ignored.
// price: no currency conversion is made, so prices are grouped by currency (A-Z), highest first inside a
// currency; items without a price come last. Every order ends on the id, so equal items never swap.
export function sortWarranties<W extends Item>(list: W[], key: SortKey): W[] {
  const byName = (a: W, b: W) => plain(a.product_name ?? '').localeCompare(plain(b.product_name ?? ''));
  const cmp: Record<SortKey, (a: W, b: W) => number> = {
    expiry: (a, b) => a.end_date.localeCompare(b.end_date) || byName(a, b),
    added: (a, b) => b.created_at.localeCompare(a.created_at),
    name: (a, b) => byName(a, b),
    price: (a, b) => {
      const pa = a.price !== null && a.currency ? 0 : 1, pb = b.price !== null && b.currency ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (pa === 1) return 0;
      return a.currency!.localeCompare(b.currency!) || b.price! - a.price!;
    },
  };
  return [...list].sort((a, b) => cmp[key](a, b) || a.id - b.id);
}

export function quickFilter<W extends Item>(list: W[], f: QuickFilter, today: string): W[] {
  if (f === 'expiring') return list.filter((w) => w.end_date >= today && daysUntil(w.end_date, today) <= EXPIRING_DAYS);
  if (f === 'nodocs') return list.filter((w) => w.doc_count === 0);
  return list;
}

// The slim summary above the list: still covered, ending within 30 days, and covered ones with no document.
export function summary(list: Item[], today: string): { covered: number; expiring: number; noDocs: number } {
  let covered = 0, expiring = 0, noDocs = 0;
  for (const w of list) {
    if (w.end_date < today) continue;
    covered++;
    if (daysUntil(w.end_date, today) <= EXPIRING_DAYS) expiring++;
    if (w.doc_count === 0) noDocs++;
  }
  return { covered, expiring, noDocs };
}

// Pinned items are shown once, in their own group at the top, in the chosen order; filters and search apply
// to them like to any other item. Expired pinned items stay with the expired ones.
export function splitPinned<W extends { favorite: number; end_date: string }>(list: W[], today: string): { pinned: W[]; rest: W[] } {
  const pinned: W[] = [], rest: W[] = [];
  for (const w of list) (w.favorite && w.end_date >= today ? pinned : rest).push(w);
  return { pinned, rest };
}
