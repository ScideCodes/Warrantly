import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { addAttachment, addManual, migrate, saveStoreRule } from '../db/repo.ts';
import { nodeDb } from '../db/testDb.ts';
import { driveClient, uploadAndPrune, FOLDER_NAME } from './drive.ts';
import { backupDue, checkKdf, deriveKey, sharedPdf, docBackupName, dumpDb, readEnvelope, restoreDb, seal, sealBytes, toBase64, unseal, unsealBytes, WrongPasswordError, type Aead } from './format.ts';

// Same AES-256-GCM as expo-crypto, from node:crypto; tag appended to the ciphertext.
const nodeAead: Aead = {
  async encrypt(key, plain) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, iv);
    return { iv, data: Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]) };
  },
  async decrypt(key, iv, data) {
    const d = createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  },
};
const kdf = { N: 2 ** 10, r: 8, p: 1, salt: toBase64(randomBytes(16)) }; // cheap for tests

async function seeded() {
  const db = nodeDb();
  await migrate(db);
  await addManual(db, {
    account_id: null,
    product_name: 'Philips vízforraló', store_name: 'MediaMarkt', purchase_date: '2026-01-15', warranty_start_date: '2026-01-15',
    warranty_months: 36, order_number: null, serial_number: 'SN-1', contact_email: null, contact_phone: null, website_url: null, notes: 'ajándék',
  });
  await saveStoreRule(db, 'pcx.hu', 24);
  await addAttachment(db, 1, 'Philips.pdf', 'scan-1.pdf');
  await db.runAsync(`INSERT INTO accounts (id, provider, email) VALUES (1, 'gmail', 'user@example.com')`, []);
  await db.runAsync(`INSERT INTO returns (account_id, message_id, store_domain, received_at, warranty_id, state) VALUES (1, 'm1', 'mediamarkt.hu', '2026-02-01T10:00:00Z', 1, 'asked')`, []);
  return db;
}

test('backup round trip: dump, encrypt, decrypt, restore on a fresh phone', async () => {
  const source = await seeded();
  const key = await deriveKey('correct horse', kdf);
  const text = await seal(nodeAead, key, kdf, await dumpDb(source, { username: 'Elek' }, new Date('2026-11-11T09:00:00Z')));
  assert.ok(!text.includes('Philips') && !text.includes('Elek'), 'contents are encrypted');
  assert.equal(readEnvelope(text).createdAt, '2026-11-11T09:00:00.000Z');

  const target = nodeDb();
  await migrate(target);
  await addManual(target, { ...(await source.getFirstAsync<any>('SELECT * FROM warranties', []))!, product_name: 'will be replaced' });
  // A refund question on the old data must not survive and point at a restored warranty with the same id.
  await target.runAsync(`INSERT INTO accounts (id, provider, email) VALUES (9, 'gmail', 'old@example.com')`, []);
  await target.runAsync(`INSERT INTO returns (account_id, message_id, store_domain, received_at, warranty_id, state) VALUES (9, 'stale', 'x.hu', '2026-01-01T10:00:00Z', 1, 'asked')`, []);
  const data = await unseal(nodeAead, text, (k) => deriveKey('correct horse', k));
  assert.equal(data.settings.username, 'Elek');
  await restoreDb(target, data);
  for (const t of ['warranties', 'store_rules', 'attachments', 'returns']) {
    assert.deepEqual(await target.getAllAsync(`SELECT * FROM ${t}`, []), await source.getAllAsync(`SELECT * FROM ${t}`, []), t);
  }
});

test('wrong password and tampering are rejected', async () => {
  const key = await deriveKey('right', kdf);
  const text = await seal(nodeAead, key, kdf, await dumpDb(await seeded(), {}));
  await assert.rejects(unseal(nodeAead, text, (k) => deriveKey('wrong', k)), WrongPasswordError);
  const env = JSON.parse(text);
  env.data = env.data.replace(/^./, (c: string) => (c === 'A' ? 'B' : 'A'));
  await assert.rejects(unseal(nodeAead, JSON.stringify(env), async () => key), WrongPasswordError);
  assert.throws(() => readEnvelope('{"format":"other"}'), /Not a Warrantly backup/);
  class Needed extends Error {}
  await assert.rejects(unseal(nodeAead, text, async () => { throw new Needed(); }), Needed); // key errors are not "wrong password"
});

test('restore refuses newer schemas and drops unknown columns from older ones', async () => {
  const db = nodeDb();
  await migrate(db);
  const base = await dumpDb(db, {});
  await assert.rejects(restoreDb(db, { ...base, schema: base.schema + 1 }), /newer app version/);
  await restoreDb(db, { ...base, tables: { ...base.tables, store_rules: [{ store_domain: 'x.hu', default_warranty_months: 12, retired_column: 1 }] } });
  assert.deepEqual((await db.getAllAsync<object>('SELECT * FROM store_rules', [])).map((r) => ({ ...r })), [{ store_domain: 'x.hu', default_warranty_months: 12 }]);
});

