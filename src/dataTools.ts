import i18n from '@/i18n';
import { zipFiles } from './zip';
import { transferItem, DEFAULT_FIELDS } from './transfer';
import { Directory, File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import * as Print from 'expo-print';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import Storage from 'expo-sqlite/kv-store';
import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';
import * as DocumentPicker from 'expo-document-picker';
import { deleteDriveBackups } from '@/backup';
import { fromBase64, toBase64 } from '@/backup/format.ts';
import { documentExists, readDocument, writeDocument } from '@/documents';
import { clearLock } from '@/lock/store';
import { importShared, sharedWarranties, wipeDb, type Db, type SharedWarranty } from '@/db/repo.ts';
import { updateWidget } from '@/widget';

// Export and "delete all my data" (GDPR: access and erasure).

async function share(file: File, mimeType: string): Promise<void> {
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: file.name });
}

export async function shareText(name: string, content: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  await share(file, mimeType);
}

export async function sharePdf(name: string, html: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  await new File(uri).move(file);
  await share(file, 'application/pdf');
}

// Household sharing (section 13): warranties with their notes and documents as one file, sent with any
// app (mail, chat, Drive) and merged in on the other phone.
const SHARE_FORMAT = 'warrantly-share';
const IMPORT_MAX_BYTES = 100 * 1024 * 1024;

async function embedDocuments(items: SharedWarranty[]): Promise<SharedWarranty[]> {
  for (const item of items) {
    item.documents = await Promise.all(
      item.documents.filter((d) => documentExists(d.local_path!)).map(async (d) => ({ filename: d.filename, label: d.label, data: toBase64(await readDocument(d.local_path!)) })),
    );
  }
  return items;
}

export async function shareWarranties(db: Db, ids: number[], name: string): Promise<void> {
  const items = await embedDocuments(await sharedWarranties(db, ids));
  await shareText(name, JSON.stringify({ format: SHARE_FORMAT, v: 1, items }), 'application/json');
}

// Transfer (shortlist 18): one item, only the chosen parts, as a Warrantly file the new owner imports.
export async function shareTransferFile(item: SharedWarranty, name: string): Promise<void> {
  const items = await embedDocuments([item]);
  await shareText(name, JSON.stringify({ format: SHARE_FORMAT, v: 1, items }), 'application/json');
}

// Returns how many warranties were added, or null if the user backed out.
export async function importSharedFile(db: Db): Promise<number | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets.length) return null;
  // A file from someone else: a bounded size, so a huge one cannot exhaust memory while it is read.
  const file = new File(picked.assets[0].uri);
  if ((picked.assets[0].size ?? file.size ?? 0) > IMPORT_MAX_BYTES) throw new Error('This file is too large to be a Warrantly file');
  const data = JSON.parse(await file.text());
  if (data?.format !== SHARE_FORMAT || !Array.isArray(data.items)) throw new Error('Not a Warrantly file');
  return importShared(db, data.items, async (doc) => {
    if (typeof doc.data !== 'string') return null;
    const name = `shared-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`;
    await writeDocument(name, fromBase64(doc.data));
    return name;
  });
}

// Everything on this phone goes: warranties, documents, settings, PIN, backup key, reminders, Google
// sign-in. With `drive`, the backups in Google Drive are deleted first.
export async function deleteAllData(db: Db, drive: boolean): Promise<void> {
  if (drive) await deleteDriveBackups();
  await wipeDb(db);
  const docs = new Directory(Paths.document, 'attachments');
  if (docs.exists) docs.delete();
  Storage.clearSync();
  await clearLock();
  await SecureStore.deleteItemAsync('backup_key');
  await Notifications.cancelAllScheduledNotificationsAsync();
  await GoogleOneTapSignIn.signOut().catch(() => {});
  await updateWidget(db).catch(() => {});
}

// One file containing the claim draft, printable summary and untouched selected receipts.
export async function shareClaimPackage(html: string, text: string, docs: { local_path: string; filename: string }[]): Promise<void> {
  const total = docs.reduce((n, d) => {
    if (!documentExists(d.local_path)) throw new Error(i18n.t('assistant.missingDocument'));
    return n + new File(Paths.document, 'attachments', d.local_path).size;
  }, 0);
  if (total > 50 * 1024 * 1024) throw new Error(i18n.t('assistant.tooLarge'));
  const summary = await Print.printToFileAsync({ html });
  const pdf = new File(summary.uri);
  const file = new File(Paths.cache, `warrantly-claim-${Date.now()}.zip`);
  try {
    const files: { name: string; data: Uint8Array }[] = [{ name: 'claim.txt', data: new TextEncoder().encode(text) }, { name: 'summary.pdf', data: await pdf.bytes() }];
    for (const [i, doc] of docs.entries()) files.push({ name: `${i + 1}-${doc.filename}`, data: await readDocument(doc.local_path) });
    file.create(); await file.write(zipFiles(files));
    await share(file, 'application/zip');
  } finally { if (pdf.exists) pdf.delete(); }
}

export async function shareHousehold(db: Db, ids: number[], includePrivate: boolean): Promise<void> {
  const items = (await sharedWarranties(db, ids)).map(item => includePrivate ? item :
    transferItem(item, new Set(DEFAULT_FIELDS), new Set(item.documents.map((_, i) => i))));
  await shareText(`warrantly-household-${Date.now()}.warrantly.json`, JSON.stringify({ format: SHARE_FORMAT, v: 1, items: await embedDocuments(items) }), 'application/json');
}
