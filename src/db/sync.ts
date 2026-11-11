import type { MailProvider, SyncResult } from '../mail/provider.ts';
import { fetchAndParse } from '../mail/provider.ts';
import { knownMessageIds, loadStoreRules, saveResult, setLastSynced, upsertAccount, type Db } from './repo.ts';

const FIRST_SYNC_MONTHS = 24; // section 7 default; the range picker comes later

// Sync one mail account into the database. Mails seen before are skipped, each result is saved
// as soon as it is parsed, and the sync marker only moves forward when nothing failed, so mails
// that hit a quota error are retried next time.
export async function syncAccount(
  db: Db,
  provider: MailProvider,
  email: string,
  onProgress?: (done: number, total: number) => void,
  now = new Date(),
): Promise<SyncResult['failed']> {
  const account = await upsertAccount(db, email);
  const after = account.last_synced_at ? new Date(account.last_synced_at) : new Date(now);
  if (!account.last_synced_at) after.setMonth(after.getMonth() - FIRST_SYNC_MONTHS);

  const { failed } = await fetchAndParse(provider, after, {
    storeRules: await loadStoreRules(db),
    skip: await knownMessageIds(db, account.id),
    onProgress,
    onResult: (r) => saveResult(db, account.id, r),
  });
  if (!failed.length) await setLastSynced(db, account.id, now.toISOString());
  return failed;
}
