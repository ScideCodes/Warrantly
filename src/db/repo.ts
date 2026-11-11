import type { ParseResult, StoreRules } from '../parser/types.ts';
import { DEFAULT_WARRANTY_MONTHS } from '../parser/keywords.ts';
import { endDate } from '../warranty.ts';

type Param = string | number | null;

// The subset of expo-sqlite's SQLiteDatabase used here, so tests can pass a node:sqlite adapter.
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: Param[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params: Param[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: Param[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

// Data model from brainstorm section 12. Attachments arrive in build step 4.
const MIGRATIONS = [
  `CREATE TABLE accounts (
     id INTEGER PRIMARY KEY,
     provider TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE,
     label TEXT,
     last_synced_at TEXT,
     sync_range_months INTEGER
   );
   CREATE TABLE warranties (
     id INTEGER PRIMARY KEY,
     account_id INTEGER REFERENCES accounts(id),
     origin TEXT NOT NULL,
     product_name TEXT,
     store_name TEXT NOT NULL,
     store_domain TEXT,
     purchase_date TEXT NOT NULL,
     warranty_start_date TEXT NOT NULL,
     start_is_suggested INTEGER NOT NULL DEFAULT 1,
     warranty_months INTEGER NOT NULL,
     length_is_suggested INTEGER NOT NULL,
     order_number TEXT,
     serial_number TEXT,
     notes TEXT,
     contact_email TEXT,
     contact_phone TEXT,
     website_url TEXT,
     status TEXT NOT NULL,
     missing_fields TEXT NOT NULL DEFAULT '[]',
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE sources (
     id INTEGER PRIMARY KEY,
     account_id INTEGER NOT NULL REFERENCES accounts(id),
     warranty_id INTEGER REFERENCES warranties(id),
     message_id TEXT NOT NULL,
     kind TEXT NOT NULL,
     received_at TEXT NOT NULL,
     subject TEXT,
     sender TEXT
   );
   CREATE INDEX sources_message ON sources(account_id, message_id);
   CREATE TABLE store_rules (
     store_domain TEXT PRIMARY KEY,
     default_warranty_months INTEGER NOT NULL
   );`,
  // v2: only invoices and warranty documents count now (no order confirmations). Nothing is
  // user-edited yet, so drop the imported mail and re-read it with the new rules on next sync.
  `DELETE FROM sources;
   DELETE FROM warranties WHERE origin = 'gmail';
   UPDATE accounts SET last_synced_at = NULL;`,
  // v3: warranty documents only, no invoices. Same reset as v2.
  `DELETE FROM sources;
   DELETE FROM warranties WHERE origin = 'gmail';
   UPDATE accounts SET last_synced_at = NULL;`,
  // v4: mails stating a warranty length count too, merged per product. Same reset.
  `DELETE FROM sources;
   DELETE FROM warranties WHERE origin = 'gmail';
   UPDATE accounts SET last_synced_at = NULL;`,
  // v5: encrypted backup of an account's data, made before it is disconnected (section 15). Latest only.
  `CREATE TABLE disconnect_backups (
     email TEXT PRIMARY KEY,
     created_at TEXT NOT NULL,
     envelope TEXT NOT NULL
   );`,
];

export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

export interface Account {
  id: number;
  email: string;
  last_synced_at: string | null;
}

export async function listAccounts(db: Db): Promise<Account[]> {
  return db.getAllAsync<Account>(`SELECT id, email, last_synced_at FROM accounts ORDER BY id`, []);
}

export async function upsertAccount(db: Db, email: string): Promise<Account> {
  await db.runAsync(`INSERT INTO accounts (provider, email) VALUES ('gmail', ?) ON CONFLICT(email) DO NOTHING`, [email]);
  return (await db.getFirstAsync<Account>('SELECT id, email, last_synced_at FROM accounts WHERE email = ?', [email]))!;
}

export async function setLastSynced(db: Db, accountId: number, iso: string): Promise<void> {
  await db.runAsync('UPDATE accounts SET last_synced_at = ? WHERE id = ?', [iso, accountId]);
}

export async function knownMessageIds(db: Db, accountId: number): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ message_id: string }>('SELECT DISTINCT message_id FROM sources WHERE account_id = ?', [accountId]);
  return new Set(rows.map((r) => r.message_id));
}

export async function loadStoreRules(db: Db): Promise<StoreRules> {
  const rows = await db.getAllAsync<{ store_domain: string; default_warranty_months: number }>('SELECT * FROM store_rules', []);
  return Object.fromEntries(rows.map((r) => [r.store_domain, { defaultWarrantyMonths: r.default_warranty_months }]));
}

// One warranty per product (section 11). A purchase with no product found still gets one
// record so it shows up in "Needs your attention". Ignored mails are kept as `ignored`
// records so they can be reviewed later (section 8). Returns only get a source row until
// matching lands in build step 6.
export async function saveResult(db: Db, accountId: number, r: ParseResult, now = new Date().toISOString()): Promise<void> {
  await db.withTransactionAsync(async () => {
    const products = r.kind === 'return' ? [] : r.items.length ? r.items : [null];
    for (const item of products) {
      if (item && r.kind === 'purchase' && (await mergeIntoExisting(db, accountId, r, item.name))) continue;
      const months = item?.warrantyMonths ?? null;
      const missing = r.kind === 'ignored' ? [] : item ? (months ? [] : ['warrantyMonths']) : r.missingFields;
      const status = r.kind === 'ignored' ? 'ignored' : missing.length ? 'needs_input' : 'complete';
      const res = await db.runAsync(
        `INSERT INTO warranties (account_id, origin, product_name, store_name, store_domain, purchase_date, warranty_start_date,
           warranty_months, length_is_suggested, order_number, contact_email, contact_phone, website_url, status, missing_fields,
           created_at, updated_at)
         VALUES (?, 'gmail', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [accountId, item?.name ?? null, r.storeName, r.storeDomain, r.purchaseDate, r.suggestedStartDate,
          months ?? DEFAULT_WARRANTY_MONTHS, months ? 0 : 1, r.orderNumber, r.contactEmail, r.contactPhone, r.websiteUrl,
          status, JSON.stringify(missing), now, now],
      );
      await insertSource(db, accountId, res.lastInsertRowId, r);
    }
    if (!products.length) await insertSource(db, accountId, null, r);
  });
}

// One shop order sends several mails naming the same product (order, packing, pickup, review request).
// shortcut: same store + same product name within 60 days counts as one purchase, so buying the same
// item twice in two months merges; upgrade with order numbers in build step 6 (dedupe).
async function mergeIntoExisting(db: Db, accountId: number, r: ParseResult, product: string): Promise<boolean> {
  const hit = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM warranties WHERE account_id = ? AND store_domain = ? AND product_name = ? AND status != 'ignored'
       AND abs(julianday(purchase_date) - julianday(?)) <= 60 LIMIT 1`,
    [accountId, r.storeDomain, product, r.purchaseDate],
  );
  if (!hit) return false;
  // The earliest mail is closest to the purchase; a confirmed start date is left alone.
  await db.runAsync(
    `UPDATE warranties SET purchase_date = min(purchase_date, ?),
       warranty_start_date = CASE WHEN start_is_suggested = 1 THEN min(warranty_start_date, ?) ELSE warranty_start_date END
     WHERE id = ?`,
    [r.purchaseDate, r.suggestedStartDate, hit.id],
  );
  await insertSource(db, accountId, hit.id, r);
  return true;
}

function insertSource(db: Db, accountId: number, warrantyId: number | null, r: ParseResult) {
  return db.runAsync(
    'INSERT INTO sources (account_id, warranty_id, message_id, kind, received_at, subject, sender) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [accountId, warrantyId, r.messageId, r.kind, r.receivedAt, r.subject, r.sender],
  );
}

export interface WarrantyRow {
  id: number;
  account_id: number | null;
  origin: 'gmail' | 'manual' | 'scan';
  product_name: string | null;
  store_name: string;
  store_domain: string | null;
  purchase_date: string;
  warranty_start_date: string;
  start_is_suggested: number;
  warranty_months: number;
  length_is_suggested: number;
  order_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  serial_number: string | null;
  notes: string | null;
  status: 'complete' | 'needs_input' | 'ignored';
  missing_fields: string;
}

export type Warranty = WarrantyRow & { end_date: string };
const withEnd = (w: WarrantyRow): Warranty => ({ ...w, end_date: endDate(w.warranty_start_date, w.warranty_months) });

// Main list: complete warranties only; needs-input items live in the attention list (section 9).
export async function listWarranties(db: Db, status: 'complete' | 'needs_input'): Promise<Warranty[]> {
  const rows = await db.getAllAsync<WarrantyRow>('SELECT * FROM warranties WHERE status = ?', [status]);
  return rows.map(withEnd).sort((a, b) => a.end_date.localeCompare(b.end_date));
}

export async function getWarranty(db: Db, id: number): Promise<Warranty | null> {
  const row = await db.getFirstAsync<WarrantyRow>('SELECT * FROM warranties WHERE id = ?', [id]);
  return row && withEnd(row);
}

// What the add/edit form saves (section 18 "Manual add"). Saved values count as confirmed.
export interface WarrantyInput {
  account_id: number | null;
  product_name: string;
  store_name: string;
  purchase_date: string;
  warranty_start_date: string;
  warranty_months: number;
  order_number: string | null;
  serial_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  notes: string | null;
}
const FIELDS = ['account_id', 'product_name', 'store_name', 'purchase_date', 'warranty_start_date', 'warranty_months', 'order_number',
  'serial_number', 'contact_email', 'contact_phone', 'website_url', 'notes'] as const;

// Manual entries go to the tab the user picks: an account, or null for the general "Manual" tab (section 15).
export async function addManual(db: Db, w: WarrantyInput, now = new Date().toISOString()): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO warranties (origin, ${FIELDS.join(', ')}, start_is_suggested, length_is_suggested, status, created_at, updated_at)
     VALUES ('manual', ${FIELDS.map(() => '?').join(', ')}, 0, 0, 'complete', ?, ?)`,
    [...FIELDS.map((f) => w[f]), now, now],
  );
  return res.lastInsertRowId;
}

// Editing confirms the item: suggested labels go, and a needs-input item becomes complete.
export async function updateWarranty(db: Db, id: number, w: WarrantyInput, now = new Date().toISOString()): Promise<void> {
  await db.runAsync(
    `UPDATE warranties SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, start_is_suggested = 0, length_is_suggested = 0,
       status = 'complete', missing_fields = '[]', updated_at = ? WHERE id = ?`,
    [...FIELDS.map((f) => w[f]), now, id],
  );
}

// "Remember this for [store]" (section 8): later mails from this shop get this length.
export async function saveStoreRule(db: Db, storeDomain: string, months: number): Promise<void> {
  await db.runAsync(
    `INSERT INTO store_rules (store_domain, default_warranty_months) VALUES (?, ?)
     ON CONFLICT(store_domain) DO UPDATE SET default_warranty_months = excluded.default_warranty_months`,
    [storeDomain, months],
  );
}

// "Not a warranty" (section 9): hidden, kept for the Ignored screen.
export async function ignoreWarranty(db: Db, id: number): Promise<void> {
  await db.runAsync(`UPDATE warranties SET status = 'ignored', updated_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

// Delete (section 10). The source rows stay as the hidden marker, so the next sync does not add
// the mail back; they just stop pointing at the deleted record.
export async function deleteWarranty(db: Db, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE sources SET warranty_id = NULL WHERE warranty_id = ?', [id]);
    await db.runAsync('DELETE FROM warranties WHERE id = ?', [id]);
  });
}

// --- Disconnecting and reconnecting an account (section 15) ---

export interface AccountRows {
  account: Record<string, unknown>;
  warranties: Record<string, unknown>[];
  sources: Record<string, unknown>[];
}

export async function dumpAccount(db: Db, accountId: number): Promise<AccountRows> {
  return {
    account: (await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM accounts WHERE id = ?', [accountId]))!,
    warranties: await db.getAllAsync('SELECT * FROM warranties WHERE account_id = ?', [accountId]),
    sources: await db.getAllAsync('SELECT * FROM sources WHERE account_id = ?', [accountId]),
  };
}

// Removes the account's warranties and mail markers. Manual and scanned entries are not affected.
export async function deleteAccount(db: Db, accountId: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM sources WHERE account_id = ?', [accountId]);
    await db.runAsync('DELETE FROM warranties WHERE account_id = ?', [accountId]);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', [accountId]);
  });
}

// Puts a disconnect backup back under the (re)connected account. Rows get new ids, so nothing added
// since then can collide; sources follow their warranty.
export async function restoreAccount(db: Db, accountId: number, rows: AccountRows): Promise<void> {
  const insert = async (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    const res = await db.runAsync(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c] as string | number | null));
    return res.lastInsertRowId;
  };
  await db.withTransactionAsync(async () => {
    const ids = new Map<unknown, number>();
    for (const { id, ...w } of rows.warranties) ids.set(id, await insert('warranties', { ...w, account_id: accountId }));
    for (const { id: _id, ...src } of rows.sources) {
      await insert('sources', { ...src, account_id: accountId, warranty_id: src.warranty_id == null ? null : (ids.get(src.warranty_id) ?? null) });
    }
    await db.runAsync('UPDATE accounts SET last_synced_at = ? WHERE id = ?', [rows.account.last_synced_at as string | null, accountId]);
  });
}

export async function saveDisconnectBackup(db: Db, email: string, envelope: string, now = new Date().toISOString()): Promise<void> {
  await db.runAsync(
    `INSERT INTO disconnect_backups (email, created_at, envelope) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET created_at = excluded.created_at, envelope = excluded.envelope`,
    [email, now, envelope],
  );
}

export async function getDisconnectBackup(db: Db, email: string): Promise<{ created_at: string; envelope: string } | null> {
  return db.getFirstAsync('SELECT created_at, envelope FROM disconnect_backups WHERE email = ?', [email]);
}
