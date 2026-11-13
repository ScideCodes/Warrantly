// Product pictures from Wikidata / Wikimedia Commons: the pure part (matching rules, queries, parsing), tested
// in Node. The network and file side is in productImageLookup.ts.
//
// Only high-confidence matches count. A candidate's name (label or alias) must be fully contained in the
// product name, have at least two words and include a model number, and the product name must not name a
// variant or generation the candidate lacks ("iPhone 15 Pro" never gets the "iPhone 15" picture). Accessories
// are never matched, nor are product series or lines. Anything else keeps the category icon.

export interface Candidate {
  id: string;
  names: string[]; // label first, then aliases
  description: string;
  image: string | null; // Commons file name (P18)
}

export interface PictureCredit {
  file: string; // Commons file name
  page: string; // Commons file page (author and licence live there)
  artist: string;
  license: string;
  v?: number; // LOOKUP_VERSION that found it
  clean?: boolean; // a transparent PNG cut-out, not a photo with its background
}

// Bump to look every existing warranty up again once (v2: transparent PNG cut-outs first). A "no match"
// result is stored as a credit with only `v`, so it is also retried after a bump.
export const LOOKUP_VERSION = 2;

const versionOf = (credit: string | null): number => {
  try {
    return (JSON.parse(credit ?? 'null') as { v?: number } | null)?.v ?? 1;
  } catch {
    return 1;
  }
};

type LookupFields = { product_name: string | null; photo_path: string | null; found_photo_key: string | null; found_photo_path: string | null; found_photo_credit: string | null };

// Whether a warranty needs a (new) lookup: never with the user's own photo or a picture the user removed.
export function needsLookup(w: LookupFields, exists: (path: string) => boolean): boolean {
  const key = lookupKey(w.product_name);
  if (!key || w.photo_path) return false;
  if (w.found_photo_key !== key) return true;
  if (w.found_photo_credit === 'removed') return false;
  if (versionOf(w.found_photo_credit) < LOOKUP_VERSION) return true;
  return !!w.found_photo_path && !exists(w.found_photo_path); // restored or cleared file
}

// Lower case, no accents, words of letters and digits only. "S24+" is the Plus model, not the S24.
export const words = (s: string): string[] =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

// The lookup key: a changed product name means a new lookup and a stale result is dropped.
export const lookupKey = (productName: string | null): string | null => {
  const w = words(productName ?? '');
  return w.length ? w.join(' ') : null;
};

// Accessories and parts would otherwise match the product they are for. English and Hungarian.
const ACCESSORY = new Set([
  'case', 'cover', 'sleeve', 'bag', 'pouch', 'charger', 'cable', 'adapter', 'dock', 'stand', 'holder', 'mount', 'strap', 'band',
  'protector', 'screen', 'film', 'glass', 'skin', 'replacement', 'spare', 'part', 'battery', 'filter', 'refill', 'cartridge', 'kit',
  'tok', 'tokja', 'tokot', 'folia', 'kijelzovedo', 'vedo', 'vedofolia', 'toltő', 'tolto', 'toltokabel', 'kabel', 'adapter', 'taska',
  'tarto', 'allvany', 'szij', 'pant', 'csere', 'alkatresz', 'akkumulator', 'akku', 'szuro', 'utantolto', 'patron', 'keszlet',
]);
// Words that name a different model when one side has them and the other does not.
const VARIANT = new Set(['pro', 'max', 'plus', 'ultra', 'mini', 'lite', 'air', 'fe', 'se', 'xl', 'xs', 'neo', 'edge', 'note', 'fold', 'flip', 'slim', 'oled', 'gen']);
const SERIES = /\b(series|line|lineup|range|family|brand|product line|sorozat|termekcsalad)\b/i;

const hasDigit = (w: string) => /\d/.test(w);

export function isAccessory(productName: string): boolean {
  return words(productName).some((w) => ACCESSORY.has(w));
}

// How well a name (its words) names this product: the number of words, or 0 when it is not certainly the
// same model. Every word must be in the product name, there must be two or more including a model number,
// and the product must not name a variant or generation the name lacks.
function nameScore(product: string[], label: string[]): number {
  const set = new Set(product);
  if (label.length < 2 || !label.some(hasDigit) || !label.every((w) => set.has(w))) return 0;
  const labelSet = new Set(label);
  const extra = product.filter((w) => !labelSet.has(w));
  // A variant word, or a bare generation number ("2" in "AirPods Pro 2"), the candidate does not have.
  return extra.some((w) => VARIANT.has(w) || /^\d{1,2}$/.test(w)) ? 0 : label.length;
}

