import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { deleteAccount, dumpAccount, getDisconnectBackup, restoreAccount, saveDisconnectBackup, type Account, type AccountRows, type Db } from '@/db/repo.ts';
import { ensureDriveAccess, getAccessToken } from '@/google';
import { applySnapshot, getSetting, setSetting, settingsSnapshot } from '@/settings';
import { driveClient, uploadAndPrune } from './drive.ts';
import { backupDue, deriveKey, dumpDb, fromBase64, KDF, restoreDb, seal, toBase64, unseal, type Aead, type BackupInterval, type KdfParams } from './format.ts';

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
    const text = await seal(aead, fromBase64(stored.key), stored.kdf, await dumpDb(db, settingsSnapshot(), now));
    await uploadAndPrune(drive(), `warrantly-backup-${now.toISOString().replace(/[:.]/g, '-')}.json`, text);
    setSetting('last_backup_at', now.toISOString());
    setSetting('last_backup_error', '');
  } catch (e) {
    setSetting('last_backup_error', e instanceof Error ? e.message : String(e));
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
  return (await drive().list())[0] ?? null;
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
}

// --- Disconnect / reconnect an account (section 15) ---

// Encrypted with the backup key (so a backup password must exist), kept on the phone, and also uploaded
// when automatic backup is on. Then the account's warranties are removed. Manual entries stay.
export async function disconnectAccount(db: Db, account: Account, now = new Date()): Promise<void> {
  const stored = storedKey();
  if (!stored) throw new Error('No backup password set');
  const rows = await dumpAccount(db, account.id);
  const payload = { app: 'warrantly' as const, schema: 0, createdAt: now.toISOString(), tables: { accounts: [rows.account], warranties: rows.warranties, sources: rows.sources, store_rules: [] }, settings: {} };
  const text = await seal(aead, fromBase64(stored.key), stored.kdf, payload);
  await saveDisconnectBackup(db, account.email, text, now.toISOString());
  if (getSetting('backup_enabled') === '1' && (await ensureDriveAccess(false))) {
    await drive().upload(`warrantly-disconnect-${account.email}-${now.toISOString().replace(/[:.]/g, '-')}.json`, text).catch(() => {}); // the copy on the phone is enough
  }
  await deleteAccount(db, account.id);
}

export async function disconnectBackupDate(db: Db, email: string): Promise<string | null> {
  return (await getDisconnectBackup(db, email))?.created_at ?? null;
}

export async function restoreDisconnected(db: Db, account: Account): Promise<void> {
  const saved = await getDisconnectBackup(db, account.email);
  const stored = storedKey();
  if (!saved || !stored) throw new Error('No backup for this account');
  const data = await unseal(aead, saved.envelope, async () => fromBase64(stored.key));
  const rows: AccountRows = { account: data.tables.accounts[0], warranties: data.tables.warranties, sources: data.tables.sources };
  await restoreAccount(db, account.id, rows);
}
