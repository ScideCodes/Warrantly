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
  // v6: documents kept with a warranty, e.g. the PDF of a scanned receipt (section 12 "attachments").
  // local_path is the file name inside the app's attachments folder, which survives a moved app folder.
  `CREATE TABLE attachments (
     id INTEGER PRIMARY KEY,
     warranty_id INTEGER NOT NULL REFERENCES warranties(id),
     source_id INTEGER REFERENCES sources(id),
     filename TEXT NOT NULL,
     local_path TEXT NOT NULL
   );`,
  // v7: mail PDFs are downloaded now (build step 4); this marks accounts whose earlier mails were
  // already checked for PDFs once.
  `ALTER TABLE accounts ADD COLUMN docs_backfilled INTEGER NOT NULL DEFAULT 0;`,
  // v8: return / refund / cancellation mails (section 11), matched to a warranty after each sync.
  // state: unmatched (no warranty found yet), asked (card in Needs your attention), deleted, kept.
  `CREATE TABLE returns (
     id INTEGER PRIMARY KEY,
     account_id INTEGER NOT NULL REFERENCES accounts(id),
     message_id TEXT NOT NULL,
     store_domain TEXT NOT NULL,
     order_number TEXT,
     products TEXT NOT NULL DEFAULT '[]',
     received_at TEXT NOT NULL,
     warranty_id INTEGER REFERENCES warranties(id),
     state TEXT NOT NULL DEFAULT 'unmatched'
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
// Returns the ids of the warranties the mail created or was merged into.
export async function saveResult(db: Db, accountId: number, r: ParseResult, now = new Date().toISOString()): Promise<number[]> {
  const ids: number[] = [];
  await db.withTransactionAsync(async () => {
    const products = r.kind === 'return' ? [] : r.items.length ? r.items : [null];
    for (const item of products) {
      const merged = item && r.kind === 'purchase' ? await mergeIntoExisting(db, accountId, r, item.name) : null;
      if (merged) {
        ids.push(merged);
        continue;
      }
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
      ids.push(res.lastInsertRowId);
    }
    if (!products.length) await insertSource(db, accountId, null, r);
    if (r.kind === 'return') {
      await db.runAsync(
        'INSERT INTO returns (account_id, message_id, store_domain, order_number, products, received_at) VALUES (?, ?, ?, ?, ?, ?)',
        [accountId, r.messageId, r.storeDomain, r.orderNumber, JSON.stringify(r.items.map((i) => i.name)), r.receivedAt],
      );
    }
  });
  return ids;
}

// One shop order sends several mails naming the same product (order, packing, pickup, review request).
// shortcut: same store + same product name within 60 days counts as one purchase, so buying the same
// item twice in two months merges; upgrade with order numbers in build step 6 (dedupe).
async function mergeIntoExisting(db: Db, accountId: number, r: ParseResult, product: string): Promise<number | null> {
  const hit = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM warranties WHERE account_id = ? AND store_domain = ? AND product_name = ? AND status != 'ignored'
       AND abs(julianday(purchase_date) - julianday(?)) <= 60 LIMIT 1`,
    [accountId, r.storeDomain, product, r.purchaseDate],
  );
  if (!hit) return null;
  // The earliest mail is closest to the purchase; a confirmed start date is left alone.
  await db.runAsync(
    `UPDATE warranties SET purchase_date = min(purchase_date, ?),
       warranty_start_date = CASE WHEN start_is_suggested = 1 THEN min(warranty_start_date, ?) ELSE warranty_start_date END
     WHERE id = ?`,
    [r.purchaseDate, r.suggestedStartDate, hit.id],
  );
  await insertSource(db, accountId, hit.id, r);
  return hit.id;
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
export async function addManual(db: Db, w: WarrantyInput, origin: 'manual' | 'scan' = 'manual', now = new Date().toISOString()): Promise<number> {
  const res = await db.runAsync(
    `INSERT INTO warranties (origin, ${FIELDS.join(', ')}, start_is_suggested, length_is_suggested, status, created_at, updated_at)
     VALUES (?, ${FIELDS.map(() => '?').join(', ')}, 0, 0, 'complete', ?, ?)`,
    [origin, ...FIELDS.map((f) => w[f]), now, now],
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
// the mail back; they just stop pointing at the deleted record. Returns the attachment files the
// caller must delete from disk.
export async function deleteWarranty(db: Db, id: number): Promise<string[]> {
  const files = (await listAttachments(db, id)).map((a) => a.local_path);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM attachments WHERE warranty_id = ?', [id]);
    await db.runAsync('UPDATE sources SET warranty_id = NULL WHERE warranty_id = ?', [id]);
    await db.runAsync('DELETE FROM warranties WHERE id = ?', [id]);
  });
  return files;
}