// The best candidate for a product name, or null when no match is certain enough.
export function chooseCandidate(productName: string, candidates: Candidate[]): Candidate | null {
  const product = words(productName);
  if (product.length < 2 || isAccessory(productName)) return null;
  let best: { c: Candidate; score: number } | null = null;
  let tie = false;
  for (const c of candidates) {
    if (!c.image || SERIES.test(c.description) || c.names.some((n) => SERIES.test(n))) continue;
    const score = Math.max(0, ...c.names.map((name) => nameScore(product, words(name))));
    if (!score) continue;
    if (!best || score > best.score) {
      best = { c, score };
      tie = false;
    } else if (score === best.score && c.id !== best.c.id) tie = true;
  }
  return best && !tie ? best.c : null;
}

// Wikidata's entity search matches the start of a name, so trailing words (storage, colour) are dropped one at
// a time: the full name first, down to two words, at most four searches.
export function searchQueries(productName: string): string[] {
  const parts = productName.replace(/[()[\]{},;]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let n = parts.length; n >= 2 && out.length < 4; n--) out.push(parts.slice(0, n).join(' '));
  return out;
}

// --- API responses (only the fields used) ---

type Snak = { mainsnak?: { datavalue?: { value?: unknown } } };
interface WbEntity {
  id: string;
  labels?: Record<string, { value: string }>;
  aliases?: Record<string, { value: string }[]>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, Snak[]>;
}

export function candidatesFrom(entities: Record<string, WbEntity>, order: string[]): Candidate[] {
  return order.flatMap((id) => {
    const e = entities[id];
    if (!e) return [];
    const langs = ['en', 'hu', 'mul']; // 'mul': the default label many items now use instead of 'en'
    const names = [
      ...langs.flatMap((l) => (e.labels?.[l] ? [e.labels[l].value] : [])),
      ...langs.flatMap((l) => (e.aliases?.[l] ?? []).map((a) => a.value)),
    ];
    const image = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    const description = langs.map((l) => e.descriptions?.[l]?.value ?? '').filter(Boolean).join(' ');
    return [{ id, names: [...new Set(names)], description, image: typeof image === 'string' ? image : null }];
  });
}

// --- Which picture a warranty shows ---

export interface PhotoChoice {
  path: string;
  found: boolean; // a picture found online (shown with its credit), not the user's photo
}
type PhotoFields = { photo_path: string | null; product_name: string | null; found_photo_key: string | null; found_photo_path: string | null };

// The pictures to try, best first: the user's photo, then a found picture for the current name. A file
// that is gone (`usable` false) is skipped, so a missing photo of the user's never hides a good found one.
export function photoChoices(w: PhotoFields, usable: (path: string) => boolean): PhotoChoice[] {
  const out: PhotoChoice[] = [];
  if (w.photo_path && usable(w.photo_path)) out.push({ path: w.photo_path, found: false });
  if (w.found_photo_path && w.found_photo_key === lookupKey(w.product_name) && usable(w.found_photo_path)) out.push({ path: w.found_photo_path, found: true });
  return out;
}

// The first choice whose image has not failed to load (corrupt or unsupported file), or null: the category icon.
export const firstWorking = <T extends { path: string }>(choices: T[], failed: readonly string[]): T | null => choices.find((c) => !failed.includes(c.path)) ?? null;

// Wikimedia's user-agent policy: requests without an identifying agent (Android's default okhttp one) get 403.
export const WIKIMEDIA_HEADERS = { 'User-Agent': 'Warrantly/0.8 (Android app; https://github.com/ScideCodes/Warrantly)', 'Api-User-Agent': 'Warrantly/0.8' };

// Commons serves files and thumbnails from these two hosts only; nothing else is downloaded.
export const isWikimediaFile = (url: string): boolean => /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(url);

const stripHtml =(s: string) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

type Info = Record<string, unknown>;
type Pages = Record<string, { title?: string; index?: number; imageinfo?: Info[] }>;
const pagesOf = (json: unknown): Pages => (json as { query?: { pages?: Pages } })?.query?.pages ?? {};

