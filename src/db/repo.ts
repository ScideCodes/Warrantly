import type { ParseResult, StoreRules } from '../parser/types.ts';
import { DEFAULT_WARRANTY_MONTHS } from '../parser/keywords.ts';
import { endDate } from '../warranty.ts';
import { serialFields } from '../serialNumbers.ts';

type Param = string | number | null;

// The subset of expo-sqlite's SQLiteDatabase used here, so tests can pass a node:sqlite adapter.
export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: Param[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params: Param[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: Param[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

// Tables whose content a backup carries; a change in any of them makes the backup out of date.
// accounts and sources are left out: every sync touches them, and a sync can be repeated.
const CHANGE_TABLES = ['warranties', 'attachments', 'history', 'store_rules', 'returns', 'bundles', 'claims', 'collections', 'collection_items', 'custom_reminders', 'inbox'];

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
  // v9: how far back the first sync reads (section 7): days, 0 = all mail, NULL = not chosen (24 months).
  `ALTER TABLE accounts ADD COLUMN first_sync_days INTEGER;`,
  // v10: price paid (and its currency), a category, and the kind of cover when a product has several
  // warranties (coverage: NULL = the standard one, 'store', 'extended'). All optional, entered by the user.
  // history: repairs, claims and other notes per warranty.
  `ALTER TABLE warranties ADD COLUMN price REAL;
   ALTER TABLE warranties ADD COLUMN currency TEXT;
   ALTER TABLE warranties ADD COLUMN category TEXT;
   ALTER TABLE warranties ADD COLUMN coverage TEXT;
   CREATE TABLE history (
     id INTEGER PRIMARY KEY,
     warranty_id INTEGER NOT NULL REFERENCES warranties(id),
     date TEXT NOT NULL,
     note TEXT NOT NULL
   );`,
  // v11: a photo of the product (file name in the attachments folder, like documents).
  `ALTER TABLE warranties ADD COLUMN photo_path TEXT;`,
  // v12: a product picture found online (removed from the app; src/legacyPictures.ts empties these columns), kept apart from the user's own photo, which
  // always wins. found_photo_key is the product name it was looked up for: a renamed product is looked up
  // again. A key with no path means nothing certain was found, or the user removed the picture.
  `ALTER TABLE warranties ADD COLUMN found_photo_path TEXT;
   ALTER TABLE warranties ADD COLUMN found_photo_key TEXT;
   ALTER TABLE warranties ADD COLUMN found_photo_credit TEXT;`,
  // v13 (shortlist, docs/shortlist-implementation.md). Additive only: every existing row keeps its data.
  // favorite: pinned on the home list. archived_at: put away by the user (not expired, not deleted).
  // deleted_at: deleted but still undoable; purged once the undo window has passed (src/undo.ts).
  // bundle_id: products bought together (bundles); each keeps its own dates and cover.
  // attachments.label: receipt, warranty_card, repair_report, extended, other. Mail PDFs are invoices.
  // attachments.claim_id: a document filed with a claim. One file may back several rows (a shared receipt);
  // it is deleted only when no row points at it any more.
  // claims: dated repair/warranty claims with a status; the old free-text history stays as notes.
  // doc_text: text read from each stored file (local OCR), keyed by file so a shared receipt is read once.
  // inbox: shared/imported files waiting to be assigned; source_key stops the same share being added twice.
  // meta.changes counts every content change (triggers), so backup health can say what is not backed up.
  `ALTER TABLE warranties ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE warranties ADD COLUMN archived_at TEXT;
   ALTER TABLE warranties ADD COLUMN deleted_at TEXT;
   ALTER TABLE warranties ADD COLUMN bundle_id INTEGER;
   ALTER TABLE attachments ADD COLUMN label TEXT NOT NULL DEFAULT 'other';
   ALTER TABLE attachments ADD COLUMN claim_id INTEGER;
   ALTER TABLE attachments ADD COLUMN deleted_at TEXT;
   UPDATE attachments SET label = 'receipt' WHERE local_path LIKE 'mail-%';
   CREATE TABLE bundles (id INTEGER PRIMARY KEY, created_at TEXT NOT NULL);
   CREATE TABLE claims (
     id INTEGER PRIMARY KEY,
     warranty_id INTEGER NOT NULL REFERENCES warranties(id),
     title TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'submitted',
     submitted_on TEXT NOT NULL,
     resolved_on TEXT,
     notes TEXT,
     updated_at TEXT NOT NULL
   );
   CREATE TABLE collections (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT, created_at TEXT NOT NULL);
   CREATE TABLE collection_items (
     collection_id INTEGER NOT NULL REFERENCES collections(id),
     warranty_id INTEGER NOT NULL REFERENCES warranties(id),
     PRIMARY KEY (collection_id, warranty_id)
   );
   CREATE TABLE custom_reminders (
     id INTEGER PRIMARY KEY,
     warranty_id INTEGER NOT NULL REFERENCES warranties(id),
     date TEXT NOT NULL,
     note TEXT,
     UNIQUE (warranty_id, date)
   );
   CREATE TABLE inbox (
     id INTEGER PRIMARY KEY,
     local_path TEXT NOT NULL,
     filename TEXT NOT NULL,
     text TEXT NOT NULL DEFAULT '',
     source_key TEXT NOT NULL UNIQUE,
     received_at TEXT NOT NULL
   );
   CREATE TABLE doc_text (local_path TEXT PRIMARY KEY, text TEXT NOT NULL, status TEXT NOT NULL, indexed_at TEXT NOT NULL);
   CREATE TABLE duplicate_dismissals (a INTEGER NOT NULL, b INTEGER NOT NULL, PRIMARY KEY (a, b));
   CREATE TABLE backed_up_docs (local_path TEXT PRIMARY KEY);
   CREATE TABLE meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
   INSERT INTO meta (key, value) VALUES ('changes', 1), ('backup_changes', 0);
   CREATE INDEX attachments_warranty ON attachments(warranty_id);
   CREATE INDEX attachments_path ON attachments(local_path);
   CREATE INDEX warranties_bundle ON warranties(bundle_id);
   CREATE INDEX claims_warranty ON claims(warranty_id);
   ${CHANGE_TABLES.map((t) => ['INSERT', 'UPDATE', 'DELETE'].map((op) => `CREATE TRIGGER ${t}_${op.toLowerCase()}_changes AFTER ${op} ON ${t} BEGIN UPDATE meta SET value = value + 1 WHERE key = 'changes'; END;`).join('\n')).join('\n')}`,
  // v14: labeled component serials. The legacy scalar stays intact and mirrors the first value.
  `ALTER TABLE warranties ADD COLUMN serial_numbers TEXT;`,
];

export const MIGRATIONS_FOR_TEST: readonly string[] = MIGRATIONS;

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
  first_sync_days: number | null;
}

export async function listAccounts(db: Db): Promise<Account[]> {
  return db.getAllAsync<Account>(`SELECT id, email, last_synced_at, first_sync_days FROM accounts ORDER BY id`, []);
}

export async function upsertAccount(db: Db, email: string): Promise<Account> {
  // docs_backfilled = 1: a new account's PDFs are attached while its mail is synced, so it needs no second pass.
  await db.runAsync(`INSERT INTO accounts (provider, email, docs_backfilled) VALUES ('gmail', ?, 1) ON CONFLICT(email) DO NOTHING`, [email]);
  return (await db.getFirstAsync<Account>('SELECT id, email, last_synced_at, first_sync_days FROM accounts WHERE email = ?', [email]))!;
}

// Choose how far back to read (first sync, or "Scan older emails" later). Mails already read are
// skipped, so going further back only fetches the older ones.
export async function setSyncRange(db: Db, accountId: number, days: number): Promise<void> {
  await db.runAsync('UPDATE accounts SET first_sync_days = ?, last_synced_at = NULL WHERE id = ?', [days, accountId]);
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
    `SELECT id FROM warranties WHERE account_id = ? AND store_domain = ? AND product_name = ? AND status != 'ignored' AND deleted_at IS NULL
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
  serial_numbers: string | null;
  notes: string | null;
  price: number | null;
  currency: string | null;
  category: string | null;
  coverage: 'store' | 'extended' | null;
  photo_path: string | null;
  found_photo_path: string | null;
  found_photo_key: string | null;
  found_photo_credit: string | null; // JSON PictureCredit
  status: 'complete' | 'needs_input' | 'ignored';
  missing_fields: string;
  favorite: number;
  archived_at: string | null;
  deleted_at: string | null;
  bundle_id: number | null;
  created_at: string;
  updated_at: string;
  doc_count: number; // live documents (computed by the queries below)
}

export type Warranty = WarrantyRow & { end_date: string };
const withEnd = (w: WarrantyRow): Warranty => ({ ...w, end_date: endDate(w.warranty_start_date, w.warranty_months) });

// Every query that shows warranties skips deleted ones (they wait out the undo window, then go).
const SELECT_W = `SELECT w.*, (SELECT COUNT(*) FROM attachments a WHERE a.warranty_id = w.id AND a.deleted_at IS NULL) AS doc_count FROM warranties w`;

// Main list: complete warranties only; needs-input items live in the attention list (section 9).
// Archived ones are listed apart (`listArchived`).
export async function listWarranties(db: Db, status: 'complete' | 'needs_input'): Promise<Warranty[]> {
  const rows = await db.getAllAsync<WarrantyRow>(`${SELECT_W} WHERE w.status = ? AND w.deleted_at IS NULL AND w.archived_at IS NULL`, [status]);
  return rows.map(withEnd).sort((a, b) => a.end_date.localeCompare(b.end_date));
}

export async function listArchived(db: Db): Promise<Warranty[]> {
  const rows = await db.getAllAsync<WarrantyRow>(`${SELECT_W} WHERE w.status != 'ignored' AND w.deleted_at IS NULL AND w.archived_at IS NOT NULL ORDER BY w.archived_at DESC`, []);
  return rows.map(withEnd);
}

// The other warranties of the same purchase (manufacturer, store, extended plan), section 12, and the
// products put in the same bundle (bought together, one receipt).
export async function otherCovers(db: Db, w: Warranty): Promise<Warranty[]> {
  const rows = await db.getAllAsync<WarrantyRow>(
    `${SELECT_W} WHERE w.id != ? AND w.status != 'ignored' AND w.deleted_at IS NULL
       AND ((w.product_name IS ? AND w.store_name = ? AND w.purchase_date = ?) OR (w.bundle_id IS NOT NULL AND w.bundle_id = ?))`,
    [w.id, w.product_name, w.store_name, w.purchase_date, w.bundle_id],
  );
  return rows.map(withEnd);
}

export async function getWarranty(db: Db, id: number): Promise<Warranty | null> {
  const row = await db.getFirstAsync<WarrantyRow>(`${SELECT_W} WHERE w.id = ? AND w.deleted_at IS NULL`, [id]);
  return row && withEnd(row);
}

// Files that no row points at any more (a receipt shared by a bundle stays while one product still has it).
export async function unreferenced(db: Db, paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of new Set(paths)) {
    const used = await db.getFirstAsync(
      `SELECT 1 FROM attachments WHERE local_path = ? UNION ALL SELECT 1 FROM warranties WHERE photo_path = ? UNION ALL SELECT 1 FROM inbox WHERE local_path = ? LIMIT 1`,
      [p, p, p],
    );
    if (!used) out.push(p);
  }
  return out;
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
  serial_numbers?: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  notes: string | null;
  price?: number | null;
  currency?: string | null;
  category?: string | null;
  coverage?: 'store' | 'extended' | null;
}
const FIELDS = ['account_id', 'product_name', 'store_name', 'purchase_date', 'warranty_start_date', 'warranty_months', 'order_number',
  'serial_number', 'serial_numbers', 'contact_email', 'contact_phone', 'website_url', 'notes', 'price', 'currency', 'category', 'coverage'] as const;

// Manual entries go to the tab the user picks: an account, or null for the general "Manual" tab (section 15).
export async function addManual(db: Db, w: WarrantyInput, origin: 'manual' | 'scan' = 'manual', now = new Date().toISOString()): Promise<number> {
  w = { ...w, ...serialFields(w) };
  const res = await db.runAsync(
    `INSERT INTO warranties (origin, ${FIELDS.join(', ')}, start_is_suggested, length_is_suggested, status, created_at, updated_at)
     VALUES (?, ${FIELDS.map(() => '?').join(', ')}, 0, 0, 'complete', ?, ?)`,
    [origin, ...FIELDS.map((f) => w[f] ?? null), now, now],
  );
  return res.lastInsertRowId;
}

// A new warranty and its scanned/imported PDF are one save: failure leaves neither database row.
export async function addManualWithDocument(db: Db, w: WarrantyInput, localPath: string | null): Promise<number> {
  let id = 0;
  await db.withTransactionAsync(async () => {
    id = await addManual(db, w, localPath ? 'scan' : 'manual');
    if (localPath) await addAttachment(db, id, `${w.product_name}.pdf`, localPath);
  });
  return id;
}

// Editing confirms the item: suggested labels go, and a needs-input item becomes complete.
export async function updateWarranty(db: Db, id: number, w: WarrantyInput, now = new Date().toISOString()): Promise<void> {
  const previous = w.serial_numbers === undefined ? await db.getFirstAsync<{ serial_number: string | null; serial_numbers: string | null }>('SELECT serial_number, serial_numbers FROM warranties WHERE id = ?', [id]) : null;
  w = { ...w, ...serialFields(w, previous ?? undefined) };
  await db.runAsync(
    `UPDATE warranties SET ${FIELDS.map((f) => `${f} = ?`).join(', ')}, start_is_suggested = 0, length_is_suggested = 0,
       status = 'complete', missing_fields = '[]', updated_at = ? WHERE id = ?`,
    [...FIELDS.map((f) => w[f] ?? null), now, id],
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
  let files: string[] = [];
  await db.withTransactionAsync(async () => {
    files = await purgeWarrantyRows(db, id);
  });
  return files;
}

// The rows of one warranty and everything hanging off it, without its own transaction (callers hold one).
// Returns the files nothing points at any more, for the caller to delete from disk.
export async function purgeWarrantyRows(db: Db, id: number): Promise<string[]> {
  const row = await db.getFirstAsync<{ photo_path: string | null; found_photo_path: string | null }>('SELECT photo_path, found_photo_path FROM warranties WHERE id = ?', [id]);
  const docs = await db.getAllAsync<{ local_path: string }>('SELECT local_path FROM attachments WHERE warranty_id = ?', [id]);
  const candidates = [...docs.map((a) => a.local_path), ...[row?.photo_path, row?.found_photo_path].filter((p): p is string => !!p)];
  await db.runAsync('DELETE FROM attachments WHERE warranty_id = ?', [id]);
  // SQLite reuses ids: a return question left behind would later show up on an unrelated new warranty.
  await db.runAsync('DELETE FROM returns WHERE warranty_id = ?', [id]);
  await db.runAsync('DELETE FROM history WHERE warranty_id = ?', [id]);
  await db.runAsync('DELETE FROM claims WHERE warranty_id = ?', [id]);
  await db.runAsync('DELETE FROM custom_reminders WHERE warranty_id = ?', [id]);
  await db.runAsync('DELETE FROM collection_items WHERE warranty_id = ?', [id]);
  await db.runAsync('DELETE FROM duplicate_dismissals WHERE a = ? OR b = ?', [id, id]);
  await db.runAsync('UPDATE sources SET warranty_id = NULL WHERE warranty_id = ?', [id]);
  await db.runAsync('DELETE FROM warranties WHERE id = ?', [id]);
  return unreferenced(db, candidates);
}

// --- Sharing with another phone (household): warranties as a file, merged in on the other side ---

export interface SharedWarranty {
  warranty: Record<string, unknown>;
  history: { date: string; note: string }[];
  documents: { filename: string; local_path?: string; data?: string; label?: string }[]; // local_path on the sending phone, data (base64) in the file
}

const SHARED_COLUMNS = ['product_name', 'store_name', 'store_domain', 'purchase_date', 'warranty_start_date', 'warranty_months', 'order_number',
  'serial_number', 'serial_numbers', 'notes', 'contact_email', 'contact_phone', 'website_url', 'price', 'currency', 'category', 'coverage'] as const;

export async function sharedWarranties(db: Db, ids: number[]): Promise<SharedWarranty[]> {
  const out: SharedWarranty[] = [];
  for (const id of ids) {
    const w = await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM warranties WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!w) continue;
    out.push({
      warranty: Object.fromEntries(SHARED_COLUMNS.map((c) => [c, w[c] ?? null])),
      history: await db.getAllAsync('SELECT date, note FROM history WHERE warranty_id = ? ORDER BY id', [id]),
      documents: await db.getAllAsync('SELECT filename, local_path, label FROM attachments WHERE warranty_id = ? AND deleted_at IS NULL ORDER BY id', [id]),
    });
  }
  return out;
}

// Adds shared warranties to the Manual tab. One already here (same product, store and purchase day) is
// skipped. `saveDocument` stores a document's bytes and returns its new file name (null: not in the file).
// Returns how many were added.
export async function importShared(db: Db, items: SharedWarranty[], saveDocument: (doc: SharedWarranty['documents'][number]) => Promise<string | null>, now = new Date().toISOString()): Promise<number> {
  let added = 0;
  for (const { warranty: src, history, documents } of items) {
    if (typeof src !== 'object' || src === null) continue;
    // Only plain text and numbers from another person's file; anything else is left empty.
    const w = Object.fromEntries(SHARED_COLUMNS.map((c) => [c, typeof src[c] === 'string' || typeof src[c] === 'number' ? (src[c] as Param) : null]));
    if (typeof w.store_name !== 'string' || typeof w.purchase_date !== 'string' || typeof w.warranty_start_date !== 'string' || typeof w.warranty_months !== 'number') continue;
    Object.assign(w, serialFields(w));
    const dup = await db.getFirstAsync(
      `SELECT 1 FROM warranties WHERE product_name IS ? AND store_name = ? AND purchase_date = ? AND coverage IS ? AND status != 'ignored' AND deleted_at IS NULL`,
      [w.product_name, w.store_name, w.purchase_date, w.coverage],
    );
    if (dup) continue;
    const res = await db.runAsync(
      `INSERT INTO warranties (origin, ${SHARED_COLUMNS.join(', ')}, start_is_suggested, length_is_suggested, status, created_at, updated_at)
       VALUES ('manual', ${SHARED_COLUMNS.map(() => '?').join(', ')}, 0, 0, 'complete', ?, ?)`,
      [...SHARED_COLUMNS.map((c) => w[c]), now, now],
    );
    for (const h of history ?? []) await addHistory(db, res.lastInsertRowId, String(h.date), String(h.note));
    for (const d of documents ?? []) {
      const stored = await saveDocument(d);
      if (stored) await addAttachment(db, res.lastInsertRowId, String(d.filename), stored, DOC_LABELS.includes(d.label as DocLabel) ? (d.label as DocLabel) : 'other');
    }
    added++;
  }
  return added;
}

// "Delete all my data": every table, children first.
export async function wipeDb(db: Db): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const t of ['history', 'returns', 'attachments', 'claims', 'custom_reminders', 'collection_items', 'collections', 'bundles', 'inbox', 'doc_text',
      'duplicate_dismissals', 'backed_up_docs', 'sources', 'warranties', 'store_rules', 'disconnect_backups', 'accounts']) {
      await db.runAsync(`DELETE FROM ${t}`, []);
    }
    await db.runAsync('UPDATE meta SET value = 0', []); // after the deletes, which counted as changes
  });
}

// --- Repair and claim history (notes per warranty) ---

export interface HistoryEntry {
  id: number;
  date: string; // YYYY-MM-DD
  note: string;
}
export async function listHistory(db: Db, warrantyId: number): Promise<HistoryEntry[]> {
  return db.getAllAsync('SELECT id, date, note FROM history WHERE warranty_id = ? ORDER BY date DESC, id DESC', [warrantyId]);
}
export async function addHistory(db: Db, warrantyId: number, date: string, note: string): Promise<void> {
  await db.runAsync('INSERT INTO history (warranty_id, date, note) VALUES (?, ?, ?)', [warrantyId, date, note]);
}
export async function deleteHistory(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM history WHERE id = ?', [id]);
}

export const DOC_LABELS = ['receipt', 'warranty_card', 'repair_report', 'extended', 'other'] as const;
export type DocLabel = (typeof DOC_LABELS)[number];

export interface Attachment {
  id: number;
  filename: string;
  local_path: string;
  label: DocLabel;
  claim_id: number | null;
}

// Returns the previous photo's file, for the caller to delete.
export async function setPhoto(db: Db, warrantyId: number, photo: string | null): Promise<string | null> {
  const old = (await db.getFirstAsync<{ photo_path: string | null }>('SELECT photo_path FROM warranties WHERE id = ?', [warrantyId]))?.photo_path ?? null;
  await db.runAsync('UPDATE warranties SET photo_path = ? WHERE id = ?', [photo, warrantyId]);
  return old;
}

export async function addAttachment(db: Db, warrantyId: number, filename: string, localPath: string, label: DocLabel = 'other', claimId: number | null = null): Promise<number> {
  const res = await db.runAsync('INSERT INTO attachments (warranty_id, filename, local_path, label, claim_id) VALUES (?, ?, ?, ?, ?)', [warrantyId, filename, localPath, label, claimId]);
  return res.lastInsertRowId;
}

// Returns the file to delete from disk: null while another row (a bundle's shared receipt) still uses it.
export async function deleteAttachment(db: Db, id: number): Promise<string | null> {
  const row = await db.getFirstAsync<{ local_path: string }>('SELECT local_path FROM attachments WHERE id = ?', [id]);
  await db.runAsync('DELETE FROM attachments WHERE id = ?', [id]);
  return row ? ((await unreferenced(db, [row.local_path]))[0] ?? null) : null;
}

export async function setAttachmentLabel(db: Db, id: number, label: DocLabel): Promise<void> {
  if (!DOC_LABELS.includes(label)) throw new Error('Unknown label');
  await db.runAsync('UPDATE attachments SET label = ? WHERE id = ?', [label, id]);
}

export async function listAttachments(db: Db, warrantyId: number): Promise<Attachment[]> {
  return db.getAllAsync('SELECT id, filename, local_path, label, claim_id FROM attachments WHERE warranty_id = ? AND deleted_at IS NULL ORDER BY id', [warrantyId]);
}

// --- Disconnecting and reconnecting an account (section 15) ---

export interface AccountRows {
  account: Record<string, unknown>;
  warranties: Record<string, unknown>[];
  sources: Record<string, unknown>[];
  attachments?: Record<string, unknown>[]; // missing in disconnect backups made before documents were kept
  history?: Record<string, unknown>[];
  claims?: Record<string, unknown>[]; // missing before v13
  custom_reminders?: Record<string, unknown>[];
}

export async function dumpAccount(db: Db, accountId: number): Promise<AccountRows> {
  const of = 'WHERE warranty_id IN (SELECT id FROM warranties WHERE account_id = ? AND deleted_at IS NULL)';
  return {
    account: (await db.getFirstAsync<Record<string, unknown>>('SELECT * FROM accounts WHERE id = ?', [accountId]))!,
    warranties: await db.getAllAsync('SELECT * FROM warranties WHERE account_id = ? AND deleted_at IS NULL', [accountId]),
    sources: await db.getAllAsync('SELECT * FROM sources WHERE account_id = ?', [accountId]),
    attachments: await db.getAllAsync(`SELECT * FROM attachments ${of} AND deleted_at IS NULL`, [accountId]),
    history: await db.getAllAsync(`SELECT * FROM history ${of}`, [accountId]),
    claims: await db.getAllAsync(`SELECT * FROM claims ${of}`, [accountId]),
    custom_reminders: await db.getAllAsync(`SELECT * FROM custom_reminders ${of}`, [accountId]),
  };
}

// Removes the account's warranties and mail markers. Manual and scanned entries are not affected.
// Returns the attachment and photo files the caller must delete from disk.
export async function deleteAccount(db: Db, accountId: number): Promise<string[]> {
  const files = await db.getAllAsync<{ local_path: string }>(
    `SELECT local_path FROM attachments WHERE warranty_id IN (SELECT id FROM warranties WHERE account_id = ?)
     UNION ALL SELECT photo_path FROM warranties WHERE account_id = ? AND photo_path IS NOT NULL
     UNION ALL SELECT found_photo_path FROM warranties WHERE account_id = ? AND found_photo_path IS NOT NULL`,
    [accountId, accountId, accountId],
  );
  let gone: string[] = [];
  await db.withTransactionAsync(async () => {
    const of = '(SELECT id FROM warranties WHERE account_id = ?)';
    for (const t of ['attachments', 'history', 'claims', 'custom_reminders', 'collection_items']) await db.runAsync(`DELETE FROM ${t} WHERE warranty_id IN ${of}`, [accountId]);
    await db.runAsync('DELETE FROM returns WHERE account_id = ?', [accountId]); // see deleteWarranty: ids are reused
    await db.runAsync('DELETE FROM sources WHERE account_id = ?', [accountId]);
    await db.runAsync('DELETE FROM warranties WHERE account_id = ?', [accountId]);
    await db.runAsync('DELETE FROM accounts WHERE id = ?', [accountId]);
    gone = await unreferenced(db, files.map((f) => f.local_path)); // a receipt shared with a manual product stays
  });
  return gone;
}

// Puts a disconnect backup back under the (re)connected account. Rows get new ids, so nothing added
// since then can collide; sources and documents follow their warranty. Mail PDFs are not in the backup:
// docs_backfilled = 0 makes the next sync download them again.
export async function restoreAccount(db: Db, accountId: number, rows: AccountRows): Promise<void> {
  const insert = async (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    const res = await db.runAsync(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, cols.map((c) => row[c] as string | number | null));
    return res.lastInsertRowId;
  };
  await db.withTransactionAsync(async () => {
    const ids = new Map<unknown, number>();
    const bundles = new Set((await db.getAllAsync<{ id: number }>('SELECT id FROM bundles', [])).map((b) => b.id));
    for (const { id, ...w } of rows.warranties) {
      // A bundle that no longer exists on this phone is dropped rather than left dangling.
      ids.set(id, await insert('warranties', { ...w, account_id: accountId, ...('bundle_id' in w ? { bundle_id: bundles.has(Number(w.bundle_id)) ? w.bundle_id : null } : {}) }));
    }
    for (const { id: _id, ...src } of rows.sources) {
      await insert('sources', { ...src, account_id: accountId, warranty_id: src.warranty_id == null ? null : (ids.get(src.warranty_id) ?? null) });
    }
    const claimIds = new Map<unknown, number>();
    for (const table of ['history', 'claims', 'custom_reminders'] as const) {
      for (const { id, ...h } of rows[table] ?? []) {
        const warrantyId = ids.get(h.warranty_id);
        if (!warrantyId) continue;
        const newId = await insert(table, { ...h, warranty_id: warrantyId });
        if (table === 'claims') claimIds.set(id, newId);
      }
    }
    for (const { id: _id, source_id: _source, ...a } of rows.attachments ?? []) {
      const warrantyId = ids.get(a.warranty_id);
      if (warrantyId) await insert('attachments', { ...a, warranty_id: warrantyId, ...('claim_id' in a ? { claim_id: claimIds.get(a.claim_id) ?? null } : {}) });
    }
    await db.runAsync('UPDATE accounts SET last_synced_at = ?, docs_backfilled = 0 WHERE id = ?', [rows.account.last_synced_at as string | null, accountId]);
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
    `SELECT id, order_number FROM warranties WHERE account_id = ? AND store_domain = ? AND order_number IS NOT NULL AND status != 'ignored' AND deleted_at IS NULL`,
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
      WHERE w.status = 'ignored' AND w.deleted_at IS NULL GROUP BY w.id ORDER BY w.purchase_date DESC, w.id DESC`,
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
      `SELECT id, order_number, product_name, purchase_date FROM warranties WHERE account_id = ? AND store_domain = ? AND status != 'ignored' AND deleted_at IS NULL`,
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
      WHERE r.state = 'asked' AND w.deleted_at IS NULL AND w.archived_at IS NULL ORDER BY r.received_at DESC`,
    [],
  );
}

export async function answerReturn(db: Db, id: number, answer: 'deleted' | 'kept'): Promise<void> {
  await db.runAsync('UPDATE returns SET state = ? WHERE id = ?', [answer, id]);
}

// --- Resolving "Needs your attention" (section 9) ---

// Other items from the same store still missing their length ("Apply to all N items from this store").
export async function storeItemsMissingLength(db: Db, storeDomain: string, exceptId: number): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM warranties WHERE store_domain = ? AND id != ? AND status = 'needs_input' AND missing_fields LIKE '%warrantyMonths%'`,
    [storeDomain, exceptId],
  );
  return row?.n ?? 0;
}

