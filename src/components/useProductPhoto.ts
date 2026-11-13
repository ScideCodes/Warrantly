import { useState } from 'react';
import { documentExists, documentUri } from '@/documents';
import type { Warranty } from '@/db/repo.ts';
import { firstWorking, photoChoices } from '@/productImage';

type Fields = Pick<Warranty, 'photo_path' | 'product_name' | 'found_photo_key' | 'found_photo_path'>;

// The picture a warranty shows: the user's photo, else a found picture for its current name, else null (the
// category icon). A file that is missing is skipped up front; one that exists but cannot be shown (corrupt,
// unsupported) is skipped once its <Image> reports the error. Failures are forgotten when the files change,
// and each file can fail only once, so there is no retry loop.
export function useProductPhoto(w: Fields): { uri: string; found: boolean; onError: () => void } | null {
  const choices = photoChoices(w, documentExists);
  const key = choices.map((c) => c.path).join('|');
  const [failed, setFailed] = useState<{ key: string; paths: string[] }>({ key, paths: [] });
  const pick = firstWorking(choices, failed.key === key ? failed.paths : []);
  if (!pick) return null;
  return {
    uri: documentUri(pick.path),
    found: pick.found,
    onError: () => setFailed((f) => ({ key, paths: [...(f.key === key ? f.paths : []), pick.path] })),
  };
}