function fromInfo(info: Info | undefined, file: string): { thumb: string; credit: PictureCredit } | null {
  if (!info) return null;
  const meta = (info.extmetadata ?? {}) as Record<string, { value?: string }>;
  const thumb = typeof info.thumburl === 'string' ? info.thumburl : null;
  const page = typeof info.descriptionurl === 'string' ? info.descriptionurl : null;
  const license = stripHtml(meta.LicenseShortName?.value ?? '');
  if (!thumb || !page || !license || !isWikimediaFile(thumb)) return null;
  return { thumb, credit: { file, page, artist: stripHtml(meta.Artist?.value ?? '') || 'Wikimedia Commons', license } };
}

// Commons imageinfo: the thumbnail URL and the credit the licence asks for. Null without a licence or thumbnail.
export const pictureFrom = (json: unknown, file: string): { thumb: string; credit: PictureCredit } | null =>
  fromInfo(Object.values(pagesOf(json))[0]?.imageinfo?.[0], file);

// --- Clean PNG cut-outs from Commons ---

// Words in a file name that say nothing about which model it shows.
const NOISE = new Set([
  'transparent', 'background', 'bg', 'png', 'cutout', 'isolated', 'render', 'rendering', 'front', 'back', 'side', 'view', 'official',
  'image', 'photo', 'picture', 'product', 'vector', 'representation', 'with', 'and', 'the', 'of', 'on', 'no', 'in',
  'black', 'white', 'silver', 'gold', 'grey', 'gray', 'blue', 'red', 'green', 'pink', 'purple', 'yellow', 'midnight', 'starlight',
]);
// Files that show something other than the product itself.
const NOT_PRODUCT = /\b(logo|icon|screenshot|chart|diagram|comparison|vs|versus|map|box|packaging|teardown|inside|internals?|disassembl\w*|motherboard|wallpaper|advert\w*|poster|taken with|shot on|sample|ui|interface)\b/i;

// The Commons search for PNGs of a product: the matched Wikidata label when there is one, else the shortest
// name prefix that still has the model number (brand and model, without storage or colour).
export const cutoutQuery = (productName: string, label: string | null): string =>
  `${label ?? searchQueries(productName).filter((q) => words(q).some(hasDigit)).at(-1) ?? productName} filemime:image/png`;

// Wikidata searches: the name's prefixes, then the same without the first word, since labels rarely start
// with the brand ("PlayStation 5", not "Sony PlayStation 5"). Six at most.
export const wikidataQueries = (productName: string): string[] => {
  const all = [...searchQueries(productName), ...searchQueries(productName.trim().split(/\s+/).slice(1).join(' '))];
  return [...new Set(all)].slice(0, 6);
};

export interface FileCandidate {
  thumb: string;
  credit: PictureCredit;
  score: number;
}

// PNG files from a Commons search that may be a clean picture of this product, best first. `depicts` marks
// a search by the matched Wikidata item (structured "depicts" data), which is trusted without a name match,
// though never for a variant the product is not. The pixels are checked later (pngAlpha.ts).
export function fileCandidates(json: unknown, productName: string, depicts: boolean): FileCandidate[] {
  const product = words(productName);
  const set = new Set(product);
  const out: (FileCandidate & { index: number })[] = [];
  for (const p of Object.values(pagesOf(json))) {
    const info = p.imageinfo?.[0];
    const file = (p.title ?? '').replace(/^File:/, '');
    // Palette PNGs may carry transparency too; plain truecolour or greyscale never does here.
    const colour = ((info?.metadata ?? []) as { name?: string; value?: unknown }[]).find((m) => m.name === 'colorType')?.value;
    if (!/\.png$/i.test(file) || !(colour === undefined || /alpha|index/.test(String(colour)))) continue;
    const name = file.replace(/\.png$/i, '').replace(/\([^)]*\)/g, ' ');
    if (/[^ -ɏ]/.test(name) || NOT_PRODUCT.test(name)) continue;
    const label = words(name).filter((w) => !NOISE.has(w));
    if (label.some((w) => VARIANT.has(w) && !set.has(w))) continue;
    const score = nameScore(product, label) || (depicts ? 0.5 : 0);
    const picture = score ? fromInfo(info, file) : null;
    if (!picture) continue;
    out.push({ ...picture, score: score + (/transparent|cutout|isolated/i.test(file) ? 0.25 : 0), index: p.index ?? 0 });
  }
  return out.sort((a, b) => b.score - a.score || a.index - b.index).map(({ index: _, ...c }) => c);
}