export interface Attachment {
  id: number;
  filename: string;
  local_path: string;
}

export async function addAttachment(db: Db, warrantyId: number, filename: string, localPath: string): Promise<void> {
  await db.runAsync('INSERT INTO attachments (warranty_id, filename, local_path) VALUES (?, ?, ?)', [warrantyId, filename, localPath]);
}

// Returns the file to delete from disk.
export async function deleteAttachment(db: Db, id: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ local_path: string }>('SELECT local_path FROM attachments WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM attachments WHERE id = ?', [id]);
  return row?.local_path ?? null;
}

export async function listAttachments(db: Db, warrantyId: number): Promise<Attachment[]> {
  return db.getAllAsync('SELECT id, filename, local_path FROM attachments WHERE warranty_id = ? ORDER BY id', [warrantyId]);
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
// Returns the attachment files the caller must delete from disk.
export async function deleteAccount(db: Db, accountId: number): Promise<string[]> {
  const files = await db.getAllAsync<{ local_path: string }>(
    'SELECT local_path FROM attachments WHERE warranty_id IN (SELECT id FROM warranties WHERE account_id = ?)',
    [accountId],
  );
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM attachments WHERE warranty_id IN (SELECT id FROM warranties WHERE account_id = ?)', [accountId]);
    await db.runAsync('DELETE FROM sources WHERE account_id = ?', [accountId]);
    await db.runAsync('DELETE FROM warranties WHERE account_id = ?', [accountId]);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', [accountId]);
  });
  return files.map((f) => f.local_path);
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

// --- Mail PDFs (build step 4) ---

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// A PDF on a mail that is not itself a warranty (e.g. PCX's separate invoice mail, "260427-380724.pdf")
// belongs to the same store's warranty whose order number appears in the file name or the mail.
export async function warrantiesForDocument(db: Db, accountId: number, storeDomain: string, haystack: string): Promise<number[]> {
  const rows = await db.getAllAsync<{ id: number; order_number: string }>(
    `SELECT id, order_number FROM warranties WHERE account_id = ? AND store_domain = ? AND order_number IS NOT NULL AND status != 'ignored'`,
    [accountId, storeDomain],
  );
  const text = normalize(haystack);
  return rows.filter((w) => normalize(w.order_number).length >= 6 && text.includes(normalize(w.order_number))).map((w) => w.id);
}

export async function hasAttachmentNamed(db: Db, warrantyId: number, filename: string): Promise<boolean> {
  return (await db.getFirstAsync('SELECT 1 FROM attachments WHERE warranty_id = ? AND filename = ?', [warrantyId, filename])) !== null;
}

// Messages already synced for an account, with the (not ignored) warranties they belong to.
export async function syncedMessages(db: Db, accountId: number): Promise<{ message_id: string; warranty_ids: number[] }[]> {
  const rows = await db.getAllAsync<{ message_id: string; warranty_id: number | null }>(
    `SELECT s.message_id, CASE WHEN w.status != 'ignored' THEN s.warranty_id END AS warranty_id
       FROM sources s LEFT JOIN warranties w ON w.id = s.warranty_id WHERE s.account_id = ?`,
    [accountId],
  );
  const byMessage = new Map<string, number[]>();
  for (const r of rows) {
    const list = byMessage.get(r.message_id) ?? [];
    if (r.warranty_id !== null) list.push(r.warranty_id);
    byMessage.set(r.message_id, list);
  }
  return [...byMessage].map(([message_id, warranty_ids]) => ({ message_id, warranty_ids }));
}

export async function isDocsBackfilled(db: Db, accountId: number): Promise<boolean> {
  return (await db.getFirstAsync<{ docs_backfilled: number }>('SELECT docs_backfilled FROM accounts WHERE id = ?', [accountId]))?.docs_backfilled === 1;
}
export async function setDocsBackfilled(db: Db, accountId: number): Promise<void> {
  await db.runAsync('UPDATE accounts SET docs_backfilled = 1 WHERE id = ?', [accountId]);
}

