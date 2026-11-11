import { scryptAsync } from '@noble/hashes/scrypt.js';
import type { Db } from '../db/repo.ts';

// Backup (brainstorm section 17): the database as JSON plus settings, encrypted on the phone with a key
// from the user's backup password. Google Drive only ever sees the sealed envelope.

const TABLES = ['accounts', 'warranties', 'sources', 'store_rules', 'attachments'] as const;

export interface BackupData {
  app: 'warrantly';
  schema: number; // PRAGMA user_version of the database the rows came from
  createdAt: string;
  tables: Record<(typeof TABLES)[number], Record<string, unknown>[]>;
  settings: Record<string, string | null>;
}

export async function dumpDb(db: Db, settings: Record<string, string | null>, now = new Date()): Promise<BackupData> {
  const schema = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []))?.user_version ?? 0;
  const tables = {} as BackupData['tables'];
  for (const t of TABLES) tables[t] = await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${t}`, []);
  return { app: 'warrantly', schema, createdAt: now.toISOString(), tables, settings };
}

// Replaces everything on this phone with the backup. Only columns this app version knows are copied,
// so a backup from an older version restores into a newer schema.
export async function restoreDb(db: Db, data: BackupData): Promise<void> {
  if (data.app !== 'warrantly') throw new Error('Not a Warrantly backup');
  const current = (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []))?.user_version ?? 0;
  if (data.schema > current) throw new Error('This backup is from a newer app version. Update Warrantly first.');
  await db.withTransactionAsync(async () => {
    for (const t of [...TABLES].reverse()) await db.runAsync(`DELETE FROM ${t}`, []);
    for (const t of TABLES) {
      const known = new Set((await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${t})`, [])).map((c) => c.name));
      for (const row of data.tables[t] ?? []) {
        const cols = Object.keys(row).filter((c) => known.has(c));
        await db.runAsync(
          `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
          cols.map((c) => row[c] as string | number | null),
        );
      }
    }
  });
}

// AES-256-GCM, supplied by expo-crypto on the phone and node:crypto in tests. `data` has the tag appended.
export interface Aead {
  encrypt(key: Uint8Array, plain: Uint8Array): Promise<{ iv: Uint8Array; data: Uint8Array }>;
  decrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array>; // throws if tampered or wrong key
}

export interface KdfParams {
  N: number;
  r: number;
  p: number;
  salt: string; // base64
}
// scrypt cost: about 1-3 s on a phone, run only when setting the password or restoring on a new phone.
export const KDF = { N: 2 ** 15, r: 8, p: 1 };

export const deriveKey = (password: string, kdf: KdfParams): Promise<Uint8Array> =>
  scryptAsync(password, fromBase64(kdf.salt), { N: kdf.N, r: kdf.r, p: kdf.p, dkLen: 32 });

export class WrongPasswordError extends Error {}

interface Envelope {
  format: 'warrantly-backup';
  v: 1;
  createdAt: string; // readable without the password, so the restore screen can show the date
  kdf: KdfParams;
  iv: string;
  data: string;
}

export async function seal(aead: Aead, key: Uint8Array, kdf: KdfParams, payload: BackupData): Promise<string> {
  const { iv, data } = await aead.encrypt(key, new TextEncoder().encode(JSON.stringify(payload)));
  const env: Envelope = { format: 'warrantly-backup', v: 1, createdAt: payload.createdAt, kdf, iv: toBase64(iv), data: toBase64(data) };
  return JSON.stringify(env);
}

export function readEnvelope(text: string): Envelope {
  const env = JSON.parse(text) as Envelope;
  if (env.format !== 'warrantly-backup' || env.v !== 1) throw new Error('Not a Warrantly backup');
  return env;
}

// `keyFor` returns the stored key when the salt matches, else derives one from the password.
export async function unseal(aead: Aead, text: string, keyFor: (kdf: KdfParams) => Promise<Uint8Array>): Promise<BackupData> {
  const env = readEnvelope(text);
  const key = await keyFor(env.kdf); // its own errors (e.g. "password needed") pass through unchanged
  let plain: Uint8Array;
  try {
    plain = await aead.decrypt(key, fromBase64(env.iv), fromBase64(env.data));
  } catch {
    throw new WrongPasswordError('Wrong backup password');
  }
  return JSON.parse(new TextDecoder().decode(plain)) as BackupData;
}

// Documents (PDFs) are backed up as their own encrypted files, uploaded once each, so a backup stays small.
export const docBackupName = (localPath: string): string => `doc-${localPath}.enc`;

export async function sealBytes(aead: Aead, key: Uint8Array, bytes: Uint8Array): Promise<string> {
  const { iv, data } = await aead.encrypt(key, bytes);
  return JSON.stringify({ format: 'warrantly-doc', v: 1, iv: toBase64(iv), data: toBase64(data) });
}

export async function unsealBytes(aead: Aead, key: Uint8Array, text: string): Promise<Uint8Array> {
  const env = JSON.parse(text) as { format: string; iv: string; data: string };
  if (env.format !== 'warrantly-doc') throw new Error('Not a Warrantly document');
  try {
    return await aead.decrypt(key, fromBase64(env.iv), fromBase64(env.data));
  } catch {
    throw new WrongPasswordError('Wrong backup password');
  }
}

export type BackupInterval = 'weekly' | 'monthly' | '3m' | '6m';
const DAYS: Record<BackupInterval, number> = { weekly: 7, monthly: 30, '3m': 91, '6m': 182 };

// Section 17: background timing is not guaranteed, so a due backup also runs on app open.
export function backupDue(lastIso: string | null, interval: BackupInterval, now = new Date()): boolean {
  return !lastIso || now.getTime() - new Date(lastIso).getTime() >= DAYS[interval] * 86_400_000;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
