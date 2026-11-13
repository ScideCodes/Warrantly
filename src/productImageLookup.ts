import Storage from 'expo-sqlite/kv-store';
import { deleteDocuments, documentExists, saveFoundPicture } from '@/documents';
import { setFoundPhoto, type Db, type Warranty } from '@/db/repo.ts';
import {
  candidatesFrom, chooseCandidate, cutoutQuery, fileCandidates, isAccessory, lookupKey, LOOKUP_VERSION, needsLookup, pictureFrom, WIKIMEDIA_HEADERS, wikidataQueries, words,
  type Candidate, type FileCandidate, type PictureCredit,
} from '@/productImage';
import { isCutout, pngAlpha } from '@/pngAlpha';
import { logError } from '@/errorLog';
import { processPictureQueue } from './pictureQueue';

// Product pictures from Wikidata (which item is it, and its P18 image) and Wikimedia Commons (thumbnail, author
// and licence). Free, no key, openly licensed images; the credit is shown with the picture. Only the product
// name is sent. Requests are spaced out and stop for an hour when the API asks us to slow down.
const GAP_MS = 1100;
let lastRequest = 0;
let pausedUntil = 0;
class Paused extends Error {}

export const autoPictures = (): boolean => Storage.getItemSync('product_pictures') === '1';
export const setAutoPictures = (on: boolean): void => Storage.setItemSync('product_pictures', on ? '1' : '0');

async function request(url: string): Promise<Response> {
  if (Date.now() < pausedUntil) throw new Paused();
  const wait = lastRequest + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const res = await fetch(url, { headers: WIKIMEDIA_HEADERS }).catch(() => {
    throw new Paused(); // offline: try again on the next list load, nothing to log
  });
  if (res.status === 429 || res.status === 503) {
    pausedUntil = Date.now() + 60 * 60 * 1000;
    throw new Paused();
  }
  if (!res.ok) throw new Error(`picture lookup HTTP ${res.status}`);
  return res;
}
const getJson = async (url: string): Promise<unknown> => (await request(url)).json();

const COMMONS = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata|metadata&iiurlwidth=256&iiextmetadatafilter=Artist|LicenseShortName';
const MAX_DOWNLOADS = 4; // cut-out candidates whose pixels are checked, per product

type Found = { thumb: string; credit: PictureCredit; png?: Uint8Array };

// A transparent PNG of exactly this product: Commons files that depict the matched Wikidata item, and files
// named after it, whose pixels show a product on no background. Null when none is clean.
async function findCutout(productName: string, pick: Candidate | null): Promise<Found | null> {
  const searches = [
    ...(pick ? [{ q: `haswbstatement:P180=${pick.id} filemime:image/png`, depicts: true }] : []),
    { q: cutoutQuery(productName, pick?.names[0] ?? null), depicts: false },
  ];
  const files = new Map<string, FileCandidate>();
  for (const s of searches) {
    const json = await getJson(`${COMMONS}&generator=search&gsrnamespace=6&gsrlimit=10&gsrsearch=${encodeURIComponent(s.q)}`);
    for (const f of fileCandidates(json, productName, s.depicts)) if (!files.has(f.credit.file)) files.set(f.credit.file, f);
  }
  const best = [...files.values()].sort((a, b) => b.score - a.score).slice(0, MAX_DOWNLOADS);
  for (const f of best) {
    const png = new Uint8Array(await (await request(f.thumb)).arrayBuffer());
    if (png.length <= 2_000_000 && isCutout(pngAlpha(png))) return { thumb: f.thumb, credit: { ...f.credit, clean: true }, png };
  }
  return null;
}

