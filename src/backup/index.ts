import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { Db } from '@/db/repo.ts';
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
