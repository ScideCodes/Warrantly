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

function insertSource(db: Db, accountId: number, warrantyId: number | null, r: ParseResult) {
  return db.runAsync(
    'INSERT INTO sources (account_id, warranty_id, message_id, kind, received_at, subject, sender) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [accountId, warrantyId, r.messageId, r.kind, r.receivedAt, r.subject, r.sender],
  );
}

export interface WarrantyRow {
  id: number;
  product_name: string | null;
  store_name: string;
  purchase_date: string;
  warranty_start_date: string;
  start_is_suggested: number;
  warranty_months: number;
  length_is_suggested: number;
  order_number: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
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
