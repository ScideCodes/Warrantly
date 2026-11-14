import { findItems, cleanText } from './parser/parse.ts';
import { parseScanText } from './parser/scan.ts';
import { formErrors } from './warranty.ts';

export type ReviewProduct = { original: string; name: string; months: string; selected: boolean; remembered?: boolean };
export type ReviewDraft = { store: string; date: string; order: string; products: ReviewProduct[] };
export type ShopChoices = Record<string, { name: string; months?: string }>;
export const shopKey = (name: string) => name.normalize('NFC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');

export function reviewDraft(text: string, today: string, choices: ShopChoices = {}): ReviewDraft {
  const scan = parseScanText(text, today);
  const joined = findItems(cleanText(text));
  const lines = findItems(text);
  // OCR keeps separate printed lines without paragraph breaks. Joining all of them can hide
  // several warranty-tagged products behind the receipt header. Keep the more complete reading.
  const items = lines.length > joined.length ? lines : joined;
  return {
    store: scan.storeName ?? '', date: scan.purchaseDate ?? '', order: scan.orderNumber ?? '',
    products: (items.length ? items : [{ name: '', months: scan.warrantyMonths }]).map(item => {
      const choice = Object.hasOwn(choices, shopKey(item.name)) ? choices[shopKey(item.name)] : undefined;
      return { original: item.name, name: choice?.name ?? item.name, months: choice?.months ?? (item.months ?? (items.length <= 1 ? scan.warrantyMonths : null))?.toString() ?? '', selected: true, remembered: !!choice };
    }),
  };
}

export function reviewValid(draft: ReviewDraft): boolean {
  const chosen = draft.products.filter(p => p.selected);
  return chosen.length > 0 && chosen.length <= 100 && chosen.every(p => /^(?:[1-9]|[1-9]\d|1[01]\d|120)$/.test(p.months) && formErrors({ product_name: p.name, store_name: draft.store, purchase_date: draft.date, warranty_start_date: '', warranty_months: p.months }).length === 0);
}

// Only explicit, confirmed product corrections; never extrapolate one item's length to the whole shop.
export function correctedChoices(products: ReviewProduct[]): ShopChoices {
  return Object.fromEntries(products.filter(p => p.selected && p.original.trim()).map(p => [shopKey(p.original), { name: p.name.trim(), months: p.months }]));
}

// Evidence is a real excerpt, never generated prose or a fabricated confidence percentage.
export function sourceExcerpt(text: string, value: string): string | null {
  if (!value.trim()) return null;
  const at = text.toLocaleLowerCase().indexOf(value.toLocaleLowerCase());
  return at < 0 ? null : text.slice(Math.max(0, at - 90), Math.min(text.length, at + value.length + 140)).trim();
}
