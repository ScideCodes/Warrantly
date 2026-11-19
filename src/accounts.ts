import { Alert } from 'react-native';
import i18n from '@/i18n';
import { disconnectBackupDate, hasBackupPassword, restoreDisconnected } from '@/backup';
import { listAccounts, upsertAccount, type Db } from '@/db/repo.ts';
import { syncAccount } from '@/db/sync.ts';
import { mailDocuments } from '@/documents';
import { connectGmail, gmailTokenFor, needsReconnect } from '@/google';
import { gmailProvider } from '@/mail/gmail.ts';

const ask = (title: string, body: string, yes: string, no: string) =>
  new Promise<boolean>((resolve) =>
    Alert.alert(title, body, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ]),
  );

// Connect a Gmail account (section 15). If it was disconnected before, offer the backup made then.
// Returns the email and whether it still needs its first sync range (section 7).
export async function addGmailAccount(db: Db): Promise<{ email: string; needsRange: boolean } | null> {
  const email = await connectGmail();
  if (!email) return null;
  const account = await upsertAccount(db, email);
  const date = await disconnectBackupDate(db, email);
  // Skip keeps the copy, but an account that already has warranties (connected again, or synced since)
  // is never offered it: restoring then would add every warranty twice.
  const has = await db.getFirstAsync('SELECT 1 FROM warranties WHERE account_id = ? LIMIT 1', [account.id]);
  if (date && !has && hasBackupPassword()) {
    const when = new Date(date).toLocaleString(i18n.language);
    if (await ask(i18n.t('accounts.restoreTitle', { email }), i18n.t('accounts.restoreBody', { date: when }), i18n.t('accounts.restore'), i18n.t('accounts.skip'))) {
      await restoreDisconnected(db, account);
    }
  }
  const now = (await listAccounts(db)).find((a) => a.email === email);
  return { email, needsRange: !now?.last_synced_at };
}

// Sync every connected account, one after another. Returns one readable line per problem.
// Home, Settings and the range picker can all start a sync; a second one waits for the first, because
// two at once would read and save the same mails twice.
let queue: Promise<unknown> = Promise.resolve();
export function syncAllAccounts(db: Db, onProgress: (email: string, done: number, total: number) => void): Promise<string[]> {
  const run = queue.then(() => syncAll(db, onProgress));
  queue = run.catch(() => {});
  return run;
}

async function syncAll(db: Db, onProgress: (email: string, done: number, total: number) => void): Promise<string[]> {
  const problems: string[] = [];
  for (const { email } of await listAccounts(db)) {
    try {
      const failed = await syncAccount(db, gmailProvider(gmailTokenFor(email)), email, (done, total) => onProgress(email, done, total), new Date(), mailDocuments);
      if (failed.length) problems.push(i18n.t('home.failed', { count: failed.length, detail: `${email}: ${failed[0].error}` }));
    } catch (e) {
      problems.push(needsReconnect(e) ? i18n.t('home.reconnect', { email }) : `${email}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return problems;
}
