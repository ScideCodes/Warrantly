import { useState } from 'react';
import { documentExists, documentUri } from '@/documents';
import type { Warranty } from '@/db/repo.ts';
import { shownPhoto } from '@/photo';

// The picture a warranty shows: the person's own photo, or null (the category icon). A file that is missing is
// skipped up front; one that exists but cannot be shown (corrupt, unsupported) is skipped once its <Image>
// reports the error. A different photo is tried again, and a file can fail only once, so there is no retry loop.
export function useProductPhoto(w: Pick<Warranty, 'photo_path'>): { uri: string; onError: () => void } | null {
  const [failed, setFailed] = useState<string | null>(null);
  const path = shownPhoto(w.photo_path, documentExists, failed);
  if (!path) return null;
  return { uri: documentUri(path), onError: () => setFailed(path) };
}