// Sets the length on those items; ones missing nothing else become complete.
export async function applyLengthToStore(db: Db, storeDomain: string, months: number, exceptId: number): Promise<void> {
  const rows = await db.getAllAsync<{ id: number; missing_fields: string }>(
    `SELECT id, missing_fields FROM warranties WHERE store_domain = ? AND id != ? AND status = 'needs_input' AND missing_fields LIKE '%warrantyMonths%'`,
    [storeDomain, exceptId],
  );
  for (const r of rows) {
    const missing = (JSON.parse(r.missing_fields) as string[]).filter((f) => f !== 'warrantyMonths');
    await db.runAsync(
      `UPDATE warranties SET warranty_months = ?, length_is_suggested = 0, missing_fields = ?, status = ?, updated_at = ? WHERE id = ?`,
      [months, JSON.stringify(missing), missing.length ? 'needs_input' : 'complete', new Date().toISOString(), r.id],
    );
  }
}

// The next item to resolve after this one (newest purchase first, like the list).
export async function nextNeedsInput(db: Db, afterId: number): Promise<number | null> {
  const rows = await db.getAllAsync<{ id: number }>(`SELECT id FROM warranties WHERE status = 'needs_input' AND deleted_at IS NULL ORDER BY purchase_date DESC, id DESC`, []);
  const i = rows.findIndex((r) => r.id === afterId);
  const rest = i >= 0 ? [...rows.slice(i + 1), ...rows.slice(0, i)] : rows;
  return rest.find((r) => r.id !== afterId)?.id ?? null;
}

// The mail a warranty came from, to show it next to the form ("source viewer").
export async function sourceOf(db: Db, warrantyId: number): Promise<{ message_id: string; email: string } | null> {
  return db.getFirstAsync(
    `SELECT s.message_id, a.email FROM sources s JOIN accounts a ON a.id = s.account_id WHERE s.warranty_id = ? ORDER BY s.received_at LIMIT 1`,
    [warrantyId],
  );
}
