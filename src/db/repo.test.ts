import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { MailProvider } from '../mail/provider.ts';
import type { MailMessage } from '../parser/types.ts';
import { getWarranty, listWarranties, migrate, type Db } from './repo.ts';
import { syncAccount } from './sync.ts';

// Same SQL as on the phone, run on Node's built-in SQLite.
function nodeDb(): Db & { raw: DatabaseSync } {
  const d = new DatabaseSync(':memory:');
  return {
    raw: d,
    execAsync: async (sql) => void d.exec(sql),
    runAsync: async (sql, p) => {
      const r = d.prepare(sql).run(...p);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllAsync: async <T,>(sql: string, p: (string | number | null)[]) => d.prepare(sql).all(...p) as T[],
    getFirstAsync: async <T,>(sql: string, p: (string | number | null)[]) => (d.prepare(sql).get(...p) ?? null) as T | null,
    withTransactionAsync: async (task) => {
      d.exec('BEGIN');
      try {
        await task();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

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
  assert.equal((db.raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 2);
});

test('sync saves warranties, retries failed mails, never duplicates', async () => {
  const db = nodeDb();
  await migrate(db);
  const now = new Date('2026-11-11T10:00:00Z');
  const ids = ['pcx-invoice', 'conrad-invoice', 'synthetic-en-warranty', 'alza-order', 'merlin-cancel', 'steam', 'quota-hit'];
  const afters: (Date | null)[] = [];

  const failed = await syncAccount(db, fakeProvider(ids, afters), 'user@example.com', undefined, now);
  assert.deepEqual(failed.map((f) => f.id), ['quota-hit']);
  assert.equal(afters[0]?.toISOString().slice(0, 7), '2024-11'); // first sync looks back 24 months

  const complete = await listWarranties(db, 'complete');
  assert.deepEqual(complete.map((w) => [w.product_name, w.warranty_months, w.length_is_suggested, w.end_date]), [
    ['Acme Kettle 1.7L', 24, 0, '2028-03-02'],
  ]);
  const attention = await listWarranties(db, 'needs_input');
  assert.deepEqual(attention.map((w) => [w.store_name, w.product_name, w.missing_fields, w.warranty_start_date]), [
    ['Conrad HU', null, '["productName","warrantyMonths"]', '2026-08-26'], // details only in the PDF
    ['PCX Webáruház', null, '["productName","warrantyMonths"]', '2026-09-15'], // picked up in store: start = that day
  ]);
  const count = (sql: string) => (db.raw.prepare(sql).get() as { n: number }).n;
  assert.equal(count(`SELECT COUNT(*) n FROM warranties WHERE status = 'ignored'`), 2); // Alza order confirmation + Steam, kept for review
  assert.equal(count(`SELECT COUNT(*) n FROM sources WHERE kind = 'return' AND warranty_id IS NULL`), 1);
  assert.equal(count('SELECT COUNT(*) n FROM accounts WHERE last_synced_at IS NULL'), 1); // a mail failed: marker stays

  // Next sync: same range again (marker did not move), only the failed mail is new work.
  const failed2 = await syncAccount(db, fakeProvider(ids.filter((id) => id !== 'quota-hit'), afters), 'user@example.com', undefined, now);
  assert.deepEqual(failed2, []);
  assert.equal(afters[1]?.toISOString().slice(0, 7), '2024-11');
  assert.equal(count('SELECT COUNT(*) n FROM warranties'), 5);
  assert.equal(count(`SELECT COUNT(*) n FROM accounts WHERE last_synced_at = '2026-11-11T10:00:00.000Z'`), 1);

  // Third sync starts from the marker.
  await syncAccount(db, fakeProvider([], afters), 'user@example.com', undefined, now);
  assert.equal(afters[2]?.toISOString(), '2026-11-11T10:00:00.000Z');

  const w = await getWarranty(db, complete[0].id);
  assert.equal(w?.store_name, 'Example Electronics');
  assert.equal(await getWarranty(db, 999), null);
});
