import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { changeCount, markBackedUp } from '@/db/features.ts';
import { deleteAccount, dumpAccount, getDisconnectBackup, restoreAccount, saveDisconnectBackup, type Account, type AccountRows, type Db } from '@/db/repo.ts';
import { deleteDocuments, documentExists, readDocument, writeDocument } from '@/documents';
import { ensureDriveAccess, getAccessToken, revokeGoogleAccess } from '@/google';
import { applySnapshot, getSetting, setSetting, settingsSnapshot } from '@/settings';
import { BACKUP_PREFIX, driveClient, uploadAndPrune } from './drive.ts';
import {
  backupDue, deriveKey, docBackupName, dumpDb, fromBase64, KDF, restoreDb, seal, sealBytes, toBase64, unseal, unsealBytes,
  type Aead, type BackupInterval, type KdfParams,
} from './format.ts';

// The key derived from the backup password, so scheduled backups never ask for it (section 17).
const KEY = 'backup_key';
type StoredKey = { kdf: KdfParams; key: string };
const storedKey = (): StoredKey | null => JSON.parse(SecureStore.getItem(KEY) ?? 'null');

const aead: Aead = {
  async encrypt(key, plain) {
    const sealed = await aesEncryptAsync(plain, await AESEncryptionKey.import(key));
    return { iv: await sealed.iv('bytes'), data: await sealed.ciphertext({ encoding: 'bytes', includeTag: true }) };
  },
  async decrypt(key, iv, data) {
    return aesDecryptAsync(AESSealedData.fromParts(iv, data), await AESEncryptionKey.import(key), { output: 'bytes' });
  },
};

export const hasBackupPassword = (): boolean => storedKey() !== null;

export async function setBackupPassword(password: string): Promise<void> {
  const kdf = { ...KDF, salt: toBase64(getRandomBytes(16)) };
  SecureStore.setItem(KEY, JSON.stringify({ kdf, key: toBase64(await deriveKey(password, kdf)) }));
}

const drive = () => driveClient(() => getAccessToken());

// interactive: Settings ("Back up now", first backup) may show Google's dialog; automatic runs never do.
export async function runBackup(db: Db, interactive: boolean, now = new Date()): Promise<void> {
  try {
    const stored = storedKey();
    if (!stored) throw new Error('No backup password set');
    if (!(await ensureDriveAccess(interactive))) throw new Error('Google Drive access is needed');
    const key = fromBase64(stored.key);
    const changes = await changeCount(db); // read before the data: an edit made during the upload stays pending
    const data = await dumpDb(db, settingsSnapshot(), now);
    const d = drive();
    // Documents first, each uploaded once: a backup never points at a document Drive does not have.
    const onDrive = new Set((await d.list()).map((f) => f.name));
    const safe: string[] = [];
    const needed: string[] = [];
    for (const path of filesOf(data)) {
      const name = docBackupName(path);
      if (onDrive.has(name)) safe.push(path);
      else if (documentExists(path)) needed.push(path);
    }
    await Promise.all(
      needed.map(async (path) => {
        const name = docBackupName(path);
        await d.upload(name, await sealBytes(aead, key, await readDocument(path)));
        safe.push(path);
      }),
    );
    await uploadAndPrune(d, `${BACKUP_PREFIX}${now.toISOString().replace(/[:.]/g, '-')}.json`, await seal(aead, key, stored.kdf, data));
    await markBackedUp(db, changes, safe); // only after the backup file itself is on Drive
    setSetting('last_backup_at', now.toISOString());
    setSetting('last_backup_error', '');
    setSetting('last_backup_error_at', '');
  } catch (e) {
    setSetting('last_backup_error', e instanceof Error ? e.message : String(e));
    setSetting('last_backup_error_at', new Date().toISOString());
    throw e;
  }
}

// On app open: back up when switched on and the interval has passed. Never interrupts the user.
let running = false; // the list loads often; never start two uploads at once
export async function runDueBackup(db: Db): Promise<void> {
  if (running) return;
  const interval = (getSetting('backup_interval') ?? 'weekly') as BackupInterval;
  if (getSetting('backup_enabled') !== '1' || !hasBackupPassword() || !backupDue(getSetting('last_backup_at'), interval)) return;
  running = true;
  await runBackup(db, false)
    .catch(() => {}) // the error is saved and shown in Settings
    .finally(() => (running = false));
}

export async function latestBackup(): Promise<{ id: string; createdTime: string } | null> {
  if (!(await ensureDriveAccess(true))) throw new Error('Google Drive access is needed');
  return (await drive().list()).find((f) => f.name.startsWith(BACKUP_PREFIX)) ?? null;
}