// A picture for this product name, or null when nothing matches with certainty: a clean cut-out when Commons
// has one, else the matched Wikidata item's own picture (a photo, often with its background).
export async function findPicture(productName: string): Promise<Found | null> {
  if (isAccessory(productName) || words(productName).length < 2) return null;
  let pick: Candidate | null = null;
  for (const q of wikidataQueries(productName)) {
    const found = (await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&language=en&uselang=en&limit=7&search=${encodeURIComponent(q)}`)) as { search?: { id: string }[] };
    const ids = (found.search ?? []).map((s) => s.id).filter((id) => /^Q\d+$/.test(id));
    if (!ids.length) continue;
    const data = (await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|aliases|descriptions|claims&languages=en|hu|mul&ids=${ids.join('|')}`)) as {
      entities?: Parameters<typeof candidatesFrom>[0];
    };
    pick = chooseCandidate(productName, candidatesFrom(data.entities ?? {}, ids));
    if (pick) break;
  }
  const cutout = await findCutout(productName, pick);
  if (cutout || !pick?.image) return cutout;
  const picture = pictureFrom(await getJson(`${COMMONS}&titles=${encodeURIComponent(`File:${pick.image}`)}`), pick.image);
  // The item's own picture is often a drawing (SVG, served as a transparent PNG): check it the same way.
  if (!picture || !/\.png(\?|$)/i.test(picture.thumb)) return picture;
  const png = new Uint8Array(await (await request(picture.thumb)).arrayBuffer());
  if (png.length > 2_000_000) return null;
  return { ...picture, credit: { ...picture.credit, clean: isCutout(pngAlpha(png)) }, png };
}

type Row = Pick<Warranty, 'id' | 'product_name' | 'photo_path' | 'found_photo_key' | 'found_photo_path' | 'found_photo_credit'>;

// Looks one warranty up and stores the result for its current name. A name changed meanwhile wins: the
// result is dropped. Returns true when a picture was stored.
export async function lookUpPicture(db: Db, w: Row): Promise<boolean> {
  const key = lookupKey(w.product_name);
  if (!key || !w.product_name) return false;
  const found = await findPicture(w.product_name);
  const file = found ? await saveFoundPicture(found.thumb, found.png) : null;
  const now = await db.getFirstAsync<{ product_name: string | null }>('SELECT product_name FROM warranties WHERE id = ?', [w.id]);
  if (!now || lookupKey(now.product_name) !== key) {
    if (file) deleteDocuments([file]);
    return false;
  }
  const old = await setFoundPhoto(db, w.id, key, file, JSON.stringify(found ? { ...found.credit, v: LOOKUP_VERSION } : { v: LOOKUP_VERSION }));
  if (old) deleteDocuments([old]);
  return !!file;
}

// The user removed the found picture: remember that for this name, so it is not looked up again.
export async function removeFoundPicture(db: Db, w: Row): Promise<void> {
  const old = await setFoundPhoto(db, w.id, lookupKey(w.product_name), null, 'removed');
  if (old) deleteDocuments([old]);
}

let running: Promise<number> | null = null;
const pictureListeners = new Set<(id: number) => void>();
export function subscribePictureUpdates(listener: (id: number) => void): () => void {
  pictureListeners.add(listener);
  return () => { pictureListeners.delete(listener); };
}

// Backfill the entire existing library, serially, without blocking navigation. One
// shared pass serves Settings and Home; each saved image refreshes its visible row.
// Offline/rate-limited passes resume on the next load, leaving successful work saved.
export function runPictureLookups(db: Db): Promise<number> {
  if (!autoPictures()) return Promise.resolve(0);
  running ??= (async () => {
    let changed = 0;
    try {
      const rows = await db.getAllAsync<Row>(`SELECT id, product_name, photo_path, found_photo_key, found_photo_path, found_photo_credit FROM warranties WHERE status = 'complete'`, []);
      const result = await processPictureQueue(rows.filter((w) => needsLookup(w, documentExists)), autoPictures,
        (w) => lookUpPicture(db, w),
        (w) => pictureListeners.forEach((notify) => notify(w.id)),
      );
      changed = result.changed;
      if (result.error) throw result.error;
    } catch (e) {
      if (!(e instanceof Paused)) logError(`picture lookup stopped: ${e instanceof Error ? e.message : String(e)}`, 'pictures');
    } finally {
      running = null;
    }
    return changed;
  })();
  return running;
}

export function creditOf(w: Pick<Warranty, 'found_photo_credit'>): PictureCredit | null {
  try {
    const c = JSON.parse(w.found_photo_credit ?? 'null') as PictureCredit | null;
    return c && typeof c.page === 'string' && c.page.startsWith('https://commons.wikimedia.org/') ? c : null;
  } catch {
    return null;
  }
}