test('backupDue by interval', () => {
  const now = new Date('2026-11-11T09:00:00Z');
  assert.equal(backupDue(null, 'weekly', now), true);
  assert.equal(backupDue('2026-11-05T09:00:00Z', 'weekly', now), false);
  assert.equal(backupDue('2026-11-04T09:00:00Z', 'weekly', now), true);
  assert.equal(backupDue('2026-10-01T09:00:00Z', 'monthly', now), true);
  assert.equal(backupDue('2026-09-01T09:00:00Z', '3m', now), false);
});

test('Drive client: one folder, upload, newest first, keep 5', async () => {
  const files: { id: string; name: string; createdTime: string; parent?: string; mimeType?: string; body?: string }[] = [];
  let clock = 0;
  const fakeFetch = (async (url: string, init: RequestInit = {}) => {
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer tok');
    const method = init.method ?? 'GET';
    const u = decodeURIComponent(url);
    if (method === 'GET' && u.includes("mimeType = 'application/vnd.google-apps.folder'")) {
      return Response.json({ files: files.filter((f) => f.mimeType?.includes('folder') && f.name === FOLDER_NAME) });
    }
    if (method === 'GET' && u.includes('in parents')) {
      const parent = u.match(/'([^']+)' in parents/)![1];
      return Response.json({ files: files.filter((f) => f.parent === parent).sort((a, b) => b.createdTime.localeCompare(a.createdTime)) });
    }
    if (method === 'GET' && u.endsWith('alt=media')) return new Response(files.find((f) => u.includes(f.id))!.body);
    if (method === 'DELETE') {
      files.splice(files.findIndex((f) => u.endsWith(f.id)), 1);
      return new Response(null, { status: 204 });
    }
    const id = `f${files.length + clock}`;
    const createdTime = new Date(Date.UTC(2026, 0, 1, 0, 0, ++clock)).toISOString();
    if (url.includes('uploadType=multipart')) {
      const body = String(init.body);
      const meta = JSON.parse(body.split('\r\n\r\n')[1].split('\r\n')[0]);
      files.push({ id, name: meta.name, createdTime, parent: meta.parents[0], body: body.split('\r\n\r\n')[2].split('\r\n--')[0] });
    } else {
      files.push({ id, createdTime, ...JSON.parse(String(init.body)) });
    }
    return Response.json({ id });
  }) as typeof fetch;

  const drive = driveClient(async () => 'tok', fakeFetch);
  await drive.upload(docBackupName('scan-1.pdf'), 'doc'); // an older document file must survive pruning
  for (let i = 1; i <= 7; i++) await uploadAndPrune(drive, `warrantly-backup-${i}.json`, `{"n":${i}}`);
  const kept = await drive.list();
  assert.deepEqual(kept.map((f) => f.name), [
    'warrantly-backup-7.json', 'warrantly-backup-6.json', 'warrantly-backup-5.json', 'warrantly-backup-4.json', 'warrantly-backup-3.json', 'doc-scan-1.pdf.enc',
  ]);
  assert.equal(files.filter((f) => f.mimeType?.includes('folder')).length, 1);
  assert.equal(await drive.download(kept[0].id), '{"n":7}');
});

test('documents are sealed on their own and only open with the right key', async () => {
  const key = await deriveKey('right', kdf);
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]); // "%PDF-1.7"
  const text = await sealBytes(nodeAead, key, pdf);
  assert.ok(!text.includes('JVBERi')); // not the plain base64 of "%PDF"
  assert.deepEqual([...(await unsealBytes(nodeAead, key, text))], [...pdf]);
  await assert.rejects(unsealBytes(nodeAead, await deriveKey('wrong', kdf), text), WrongPasswordError);
  assert.equal(docBackupName('scan-1.pdf'), 'doc-scan-1.pdf.enc');
});

test('backup files cannot ask for extreme key-derivation cost', () => {
  assert.throws(() => checkKdf({ N: 2 ** 30, r: 8, p: 1, salt: 'AA==' }), /Damaged backup/);
  assert.throws(() => checkKdf({ N: 2 ** 15, r: 1000, p: 1, salt: 'AA==' }), /Damaged backup/);
  assert.throws(() => checkKdf({ N: 3000, r: 8, p: 1, salt: 'AA==' }), /Damaged backup/);
  assert.throws(() => checkKdf({ N: 2 ** 18, r: 16, p: 1, salt: 'AA==' }), /Damaged backup/); // 512 MB of scrypt memory
  assert.throws(() => checkKdf({ N: 2 ** 15, r: 8, p: 5, salt: 'AA==' }), /Damaged backup/);
  assert.equal(checkKdf({ N: 2 ** 15, r: 8, p: 1, salt: 'AA==' }).N, 2 ** 15);
  assert.equal(checkKdf({ N: 2 ** 18, r: 1, p: 1, salt: 'AA==' }).N, 2 ** 18);
});

test('a shared file keeps only PDFs of a bounded size', () => {
  assert.deepEqual([...sharedPdf(toBase64(new Uint8Array([37, 80, 68, 70, 45])))!], [37, 80, 68, 70, 45]);
  assert.equal(sharedPdf(toBase64(new TextEncoder().encode('<html>'))), null);
  assert.equal(sharedPdf(42), null);
  assert.equal(sharedPdf('JVBERi'.padEnd(41943044, 'A')), null); // over 30 MB, refused before decoding
});