// "Delete all my data" with Drive: every file this app put in the backup folder (backups, documents,
// disconnect copies). drive.file access only ever sees the app's own files.
export async function deleteDriveBackups(): Promise<void> {
  if (!(await ensureDriveAccess(false))) return; // never connected to Drive: nothing there
  const d = drive();
  for (const f of await d.list()) await d.remove(f.id);
}

export class PasswordNeededError extends Error {}

// Restore replaces everything on this phone. The password is needed unless this phone made the backup.
export async function restoreBackup(db: Db, id: string, password: string | null): Promise<void> {
  const text = await drive().download(id);
  const stored = storedKey();
  let derived: StoredKey | null = null;
  const data = await unseal(aead, text, async (kdf) => {
    if (stored && stored.kdf.salt === kdf.salt) return fromBase64(stored.key);
    if (!password) throw new PasswordNeededError();
    const key = await deriveKey(password, kdf);
    derived = { kdf, key: toBase64(key) };
    return key;
  });
  await restoreDb(db, data);
  applySnapshot(data.settings);
  if (derived) SecureStore.setItem(KEY, JSON.stringify(derived)); // keep backing up with the same password

  // Documents this phone does not have yet. One that is missing on Drive is skipped; the detail
  // screen then says the file is not on this phone.
  const key = derived ? fromBase64((derived as StoredKey).key) : fromBase64(stored!.key);
  const files = new Map((await drive().list()).map((f) => [f.name, f.id]));
  for (const path of filesOf(data)) {
    const id = files.get(docBackupName(path));
    if (!id || documentExists(path)) continue;
    await writeDocument(path, await unsealBytes(aead, key, await drive().download(id)));
  }
  // What was just restored is exactly what Drive holds: nothing is pending until the next change.
  await markBackedUp(db, await changeCount(db), filesOf(data).filter((p) => files.has(docBackupName(p))));
}

// Every file a backup refers to: documents, product photos and found product pictures.
const filesOf = (data: { tables: Record<string, Record<string, unknown>[] | undefined> }): string[] => [
  ...(data.tables.attachments ?? []).map((a) => String(a.local_path)),
  ...(data.tables.inbox ?? []).map((a) => String(a.local_path)),
  ...(data.tables.warranties ?? []).flatMap((w) => [w.photo_path, w.found_photo_path].filter((p): p is string => typeof p === 'string')),
];

// --- Disconnect / reconnect an account (section 15) ---

// Encrypted with the backup key (so a backup password must exist), kept on the phone, and also uploaded
// when automatic backup is on. Then the account's warranties are removed. Manual entries stay.
// Also removes Warrantly's access at Google; resolves true when that turned Drive backup off.
export async function disconnectAccount(db: Db, account: Account, now = new Date()): Promise<boolean> {
  const stored = storedKey();
  if (!stored) throw new Error('No backup password set');
  const rows = await dumpAccount(db, account.id);
  const payload = { app: 'warrantly' as const, schema: 0, createdAt: now.toISOString(), tables: { accounts: [rows.account], warranties: rows.warranties, sources: rows.sources, store_rules: [], attachments: rows.attachments!.filter(keptOnDisconnect), returns: [], history: rows.history ?? [], claims: rows.claims ?? [], custom_reminders: rows.custom_reminders ?? [] }, settings: {} };
  const text = await seal(aead, fromBase64(stored.key), stored.kdf, payload);
  await saveDisconnectBackup(db, account.email, text, now.toISOString());
  if (getSetting('backup_enabled') === '1' && (await ensureDriveAccess(false))) {
    await drive().upload(`warrantly-disconnect-${account.email}-${now.toISOString().replace(/[:.]/g, '-')}.json`, text).catch(() => {}); // the copy on the phone is enough
  }
  // Downloaded mail PDFs go too (a restore downloads them again). Scans and imports exist nowhere else,
  // so their files stay for the restore.
  // shortcut: those files stay on the phone if the account is never restored; clean up when that matters.
  deleteDocuments((await deleteAccount(db, account.id)).filter((f) => f.startsWith('mail-')));
  return revokeGoogleAccess(account.email);
}

const keptOnDisconnect = (a: Record<string, unknown>) => !String(a.local_path).startsWith('mail-');

export async function disconnectBackupDate(db: Db, email: string): Promise<string | null> {
  return (await getDisconnectBackup(db, email))?.created_at ?? null;
}

export async function restoreDisconnected(db: Db, account: Account): Promise<void> {
  const saved = await getDisconnectBackup(db, account.email);
  const stored = storedKey();
  if (!saved || !stored) throw new Error('No backup for this account');
  const data = await unseal(aead, saved.envelope, async () => fromBase64(stored.key));
  const rows: AccountRows = { account: data.tables.accounts![0], warranties: data.tables.warranties ?? [], sources: data.tables.sources ?? [], attachments: data.tables.attachments, history: data.tables.history, claims: data.tables.claims, custom_reminders: data.tables.custom_reminders };
  await restoreAccount(db, account.id, rows);
}
