import { wipeDb, type Db } from '@/db/repo.ts';

// Web previews: no share sheet or files; deleting clears the preview's data.
export const shareText = async (_name: string, _content: string, _mimeType: string): Promise<void> => {};
export const sharePdf = async (_name: string, _html: string): Promise<void> => {};
export async function deleteAllData(db: Db, _drive: boolean): Promise<void> {
  await wipeDb(db);
  localStorage.clear();
}
