import { useSyncExternalStore } from 'react';
import { extractTextFromImage } from 'expo-text-extractor';
import PdfPages from '../modules/pdf-pages';
import { getDb } from '@/db/client';
import { cleanDocText, indexCounts, saveDocText, unindexedDocuments } from '@/db/features.ts';
import { documentExists, documentUri } from '@/documents';
import { plain } from '@/warranty';

// Document text search (shortlist 8): each stored file is read once on the phone (Android's PdfRenderer for
// the pages, ML Kit text recognition through expo-text-extractor), in small batches after the list has shown,
// never while scrolling or typing. The original file is never changed. Text is stored plain (lower case, no
// accents) in doc_text; files that are gone are cleaned out. A file that cannot be read is marked failed and
// only tried again on request.
const PAGES = 4; // receipts and warranty cards: order and serial numbers sit on the first pages
const WIDTH = 1400; // px; enough for ML Kit to read small print

export interface IndexState { running: boolean; done: number; total: number; failed: number }
let state: IndexState = { running: false, done: 0, total: 0, failed: 0 };
let cancelled = false;
const listeners = new Set<() => void>();
const set = (s: Partial<IndexState>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};
export const useIndexState = (): IndexState => useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);

export const storedText = (text: string): string => plain(text).replace(/\s+/g, ' ').trim();

// Text that was already read when the document was made (a scan or a photo): stored right away.
export async function saveKnownText(localPath: string, text: string): Promise<void> {
  if (!text.trim()) return; // a PDF picked from the phone: the indexer reads it
  await saveDocText(await getDb(), localPath, storedText(text), 'done');
}

async function readFile(localPath: string): Promise<string> {
  const { pages } = await PdfPages.renderForText(documentUri(localPath), WIDTH, 0, PAGES);
  const parts: string[] = [];
  for (const uri of pages) parts.push((await extractTextFromImage(uri)).join('\n'));
  return parts.join('\n');
}

// `limit` files per run: the home screen asks for a few each time it loads; the Documents screen for all.
export async function runIndex(limit = 3): Promise<void> {
  if (state.running) return;
  cancelled = false;
  const db = await getDb();
  await cleanDocText(db);
  const counts = await indexCounts(db);
  set({ running: true, done: counts.done, total: counts.total, failed: counts.failed });
  try {
    let left = limit;
    while (left > 0 && !cancelled) {
      const batch = await unindexedDocuments(db, Math.min(2, left));
      if (!batch.length) break;
      for (const path of batch) {
        if (cancelled) break;
        try {
          if (!documentExists(path)) throw new Error('missing');
          await saveDocText(db, path, storedText(await readFile(path)), 'done');
        } catch {
          await saveDocText(db, path, '', 'failed');
        }
        left--;
        const now = await indexCounts(db);
        set({ done: now.done, total: now.total, failed: now.failed });
      }
    }
  } finally {
    set({ running: false });
  }
}

export const cancelIndex = (): void => void (cancelled = true);

export async function refreshIndexCounts(): Promise<void> {
  const c = await indexCounts(await getDb());
  set({ done: c.done, total: c.total, failed: c.failed });
}
