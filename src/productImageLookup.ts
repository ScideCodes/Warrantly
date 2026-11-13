import Storage from 'expo-sqlite/kv-store';
import { deleteDocuments, documentExists, saveFoundPicture } from '@/documents';
import { setFoundPhoto, type Db, type Warranty } from '@/db/repo.ts';
import { candidatesFrom, chooseCandidate, lookupKey, pictureFrom, searchQueries, WIKIMEDIA_HEADERS, type PictureCredit } from '@/productImage';
import { logError } from '@/errorLog';

// Product pictures from Wikidata (which item is it, and its P18 image) and Wikimedia Commons (thumbnail, author
// and licence). Free, no key, openly licensed images; the credit is shown with the picture. Only the product
// name is sent. Requests are spaced out and stop for an hour when the API asks us to slow down.
const GAP_MS = 1100;
let lastRequest = 0;
let pausedUntil = 0;
class Paused extends Error {}

export const autoPictures = (): boolean => Storage.getItemSync('product_pictures') === '1';
export const setAutoPictures = (on: boolean): void => Storage.setItemSync('product_pictures', on ? '1' : '0');

async function getJson(url: string): Promise<unknown> {
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
  return res.json();
}

// A picture for this product name, or null when nothing matches with certainty.
export async function findPicture(productName: string): Promise<{ thumb: string; credit: PictureCredit } | null> {
  for (const q of searchQueries(productName)) {
    const found = (await getJson(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&type=item&language=en&uselang=en&limit=7&search=${encodeURIComponent(q)}`)) as { search?: { id: string }[] };
    const ids = (found.search ?? []).map((s) => s.id).filter((id) => /^Q\d+$/.test(id));
    if (!ids.length) continue;
    const data = (await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&props=labels|aliases|descriptions|claims&languages=en|hu&ids=${ids.join('|')}`)) as {
      entities?: Parameters<typeof candidatesFrom>[0];
    };
    const pick = chooseCandidate(productName, candidatesFrom(data.entities ?? {}, ids));
    if (!pick?.image) continue;
    const info = await getJson(
      `https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=256&iiextmetadatafilter=Artist|LicenseShortName&titles=${encodeURIComponent(`File:${pick.image}`)}`,
    );
    return pictureFrom(info, pick.image);
  }
  return null;
}

type Row = Pick<Warranty, 'id' | 'product_name' | 'photo_path' | 'found_photo_key' | 'found_photo_path'>;

// Looks one warranty up and stores the result for its current name. A name changed meanwhile wins: the
// result is dropped. Returns true when a picture was stored.
export async function lookUpPicture(db: Db, w: Row): Promise<boolean> {
  const key = lookupKey(w.product_name);
  if (!key || !w.product_name) return false;
  const found = await findPicture(w.product_name);
  const file = found ? await saveFoundPicture(found.thumb) : null;
  const now = await db.getFirstAsync<{ product_name: string | null }>('SELECT product_name FROM warranties WHERE id = ?', [w.id]);
  if (!now || lookupKey(now.product_name) !== key) {
    if (file) deleteDocuments([file]);
    return false;
  }
  const old = await setFoundPhoto(db, w.id, key, file, found ? JSON.stringify(found.credit) : null);
  if (old) deleteDocuments([old]);
  return !!file;
}

// The user removed the found picture: remember that for this name, so it is not looked up again.
export async function removeFoundPicture(db: Db, w: Row): Promise<void> {
  const old = await setFoundPhoto(db, w.id, lookupKey(w.product_name), null, 'removed');
  if (old) deleteDocuments([old]);
}

const needsLookup = (w: Row): boolean => {
  const key = lookupKey(w.product_name);
  if (!key || w.photo_path) return false;
  if (w.found_photo_key !== key) return true;
  return !!w.found_photo_path && !documentExists(w.found_photo_path); // restored or cleared file
};

let running: Promise<number> | null = null;

// Background pass when automatic pictures are on: a few warranties per call, never from a list row, so
// scrolling never starts a lookup. Stops quietly when offline or asked to slow down. Returns how many changed.
export function runPictureLookups(db: Db, limit = 6): Promise<number> {
  if (!autoPictures()) return Promise.resolve(0);
  running ??= (async () => {
    let changed = 0;
    try {
      const rows = await db.getAllAsync<Row>(`SELECT id, product_name, photo_path, found_photo_key, found_photo_path FROM warranties WHERE status = 'complete'`, []);
      for (const w of rows.filter(needsLookup).slice(0, limit)) {
        if (await lookUpPicture(db, w)) changed++;
      }
    } catch (e) {
      if (!(e instanceof Paused)) logError(`picture lookup stopped: ${e instanceof Error ? e.message : String(e)}`, 'pictures');
    } finally {
      running = null;
    }
    return changed;
  })();
  return running;
}

// The picture to show: the user's own photo first, then a found picture for the current name.
export function shownPhoto(w: Pick<Warranty, 'photo_path' | 'product_name' | 'found_photo_key' | 'found_photo_path'>): { path: string; found: boolean } | null {
  if (w.photo_path) return { path: w.photo_path, found: false };
  if (w.found_photo_path && w.found_photo_key === lookupKey(w.product_name)) return { path: w.found_photo_path, found: true };
  return null;
}

export function creditOf(w: Pick<Warranty, 'found_photo_credit'>): PictureCredit | null {
  try {
    const c = JSON.parse(w.found_photo_credit ?? 'null') as PictureCredit | null;
    return c && typeof c.page === 'string' && c.page.startsWith('https://commons.wikimedia.org/') ? c : null;
  } catch {
    return null;
  }
}
