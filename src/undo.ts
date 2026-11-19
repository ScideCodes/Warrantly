import { useSyncExternalStore } from 'react';
import { getDb } from '@/db/client';
import { purgeDeleted } from '@/db/features.ts';
import { deleteDocuments } from '@/documents';

// Undo (shortlist 9): a delete marks rows first; the snackbar offers Undo for UNDO_MS, then the rows and the
// files nothing else uses are removed. A new action ends the previous one's window at once. If the app is
// closed during a window, the next start finishes the delete (`finishPendingDeletes`).
export const UNDO_MS = 7000;

export interface UndoAction {
  message: string;
  undo: () => Promise<void>;
  // Runs when the window ends without Undo (e.g. purge). Never runs after undo.
  commit?: () => Promise<void>;
}

type State = { action: UndoAction; key: number } | null;
let state: State = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let key = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function end(commit: boolean) {
  const current = state;
  if (timer) clearTimeout(timer);
  timer = null;
  state = null;
  emit();
  if (commit && current?.action.commit) await current.action.commit().catch((e) => console.warn('undo commit', e));
}

export function showUndo(action: UndoAction): void {
  void end(true); // the previous action is final now
  state = { action, key: ++key };
  emit();
  timer = setTimeout(() => void end(true), UNDO_MS);
}

export async function runUndo(): Promise<void> {
  const current = state;
  if (!current) return;
  if (timer) clearTimeout(timer);
  timer = null;
  state = null;
  emit();
  await current.action.undo();
  undone.forEach((l) => l());
}

// Screens that show the undone rows (home) reload on this; an undo can come from a screen already closed.
const undone = new Set<() => void>();
export function onUndone(listener: () => void): () => void {
  undone.add(listener);
  return () => { undone.delete(listener); };
}

export const dismissUndo = (): Promise<void> => end(true);

export function useUndo(): State {
  return useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => state);
}

// Deletes whose window has passed: rows marked before `before`, and their now unused files.
export async function purgeBefore(before: string): Promise<void> {
  const db = await getDb();
  deleteDocuments(await purgeDeleted(db, before));
}

// App start: anything marked more than a window ago (the app was closed during it) is finished now.
export const finishPendingDeletes = (now = Date.now()): Promise<void> => purgeBefore(new Date(now - UNDO_MS).toISOString());
