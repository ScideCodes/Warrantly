import { useSyncExternalStore } from 'react';
import { extractTextFromImage } from 'expo-text-extractor';
import PdfPages from '../modules/pdf-pages';
import { getDb } from '@/db/client';
import { cleanDocText, indexCounts, saveDocText, unindexedDocuments } from '@/db/features.ts';
import { documentExists, documentUri } from '@/documents';
import { plain } from '@/warranty';
import { IndexCancelled, readPdfText } from './pdfText';

// Document text search (shortlist 8): each stored file is read once on the phone (Android's PdfRenderer for
// the pages, ML Kit text recognition through expo-text-extractor), in small batches after the list has shown,
// never while scrolling or typing. The original file is never changed. Text is stored plain (lower case, no
// accents) in doc_text; files that are gone are cleaned out. A file that cannot be read is marked failed and
// only tried again on request.
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
  return readPdfText(
    (first, count) => PdfPages.renderForText(documentUri(localPath), WIDTH, first, count),
    extractTextFromImage,
    () => cancelled,
  );
}

// `limit` files per run: the home screen asks for a few each time it loads; the Documents screen for all.
export async function runIndex(limit = 3): Promise<void> {
  if (state.running) return;
  cancelled = false;
  set({ running: true }); // Acquire before the first await: home and Documents share the native cache.
  try {
    const db = await getDb();
    await cleanDocText(db);
    const counts = await indexCounts(db);
    set({ done: counts.done, total: counts.total, failed: counts.failed });
    let left = limit;
    // A file missing from this phone is skipped, not marked failed: a restore may bring it back.
    const missing = new Set<string>();
    while (left > 0 && !cancelled) {
      const batch = (await unindexedDocuments(db, Math.min(2, left) + missing.size)).filter((p) => !missing.has(p)).slice(0, Math.min(2, left));
      if (!batch.length) break;
      for (const path of batch) {
        if (cancelled) break;
        if (!documentExists(path)) { missing.add(path); continue; }
        try {
          await saveDocText(db, path, storedText(await readFile(path)), 'done');
        } catch (error) {
          if (error instanceof IndexCancelled) break;
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
