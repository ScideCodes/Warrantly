import { router } from 'expo-router';
import { documentExists } from '@/documents';
import { recordDocument } from '@/recentStore';

// Opens the in-app viewer for a stored document and remembers it as recently opened. False when the file is
// not on this phone (the caller offers a way to restore or replace it).
export function openViewer(doc: { id: number; warranty_id: number; local_path: string; filename: string }, title: string): boolean {
  if (!documentExists(doc.local_path)) return false;
  recordDocument(doc.id, doc.warranty_id);
  router.push({ pathname: '/document', params: { path: doc.local_path, title, name: doc.filename } });
  return true;
}
