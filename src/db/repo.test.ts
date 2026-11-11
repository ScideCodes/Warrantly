import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { MailProvider } from '../mail/provider.ts';
import type { MailMessage } from '../parser/types.ts';
import { addManual, deleteAccount, deleteWarranty, dumpAccount, listAccounts, restoreAccount, upsertAccount, getWarranty, ignoreWarranty, listWarranties, loadStoreRules, migrate, saveStoreRule, updateWarranty } from './repo.ts';
import { syncAccount } from './sync.ts';
import { nodeDb } from './testDb.ts';

const fixtures: { message: MailMessage }[] = JSON.parse(readFileSync(new URL('../parser/fixtures/emails.json', import.meta.url), 'utf8'));
const byId = new Map(fixtures.map((f) => [f.message.id, f.message]));

function fakeProvider(ids: string[], afters: (Date | null)[]): MailProvider {
  return {
    listMessageIds: async (after) => (afters.push(after), ids),
    getMessage: async (id) => {
      const m = byId.get(id);
      if (!m) throw new Error(`Gmail 403 on messages/${id}: rateLimitExceeded`);
      return m;
    },
    getAttachment: async () => new Uint8Array(),
  };
}

test('migrate is idempotent', async () => {
  const db = nodeDb();
  await migrate(db);
  await migrate(db);
  assert.equal((db.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 5);
});

test('sync saves warranties, retries failed mails, never duplicates', async () => {
  const db = nodeDb();
  await migrate(db);
  const now = new Date('2026-11-11T10:00:00Z');
  const ids = ['pcx-invoice', 'conrad-invoice', 'conrad-order-rule', 'synthetic-en-warranty', 'alza-order', 'merlin-cancel', 'steam', 'quota-hit'];
  const afters: (Date | null)[] = [];

  const failed = await syncAccount(db, fakeProvider(ids, afters), 'user@example.com', undefined, now);
  assert.deepEqual(failed.map((f) => f.id), ['quota-hit']);
  assert.equal(afters[0]?.toISOString().slice(0, 7), '2024-11'); // first sync looks back 24 months

  const complete = await listWarranties(db, 'complete');
  assert.deepEqual(complete.map((w) => [w.product_name, w.warranty_months, w.length_is_suggested, w.end_date]), [
    ['Acme Kettle 1.7L', 24, 0, '2028-03-02'],
  ]);
  const attention = await listWarranties(db, 'needs_input');
  assert.deepEqual(attention.map((w) => [w.product_name, w.missing_fields, w.length_is_suggested]), [
    ['Jonsbo VC-20 Videokártya tartó', '["warrantyMonths"]', 1], // warranty card without a length
  ]);
  const count = (sql: string) => (db.raw.prepare(sql).get() as { n: number }).n;
  assert.equal(count(`SELECT COUNT(*) n FROM warranties WHERE status = 'ignored'`), 4); // 2 invoices, order confirmation, Steam: kept for review
  assert.equal(count(`SELECT COUNT(*) n FROM sources WHERE kind = 'return' AND warranty_id IS NULL`), 1);
  assert.equal(count('SELECT COUNT(*) n FROM accounts WHERE last_synced_at IS NULL'), 1); // a mail failed: marker stays

  // Next sync: same range again (marker did not move), only the failed mail is new work.
  const failed2 = await syncAccount(db, fakeProvider(ids.filter((id) => id !== 'quota-hit'), afters), 'user@example.com', undefined, now);
  assert.deepEqual(failed2, []);
  assert.equal(afters[1]?.toISOString().slice(0, 7), '2024-11');
  assert.equal(count('SELECT COUNT(*) n FROM warranties'), 6);
  assert.equal(count(`SELECT COUNT(*) n FROM accounts WHERE last_synced_at = '2026-11-11T10:00:00.000Z'`), 1);

  // Third sync starts from the marker.
  await syncAccount(db, fakeProvider([], afters), 'user@example.com', undefined, now);
  assert.equal(afters[2]?.toISOString(), '2026-11-11T10:00:00.000Z');

  const w = await getWarranty(db, complete[0].id);
  assert.equal(w?.store_name, 'Example Electronics');
  assert.equal(await getWarranty(db, 999), null);
});

test('manual add, edit, store rule, ignore and delete', async () => {
  const db = nodeDb();
  await migrate(db);
  const input = {
    account_id: null,
    product_name: 'Acme Kettle', store_name: 'Example', purchase_date: '2026-11-01', warranty_start_date: '2026-11-03',
    warranty_months: 36, order_number: null, serial_number: 'SN1', contact_email: null, contact_phone: null, website_url: null, notes: 'gift',
  };
  const id = await addManual(db, input);
  const added = await getWarranty(db, id);
  assert.deepEqual([added?.origin, added?.status, added?.end_date, added?.serial_number, added?.length_is_suggested], ['manual', 'complete', '2029-11-03', 'SN1', 0]);

  // A synced needs-input item becomes complete once edited.
  const ids = ['conrad-order-rule'];
  await syncAccount(db, fakeProvider(ids, []), 'user@example.com');
  const [pending] = await listWarranties(db, 'needs_input');
  await updateWarranty(db, pending.id, { ...input, product_name: 'Jonsbo VC-20', warranty_months: 12 });
  assert.deepEqual(await listWarranties(db, 'needs_input'), []);
  assert.equal((await getWarranty(db, pending.id))?.store_domain, 'conrad.hu'); // edit keeps the source link

  await saveStoreRule(db, 'conrad.hu', 12);
  await saveStoreRule(db, 'conrad.hu', 24);
  assert.deepEqual(await loadStoreRules(db), { 'conrad.hu': { defaultWarrantyMonths: 24 } });

  await ignoreWarranty(db, id);
  assert.equal((await getWarranty(db, id))?.status, 'ignored');

  // Deleting keeps the source marker, so the next sync does not import the mail again.
  await deleteWarranty(db, pending.id);
  assert.equal(await getWarranty(db, pending.id), null);
  await syncAccount(db, fakeProvider(ids, []), 'user@example.com');
  assert.deepEqual(await listWarranties(db, 'needs_input'), []);
});

test('mails about the same product from one shop merge into one warranty', async () => {
  const db = nodeDb();
  await migrate(db);
  const order = byId.get('pcx-order')!; // 2026-09-12, "24 hó gar."
  byId.set('pcx-review', { ...order, id: 'pcx-review', subject: 'Hogyan vált be? Értékelj és nyerj!', date: '2026-10-01T08:00:00Z' });
  byId.set('pcx-next-year', { ...order, id: 'pcx-next-year', date: '2027-09-12T08:00:00Z' });
  await syncAccount(db, fakeProvider(['pcx-review', 'pcx-order', 'pcx-next-year'], []), 'user@example.com'); // newest-first, like Gmail
  const rows = await listWarranties(db, 'complete');
  assert.deepEqual(rows.map((w) => [w.product_name, w.purchase_date, w.warranty_start_date]), [
    ['Gembird MA-DA1-05 asztali tartó konzol', '2026-09-12', '2026-09-12'], // earliest mail wins
    ['Gembird MA-DA1-05 asztali tartó konzol', '2027-09-12', '2027-09-12'], // a year later: a new purchase
  ]);
  const sources = db.raw.prepare('SELECT COUNT(*) n FROM sources WHERE warranty_id = ?').get(rows[0].id) as { n: number };
  assert.equal(sources.n, 2);
});

test('disconnect removes one account only; reconnect restores it under the new account id', async () => {
  const db = nodeDb();
  await migrate(db);
  await syncAccount(db, fakeProvider(['pcx-order', 'synthetic-en-warranty'], []), 'work@example.com');
  await syncAccount(db, fakeProvider(['conrad-order-rule'], []), 'home@example.com');
  const manualId = await addManual(db, {
    account_id: null, product_name: 'Kettle', store_name: 'Shop', purchase_date: '2026-01-01', warranty_start_date: '2026-01-01',
    warranty_months: 24, order_number: null, serial_number: null, contact_email: null, contact_phone: null, website_url: null, notes: null,
  });
  const work = (await listAccounts(db)).find((a) => a.email === 'work@example.com')!;
  const count = (sql: string, ...p: (string | number)[]) => (db.raw.prepare(sql).get(...p) as { n: number }).n;
  const workWarranties = count('SELECT COUNT(*) n FROM warranties WHERE account_id = ?', work.id);
  assert.equal(workWarranties, 2);

  const rows = await dumpAccount(db, work.id);
  await deleteAccount(db, work.id);
  assert.deepEqual((await listAccounts(db)).map((a) => a.email), ['home@example.com']);
  assert.equal(count('SELECT COUNT(*) n FROM warranties WHERE account_id IS NULL AND id = ?', manualId), 1); // manual kept
  assert.equal(count('SELECT COUNT(*) n FROM warranties WHERE account_id = (SELECT id FROM accounts WHERE email = ?)', 'home@example.com'), 1);

  // Reconnect: a new account row, then the backup comes back under it with fresh ids.
  const again = await upsertAccount(db, 'work@example.com');
  assert.notEqual(again.id, work.id);
  await restoreAccount(db, again.id, rows);
  assert.equal(count('SELECT COUNT(*) n FROM warranties WHERE account_id = ?', again.id), workWarranties);
  assert.equal(count('SELECT COUNT(*) n FROM sources s JOIN warranties w ON w.id = s.warranty_id WHERE s.account_id = ?', again.id), 2);
  // The mails are known again, so the next sync does not import them twice.
  await syncAccount(db, fakeProvider(['pcx-order', 'synthetic-en-warranty'], []), 'work@example.com');
  assert.equal(count('SELECT COUNT(*) n FROM warranties WHERE account_id = ?', again.id), workWarranties);
});
