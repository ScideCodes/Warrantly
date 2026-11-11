import type { MailProvider, SyncResult } from '../mail/provider.ts';
import { fetchAndParse } from '../mail/provider.ts';
import { parseEmail } from '../parser/parse.ts';
import type { MailMessage, ParseResult, StoreRules } from '../parser/types.ts';
import {
  addAttachment, hasAttachmentNamed, isDocsBackfilled, knownMessageIds, loadStoreRules, matchReturns, saveResult, setDocsBackfilled,
  setLastSynced, syncedMessages, upsertAccount, warrantiesForDocument, type Db,
} from './repo.ts';

// Where downloaded PDFs are written (the app's attachments folder on the phone; memory in tests).
export interface DocumentStore {
  save(bytes: Uint8Array, filename: string): Promise<string>; // returns the stored file's name
}

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
  docs?: DocumentStore,
): Promise<SyncResult['failed']> {
  const account = await upsertAccount(db, email);
  const after = account.last_synced_at ? new Date(account.last_synced_at) : new Date(now);
  if (!account.last_synced_at) after.setMonth(after.getMonth() - FIRST_SYNC_MONTHS);

  const storeRules = await loadStoreRules(db);
  const { failed } = await fetchAndParse(provider, after, {
    storeRules,
    skip: await knownMessageIds(db, account.id),
    onProgress,
    onResult: async (r, msg) => {
      const ids = await saveResult(db, account.id, r);
      if (docs) await attachMailDocuments(db, provider, docs, account.id, r, msg, ids);
    },
  });
  if (!failed.length) await setLastSynced(db, account.id, now.toISOString());
  await matchReturns(db, account.id);
  if (docs && !(await isDocsBackfilled(db, account.id))) await backfillDocuments(db, provider, docs, account.id, storeRules);
  return failed;
}

// Build step 4: keep a mail's PDFs with its warranty. A purchase mail's PDFs go to the warranties it
// created; any other mail's PDF goes to the same store's warranty whose order number it names.
async function attachMailDocuments(db: Db, provider: MailProvider, docs: DocumentStore, accountId: number, r: ParseResult, msg: MailMessage, ids: number[]) {
  const pdfs = msg.attachments.filter((a) => a.id && (a.mimeType === 'application/pdf' || /\.pdf$/i.test(a.filename)));
  for (const pdf of pdfs) {
    const targets = r.kind === 'purchase' ? ids : await warrantiesForDocument(db, accountId, r.storeDomain, `${pdf.filename}\n${msg.subject}\n${msg.text}`);
    let bytes: Uint8Array | null = null;
    for (const id of targets) {
      if (await hasAttachmentNamed(db, id, pdf.filename)) continue; // the same invoice often comes in several mails
      bytes ??= await provider.getAttachment(msg.id, pdf.id!);
      await addAttachment(db, id, pdf.filename, await docs.save(bytes, pdf.filename)); // own copy each: deleting one keeps the others
    }
  }
}

// Mails synced before PDFs were downloaded: read them once more for their PDFs. Retried next sync if
// any mail could not be read.
async function backfillDocuments(db: Db, provider: MailProvider, docs: DocumentStore, accountId: number, storeRules: StoreRules) {
  let complete = true;
  for (const { message_id, warranty_ids } of await syncedMessages(db, accountId)) {
    try {
      const msg = await provider.getMessage(message_id);
      if (!msg.attachments.some((a) => /\.pdf$/i.test(a.filename) || a.mimeType === 'application/pdf')) continue;
      const r = parseEmail(msg, storeRules);
      await attachMailDocuments(db, provider, docs, accountId, { ...r, kind: warranty_ids.length ? 'purchase' : 'ignored' }, msg, warranty_ids);
    } catch {
      complete = false;
    }
  }
  if (complete) await setDocsBackfilled(db, accountId);
}
