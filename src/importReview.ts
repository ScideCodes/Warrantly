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

// Cleanly formats raw OCR / document text into human-readable flowing paragraphs.
// Fixes vertical word waterfalls, joins broken phrases, unbreaks hyphenated line wraps,
// and preserves genuine headings, bullet points, and key-value pairs.
export function formatSourceText(raw: string): string {
  if (!raw || !raw.trim()) return '';

  // 1. Normalize line endings and whitespace artifacts
  let text = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\u00A0\u200B\u200E\u200F]/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

  // 2. Un-break words split with hyphen at line break: e.g. "certifi-\ncate" -> "certificate"
  text = text.replace(/(\b[\p{L}\d]+)-[ \t]*\n[ \t]*([\p{L}\d]+\b)/gu, '$1$2');

  // 3. Process blocks split by blank lines (paragraphs)
  const blocks = text.split(/\n\s*\n+/);

  const formattedBlocks = blocks.map((block) => {
    const rawLines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!rawLines.length) return '';

    const lines: string[] = [];
    let current = '';

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const isBullet = /^[-*•·]\s+|^\d{1,2}[.)]\s+(?!\d{1,2}[.)])/.test(line);
      const isTableOrSep = line.includes('|') || /^[=\-_]{3,}$/.test(line);
      const isNewKey = line.endsWith(':');
      const prevEndsWithColon = current.endsWith(':');
      const prevEndsWithTerminator = /[.!?]$/.test(current);

      if (!current) {
        current = line;
      } else if (isBullet || isTableOrSep || isNewKey) {
        lines.push(current);
        current = line;
      } else if (prevEndsWithColon) {
        current = `${current} ${line}`;
      } else if (prevEndsWithTerminator && current.length < 50 && (/^[A-ZÁÉÍÓÖŐÚÜŰ]/.test(line) || isBullet)) {
        lines.push(current);
        current = line;
      } else {
        current = `${current} ${line}`;
      }
    }
    if (current) lines.push(current);

    return lines.join('\n');
  }).filter(Boolean);

  let result = formattedBlocks.join('\n\n');

  // 4. Clean up spaces around punctuation and multiple spaces
  result = result
    .replace(/[ \t]+/g, ' ')
    .replace(/ ([,\.!:;?])/g, '$1')
    .replace(/([(\[{]) /g, '$1')
    .replace(/ ([)\]}])/g, '$1')
    .trim();

  return result;
}

// Evidence is a real, cleanly formatted excerpt, never generated prose or a fabricated confidence percentage.
export function sourceExcerpt(text: string, value: string): string | null {
  if (!value || !value.trim()) return null;
  const formatted = formatSourceText(text);
  const target = value.trim().toLocaleLowerCase();
  const lower = formatted.toLocaleLowerCase();
  let at = lower.indexOf(target);

  if (at < 0) {
    const words = target.split(/\s+/).filter(w => w.length >= 3);
    if (!words.length) return null;
    at = lower.indexOf(words[0]);
    if (at < 0) return null;
  }

  const windowStart = Math.max(0, at - 100);
  const beforeSlice = formatted.slice(windowStart, at);
  const lastBreak = Math.max(
    beforeSlice.lastIndexOf('\n\n'),
    beforeSlice.lastIndexOf('\n'),
    beforeSlice.lastIndexOf('. '),
    beforeSlice.lastIndexOf('! '),
    beforeSlice.lastIndexOf('? '),
  );
  let start = windowStart;
  if (lastBreak >= 0) {
    start = windowStart + lastBreak + (beforeSlice[lastBreak] === '\n' ? 1 : 2);
  } else if (windowStart > 0) {
    const spaceIndex = beforeSlice.indexOf(' ');
    if (spaceIndex >= 0) start = windowStart + spaceIndex + 1;
  }

  const searchAfter = Math.max(at + value.trim().length, start);
  const windowEnd = Math.min(formatted.length, searchAfter + 140);
  const afterSlice = formatted.slice(searchAfter, windowEnd);
  const nextBreak = afterSlice.search(/\n|\. |\! |\? /);
  let end = windowEnd;
  if (nextBreak >= 0) {
    end = searchAfter + nextBreak + (afterSlice[nextBreak] === '\n' ? 0 : 1);
  } else if (windowEnd < formatted.length) {
    const lastSpace = afterSlice.lastIndexOf(' ');
    if (lastSpace >= 0) end = searchAfter + lastSpace;
  }

  let excerpt = formatted.slice(start, end).trim();
  if (start > 0 && !excerpt.startsWith('...')) excerpt = `... ${excerpt}`;
  if (end < formatted.length && !excerpt.endsWith('...')) excerpt = `${excerpt} ...`;
  return excerpt;
}
