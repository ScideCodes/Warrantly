import { deleteDocuments } from '@/documents';
import type { Db } from '@/db/repo.ts';

// Pictures found online are no longer part of the app. Phones that kept some from earlier versions delete those
// files and forget them once; afterwards nothing is left to do. The person's own photos are never touched.
export async function clearFoundPictures(db: Db): Promise<void> {
  const rows = await db.getAllAsync<{ found_photo_path: string | null }>(
    'SELECT found_photo_path FROM warranties WHERE found_photo_path IS NOT NULL OR found_photo_key IS NOT NULL OR found_photo_credit IS NOT NULL',
    [],
  );
  if (!rows.length) return;
  await db.runAsync('UPDATE warranties SET found_photo_path = NULL, found_photo_key = NULL, found_photo_credit = NULL', []);
  deleteDocuments(rows.map((r) => r.found_photo_path).filter((p): p is string => !!p));
}