// --- Ignored mails (section 8: hidden but reviewable and restorable) ---

export interface IgnoredRow {
  id: number;
  product_name: string | null;
  store_name: string;
  purchase_date: string;
  subject: string | null;
  sender: string | null;
}

export async function listIgnored(db: Db): Promise<IgnoredRow[]> {
  return db.getAllAsync<IgnoredRow>(
    `SELECT w.id, w.product_name, w.store_name, w.purchase_date, min(s.subject) AS subject, min(s.sender) AS sender
       FROM warranties w LEFT JOIN sources s ON s.warranty_id = w.id
      WHERE w.status = 'ignored' GROUP BY w.id ORDER BY w.purchase_date DESC, w.id DESC`,
    [],
  );
}

// Back to "Needs your attention", with whatever is still unknown marked as missing.
export async function restoreIgnored(db: Db, id: number): Promise<void> {
  const w = await db.getFirstAsync<{ product_name: string | null; length_is_suggested: number }>('SELECT product_name, length_is_suggested FROM warranties WHERE id = ?', [id]);
  if (!w) return;
  const missing = [...(w.product_name ? [] : ['productName']), ...(w.length_is_suggested ? ['warrantyMonths'] : [])];
  await db.runAsync(`UPDATE warranties SET status = ?, missing_fields = ?, updated_at = ? WHERE id = ?`, [
    missing.length ? 'needs_input' : 'complete', JSON.stringify(missing), new Date().toISOString(), id,
  ]);
}

// --- Returns and refunds (section 11) ---

// Gmail lists newest mail first, so a refund often arrives before its purchase in the same sync; match
// after every sync instead. Order number + store first, else store + product within 60 days before the
// return. Unmatched returns stay quiet (section 11: "if no matching warranty is found, it is ignored").
export async function matchReturns(db: Db, accountId: number): Promise<void> {
  const pending = await db.getAllAsync<{ id: number; store_domain: string; order_number: string | null; products: string; received_at: string }>(
    `SELECT id, store_domain, order_number, products, received_at FROM returns WHERE account_id = ? AND state = 'unmatched'`,
    [accountId],
  );
  for (const r of pending) {
    const candidates = await db.getAllAsync<{ id: number; order_number: string | null; product_name: string | null; purchase_date: string }>(
      `SELECT id, order_number, product_name, purchase_date FROM warranties WHERE account_id = ? AND store_domain = ? AND status != 'ignored'`,
      [accountId, r.store_domain],
    );
    const products: string[] = JSON.parse(r.products);
    const day = r.received_at.slice(0, 10);
    const byOrder = r.order_number ? candidates.filter((w) => w.order_number && normalize(w.order_number) === normalize(r.order_number!)) : [];
    const byProduct = candidates.filter(
      (w) => w.product_name && products.includes(w.product_name) && w.purchase_date <= day && daysBetween(w.purchase_date, day) <= 60,
    );
    const hits = byOrder.length ? byOrder : byProduct;
    if (!hits.length) continue;
    await db.runAsync(`UPDATE returns SET warranty_id = ?, state = 'asked' WHERE id = ?`, [hits[0].id, r.id]);
    for (const w of hits.slice(1)) {
      await db.runAsync(
        `INSERT INTO returns (account_id, message_id, store_domain, order_number, products, received_at, warranty_id, state)
         SELECT account_id, message_id, store_domain, order_number, products, received_at, ?, 'asked' FROM returns WHERE id = ?`,
        [w.id, r.id],
      );
    }
  }
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export interface ReturnPrompt {
  id: number;
  warranty_id: number;
  product_name: string | null;
  store_name: string;
  received_at: string;
}

// Open questions: the warranty still exists and the user has not answered.
export async function listReturnPrompts(db: Db): Promise<ReturnPrompt[]> {
  return db.getAllAsync<ReturnPrompt>(
    `SELECT r.id, r.warranty_id, w.product_name, w.store_name, r.received_at FROM returns r JOIN warranties w ON w.id = r.warranty_id
      WHERE r.state = 'asked' ORDER BY r.received_at DESC`,
    [],
  );
}

export async function answerReturn(db: Db, id: number, answer: 'deleted' | 'kept'): Promise<void> {
  await db.runAsync('UPDATE returns SET state = ? WHERE id = ?', [answer, id]);
}
