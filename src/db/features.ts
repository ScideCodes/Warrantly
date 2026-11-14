import { encodeSerialEntries, mergeSerialEntries } from '../serialNumbers.ts';
// Data for the shortlist features (docs/shortlist-implementation.md): favorites, archive, undoable deletes,
// collections, claims, custom reminders, the document inbox, the text index, duplicates, bundles and backup
// state. Same rules as repo.ts: plain SQL through `Db`, so node tests run the real queries.
import { DOC_LABELS, purgeWarrantyRows, unreferenced, type Db, type DocLabel, type Warranty, type WarrantyRow } from './repo.ts';
import { endDate } from '../warranty.ts';

type Param = string | number | null;
const marks = (n: number) => Array.from({ length: n }, () => '?').join(', ');
const withEnd = (w: WarrantyRow): Warranty => ({ ...w, end_date: endDate(w.warranty_start_date, w.warranty_months) });

// --- Favorites, archive, categories (each returns what undo needs) ---

export async function setFavorite(db: Db, id: number, on: boolean): Promise<void> {
  await db.runAsync('UPDATE warranties SET favorite = ? WHERE id = ?', [on ? 1 : 0, id]);
}

export async function setArchived(db: Db, ids: number[], on: boolean, now = new Date().toISOString()): Promise<void> {
  if (!ids.length) return;
  await db.runAsync(`UPDATE warranties SET archived_at = ?, updated_at = ? WHERE id IN (${marks(ids.length)})`, [on ? now : null, now, ...ids]);
}

export type CategoryUndo = { id: number; category: string | null }[];
export async function setCategory(db: Db, ids: number[], category: string | null, now = new Date().toISOString()): Promise<CategoryUndo> {
  if (!ids.length) return [];
  const before = await db.getAllAsync<{ id: number; category: string | null }>(`SELECT id, category FROM warranties WHERE id IN (${marks(ids.length)})`, ids);
  await db.runAsync(`UPDATE warranties SET category = ?, updated_at = ? WHERE id IN (${marks(ids.length)})`, [category, now, ...ids]);
  return before;
}
export async function restoreCategories(db: Db, before: CategoryUndo): Promise<void> {
  for (const b of before) await db.runAsync('UPDATE warranties SET category = ? WHERE id = ?', [b.category, b.id]);
}

// --- Undoable delete: rows are marked first and purged after the undo window (src/undo.ts) ---

export async function softDeleteWarranties(db: Db, ids: number[], now = new Date().toISOString()): Promise<void> {
  if (ids.length) await db.runAsync(`UPDATE warranties SET deleted_at = ? WHERE id IN (${marks(ids.length)}) AND deleted_at IS NULL`, [now, ...ids]);
}
export async function undoDeleteWarranties(db: Db, ids: number[]): Promise<void> {
  if (ids.length) await db.runAsync(`UPDATE warranties SET deleted_at = NULL WHERE id IN (${marks(ids.length)})`, ids);
}
export async function softDeleteAttachment(db: Db, id: number, now = new Date().toISOString()): Promise<void> {
  await db.runAsync('UPDATE attachments SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [now, id]);
}
export async function undoDeleteAttachment(db: Db, id: number): Promise<void> {
  await db.runAsync('UPDATE attachments SET deleted_at = NULL WHERE id = ?', [id]);
}

// Everything marked before `before` goes for good. Runs on app start too, so a delete whose undo window
// ended while the app was closed is finished then. Returns the files nothing points at any more.
export async function purgeDeleted(db: Db, before: string): Promise<string[]> {
  const files: string[] = [];
  await db.withTransactionAsync(async () => {
    const ws = await db.getAllAsync<{ id: number }>('SELECT id FROM warranties WHERE deleted_at IS NOT NULL AND deleted_at < ?', [before]);
    for (const w of ws) files.push(...(await purgeWarrantyRows(db, w.id)));
    const docs = await db.getAllAsync<{ id: number; local_path: string }>('SELECT id, local_path FROM attachments WHERE deleted_at IS NOT NULL AND deleted_at < ?', [before]);
    for (const d of docs) await db.runAsync('DELETE FROM attachments WHERE id = ?', [d.id]);
    files.push(...(await unreferenced(db, docs.map((d) => d.local_path))));
  });
  return [...new Set(files)];
}

// --- Collections (Kitchen, Gaming setup, Work equipment...). Categories stay the product type. ---

export const COLLECTION_KINDS = ['room', 'owner', 'purpose'] as const;
export type CollectionKind = (typeof COLLECTION_KINDS)[number];
export interface Collection { id: number; name: string; kind: CollectionKind | null; count: number }

export async function listCollections(db: Db): Promise<Collection[]> {
  return db.getAllAsync<Collection>(
    `SELECT c.id, c.name, c.kind, (SELECT COUNT(*) FROM collection_items i JOIN warranties w ON w.id = i.warranty_id
       WHERE i.collection_id = c.id AND w.deleted_at IS NULL) AS count FROM collections c ORDER BY c.name COLLATE NOCASE`,
    [],
  );
}
export async function createCollection(db: Db, name: string, kind: CollectionKind | null, now = new Date().toISOString()): Promise<number> {
  const clean = name.trim();
  if (!clean) throw new Error('A collection needs a name');
  return (await db.runAsync('INSERT INTO collections (name, kind, created_at) VALUES (?, ?, ?)', [clean, kind, now])).lastInsertRowId;
}
export async function renameCollection(db: Db, id: number, name: string, kind: CollectionKind | null): Promise<void> {
  if (!name.trim()) throw new Error('A collection needs a name');
  await db.runAsync('UPDATE collections SET name = ?, kind = ? WHERE id = ?', [name.trim(), kind, id]);
}
// Removes the group only; its warranties stay.
export async function deleteCollection(db: Db, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM collection_items WHERE collection_id = ?', [id]);
    await db.runAsync('DELETE FROM collections WHERE id = ?', [id]);
  });
}
export async function setMembership(db: Db, collectionId: number, warrantyIds: number[], on: boolean): Promise<void> {
  for (const w of warrantyIds) {
    await db.runAsync(on ? 'INSERT OR IGNORE INTO collection_items (collection_id, warranty_id) VALUES (?, ?)' : 'DELETE FROM collection_items WHERE collection_id = ? AND warranty_id = ?', [collectionId, w]);
  }
}
export async function collectionsOf(db: Db, warrantyId: number): Promise<number[]> {
  return (await db.getAllAsync<{ collection_id: number }>('SELECT collection_id FROM collection_items WHERE warranty_id = ?', [warrantyId])).map((r) => r.collection_id);
}
export async function collectionMembers(db: Db): Promise<Map<number, Set<number>>> {
  const rows = await db.getAllAsync<{ collection_id: number; warranty_id: number }>('SELECT collection_id, warranty_id FROM collection_items', []);
  const map = new Map<number, Set<number>>();
  for (const r of rows) map.set(r.collection_id, (map.get(r.collection_id) ?? new Set()).add(r.warranty_id));
  return map;
}

// --- Claims: Submitted → In repair → Resolved. Nothing is sent and no outcome is assumed. ---

export const CLAIM_STATUSES = ['submitted', 'in_repair', 'resolved'] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export interface Claim { id: number; warranty_id: number; title: string; status: ClaimStatus; submitted_on: string; resolved_on: string | null; notes: string | null }

export async function listClaims(db: Db, warrantyId: number): Promise<Claim[]> {
  return db.getAllAsync<Claim>('SELECT id, warranty_id, title, status, submitted_on, resolved_on, notes FROM claims WHERE warranty_id = ? ORDER BY submitted_on DESC, id DESC', [warrantyId]);
}
export async function addClaim(db: Db, warrantyId: number, c: { title: string; submitted_on: string; notes?: string | null }, now = new Date().toISOString()): Promise<number> {
  if (!c.title.trim()) throw new Error('A claim needs a title');
  return (await db.runAsync('INSERT INTO claims (warranty_id, title, status, submitted_on, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [warrantyId, c.title.trim(), 'submitted', c.submitted_on, c.notes?.trim() || null, now])).lastInsertRowId;
}
// Resolved gets a date (today unless given); moving back out of Resolved clears it.
export async function updateClaim(db: Db, id: number, c: { status: ClaimStatus; notes?: string | null; resolved_on?: string | null }, today: string, now = new Date().toISOString()): Promise<void> {
  if (!CLAIM_STATUSES.includes(c.status)) throw new Error('Unknown status');
  await db.runAsync('UPDATE claims SET status = ?, notes = ?, resolved_on = ?, updated_at = ? WHERE id = ?',
    [c.status, c.notes?.trim() || null, c.status === 'resolved' ? (c.resolved_on ?? today) : null, now, id]);
}
// The claim goes; documents filed with it stay with the warranty.
export async function deleteClaim(db: Db, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE attachments SET claim_id = NULL WHERE claim_id = ?', [id]);
    await db.runAsync('DELETE FROM claims WHERE id = ?', [id]);
  });
}

// --- Custom reminders: per-product dates on top of the global ones ---

export interface CustomReminder { id: number; warranty_id: number; date: string; note: string | null }
export async function listCustomReminders(db: Db, warrantyId: number): Promise<CustomReminder[]> {
  return db.getAllAsync('SELECT id, warranty_id, date, note FROM custom_reminders WHERE warranty_id = ? ORDER BY date', [warrantyId]);
}
// False when that product already has a reminder on that day.
export async function addCustomReminder(db: Db, warrantyId: number, date: string, note: string | null): Promise<boolean> {
  return (await db.runAsync('INSERT OR IGNORE INTO custom_reminders (warranty_id, date, note) VALUES (?, ?, ?)', [warrantyId, date, note?.trim() || null])).changes > 0;
}
export async function deleteCustomReminder(db: Db, id: number): Promise<void> {
  await db.runAsync('DELETE FROM custom_reminders WHERE id = ?', [id]);
}
// Only for products still shown: archived, deleted and needs-input items get none.
export async function plannedCustomReminders(db: Db): Promise<CustomReminder[]> {
  return db.getAllAsync(
    `SELECT r.id, r.warranty_id, r.date, r.note FROM custom_reminders r JOIN warranties w ON w.id = r.warranty_id
      WHERE w.deleted_at IS NULL AND w.archived_at IS NULL AND w.status = 'complete'`,
    [],
  );
}

// --- Document inbox: shared or imported files waiting to be assigned ---

export interface InboxItem { id: number; local_path: string; filename: string; text: string; received_at: string }
// False when this share was already taken in (same source key), so a re-delivered intent is not doubled.
export async function addInbox(db: Db, item: { local_path: string; filename: string; text: string; source_key: string }, now = new Date().toISOString()): Promise<boolean> {
  return (await db.runAsync('INSERT OR IGNORE INTO inbox (local_path, filename, text, source_key, received_at) VALUES (?, ?, ?, ?, ?)',
    [item.local_path, item.filename, item.text, item.source_key, now])).changes > 0;
}
export const hasInboxSource = async (db: Db, sourceKey: string): Promise<boolean> => (await db.getFirstAsync('SELECT 1 FROM inbox WHERE source_key = ?', [sourceKey])) !== null;
export async function listInbox(db: Db): Promise<InboxItem[]> {
  return db.getAllAsync('SELECT id, local_path, filename, text, received_at FROM inbox ORDER BY received_at DESC, id DESC', []);
}
export async function getInboxItem(db: Db, id: number): Promise<InboxItem | null> {
  return db.getFirstAsync('SELECT id, local_path, filename, text, received_at FROM inbox WHERE id = ?', [id]);
}
// The file moves to the warranty (no copy); the inbox row goes in the same transaction.
export async function assignInbox(db: Db, id: number, warrantyId: number, label: DocLabel): Promise<void> {
  await db.withTransactionAsync(async () => {
    const item = await db.getFirstAsync<InboxItem>('SELECT * FROM inbox WHERE id = ?', [id]);
    if (!item) throw new Error('Already assigned');
    await db.runAsync('INSERT INTO attachments (warranty_id, filename, local_path, label) VALUES (?, ?, ?, ?)', [warrantyId, item.filename, item.local_path, label]);
    await db.runAsync('DELETE FROM inbox WHERE id = ?', [id]);
  });
}
// Returns the file to delete (null if something else still uses it).
export async function discardInbox(db: Db, id: number): Promise<string | null> {
  const item = await db.getFirstAsync<{ local_path: string }>('SELECT local_path FROM inbox WHERE id = ?', [id]);
  if (!item) return null;
  await db.runAsync('DELETE FROM inbox WHERE id = ?', [id]);
  return (await unreferenced(db, [item.local_path]))[0] ?? null;
}

// --- Document text index (read on the phone, src/docIndex.ts) ---

// Live documents whose file has not been read yet (or failed fewer than... never retried automatically:
// a failed file is retried only when asked).
export async function unindexedDocuments(db: Db, limit: number): Promise<string[]> {
  return (await db.getAllAsync<{ local_path: string }>(
    `SELECT DISTINCT a.local_path FROM attachments a JOIN warranties w ON w.id = a.warranty_id
      WHERE a.deleted_at IS NULL AND w.deleted_at IS NULL AND a.local_path NOT IN (SELECT local_path FROM doc_text) ORDER BY a.id DESC LIMIT ?`,
    [limit],
  )).map((r) => r.local_path);
}
export async function indexCounts(db: Db): Promise<{ total: number; done: number; failed: number }> {
  const row = await db.getFirstAsync<{ total: number; done: number; failed: number }>(
    `SELECT COUNT(DISTINCT a.local_path) AS total,
            COUNT(DISTINCT CASE WHEN t.status = 'done' THEN a.local_path END) AS done,
            COUNT(DISTINCT CASE WHEN t.status = 'failed' THEN a.local_path END) AS failed
       FROM attachments a JOIN warranties w ON w.id = a.warranty_id LEFT JOIN doc_text t ON t.local_path = a.local_path
      WHERE a.deleted_at IS NULL AND w.deleted_at IS NULL`,
    [],
  );
  return { total: row?.total ?? 0, done: row?.done ?? 0, failed: row?.failed ?? 0 };
}
// `text` is stored already plain (lower case, no accents), so search is a LIKE on it.
export async function saveDocText(db: Db, localPath: string, text: string, status: 'done' | 'failed', now = new Date().toISOString()): Promise<void> {
  await db.runAsync(
    `INSERT INTO doc_text (local_path, text, status, indexed_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(local_path) DO UPDATE SET text = excluded.text, status = excluded.status, indexed_at = excluded.indexed_at`,
    [localPath, text, status, now],
  );
}
export async function retryFailedIndex(db: Db): Promise<void> {
  await db.runAsync(`DELETE FROM doc_text WHERE status = 'failed'`, []);
}
// Text of files no document or inbox item uses any more.
export async function cleanDocText(db: Db): Promise<number> {
  return (await db.runAsync('DELETE FROM doc_text WHERE local_path NOT IN (SELECT local_path FROM attachments) AND local_path NOT IN (SELECT local_path FROM inbox)', [])).changes;
}

export interface DocumentRow {
  id: number;
  warranty_id: number;
  filename: string;
  local_path: string;
  label: DocLabel;
  product_name: string | null;
  store_name: string;
  origin: string;
  text: string | null; // null: not read yet
  text_status: 'done' | 'failed' | null;
}
// Every live document with its product, for the Documents view and search.
export async function listAllDocuments(db: Db): Promise<DocumentRow[]> {
  return db.getAllAsync<DocumentRow>(
    `SELECT a.id, a.warranty_id, a.filename, a.local_path, a.label, w.product_name, w.store_name, w.origin, t.text, t.status AS text_status
       FROM attachments a JOIN warranties w ON w.id = a.warranty_id LEFT JOIN doc_text t ON t.local_path = a.local_path
      WHERE a.deleted_at IS NULL AND w.deleted_at IS NULL AND w.status != 'ignored' ORDER BY a.id DESC`,
    [],
  );
}
// Warranty ids whose documents' text contains every word (words already plain).
export async function warrantiesWithText(db: Db, words: string[]): Promise<Set<number>> {
  if (!words.length) return new Set();
  const rows = await db.getAllAsync<{ warranty_id: number }>(
    `SELECT DISTINCT a.warranty_id FROM attachments a JOIN doc_text t ON t.local_path = a.local_path
      WHERE a.deleted_at IS NULL AND ${words.map(() => `t.text LIKE ? ESCAPE '\\'`).join(' AND ')}`,
    words.map((w) => `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`),
  );
  return new Set(rows.map((r) => r.warranty_id));
}

// --- Duplicates: review and merge; nothing is merged without the user ---

export async function dismissedPairs(db: Db): Promise<Set<string>> {
  return new Set((await db.getAllAsync<{ a: number; b: number }>('SELECT a, b FROM duplicate_dismissals', [])).map((r) => `${r.a}:${r.b}`));
}
export async function dismissDuplicate(db: Db, a: number, b: number): Promise<void> {
  await db.runAsync('INSERT OR IGNORE INTO duplicate_dismissals (a, b) VALUES (?, ?)', [Math.min(a, b), Math.max(a, b)]);
}

const MERGE_FILL = ['order_number', 'contact_email', 'contact_phone', 'website_url', 'price', 'currency', 'category', 'store_domain', 'account_id'] as const;

// `drop` goes into `keep`: its documents, photo, notes, claims, reminders, collections and mail markers move;
// empty fields of `keep` are filled from it. Different covers (standard vs extended) are never merged.
// Returns files to delete (drop's photo when keep has its own and nothing else uses it).
export async function mergeWarranties(db: Db, keepId: number, dropId: number, now = new Date().toISOString()): Promise<string[]> {
  if (keepId === dropId) throw new Error('Same warranty');
  let files: string[] = [];
  await db.withTransactionAsync(async () => {
    const keep = await db.getFirstAsync<Record<string, Param>>('SELECT * FROM warranties WHERE id = ? AND deleted_at IS NULL', [keepId]);
    const drop = await db.getFirstAsync<Record<string, Param>>('SELECT * FROM warranties WHERE id = ? AND deleted_at IS NULL', [dropId]);
    if (!keep || !drop) throw new Error('Warranty not found');
    if ((keep.coverage ?? null) !== (drop.coverage ?? null)) throw new Error('Different covers are kept apart');
    const fill = MERGE_FILL.filter((c) => keep[c] === null && drop[c] !== null);
    const serials = mergeSerialEntries(keep, drop);
    const notes = [keep.notes, drop.notes].filter(Boolean).join('\n\n') || null;
    const photo = keep.photo_path ?? drop.photo_path ?? null;
    await db.runAsync(
      `UPDATE warranties SET ${fill.map((c) => `${c} = ?`).concat('serial_number = ?', 'serial_numbers = ?', 'notes = ?', 'photo_path = ?', 'favorite = ?', 'bundle_id = ?', 'updated_at = ?').join(', ')} WHERE id = ?`,
      [...fill.map((c) => drop[c]), serials[0]?.value ?? null, encodeSerialEntries(serials), notes, photo, Math.max(Number(keep.favorite), Number(drop.favorite)), keep.bundle_id ?? drop.bundle_id, now, keepId],
    );
    // Same file on both (a receipt shared earlier): one row is enough.
    await db.runAsync('DELETE FROM attachments WHERE warranty_id = ? AND deleted_at IS NULL AND claim_id IS NULL AND local_path IN (SELECT local_path FROM attachments WHERE warranty_id = ? AND deleted_at IS NULL AND claim_id IS NULL)', [dropId, keepId]);
    for (const t of ['attachments', 'history', 'claims', 'returns']) await db.runAsync(`UPDATE ${t} SET warranty_id = ? WHERE warranty_id = ?`, [keepId, dropId]);
    await db.runAsync('UPDATE OR IGNORE custom_reminders SET warranty_id = ? WHERE warranty_id = ?', [keepId, dropId]);
    await db.runAsync('UPDATE OR IGNORE collection_items SET warranty_id = ? WHERE warranty_id = ?', [keepId, dropId]);
    await db.runAsync('UPDATE sources SET warranty_id = ? WHERE warranty_id = ?', [keepId, dropId]);
    const oldPhoto = drop.photo_path && drop.photo_path !== photo ? String(drop.photo_path) : null;
    await db.runAsync('UPDATE warranties SET photo_path = NULL WHERE id = ?', [dropId]);
    files = await purgeWarrantyRows(db, dropId); // what is left on drop: reminders/collections that were already on keep
    if (oldPhoto) files.push(...(await unreferenced(db, [oldPhoto])));
  });
  return files;
}

// --- Bundles: products bought together. Each keeps its own dates and cover. ---

export async function bundleTogether(db: Db, ids: number[], now = new Date().toISOString()): Promise<number> {
  if (ids.length < 2) throw new Error('A bundle needs two products');
  let bundle = 0;
  await db.withTransactionAsync(async () => {
    const existing = await db.getFirstAsync<{ bundle_id: number }>(`SELECT bundle_id FROM warranties WHERE id IN (${marks(ids.length)}) AND bundle_id IS NOT NULL LIMIT 1`, ids);
    bundle = existing?.bundle_id ?? (await db.runAsync('INSERT INTO bundles (created_at) VALUES (?)', [now])).lastInsertRowId;
    await db.runAsync(`UPDATE warranties SET bundle_id = ? WHERE id IN (${marks(ids.length)})`, [bundle, ...ids]);
  });
  return bundle;
}
// A bundle of one is no bundle: it is dissolved.
export async function leaveBundle(db: Db, id: number): Promise<void> {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ bundle_id: number | null }>('SELECT bundle_id FROM warranties WHERE id = ?', [id]);
    if (!row?.bundle_id) return;
    await db.runAsync('UPDATE warranties SET bundle_id = NULL WHERE id = ?', [id]);
    const left = await db.getAllAsync<{ id: number }>('SELECT id FROM warranties WHERE bundle_id = ? AND deleted_at IS NULL', [row.bundle_id]);
    if (left.length < 2) {
      await db.runAsync('UPDATE warranties SET bundle_id = NULL WHERE bundle_id = ?', [row.bundle_id]);
      await db.runAsync('DELETE FROM bundles WHERE id = ?', [row.bundle_id]);
    }
  });
}
export async function bundleMembers(db: Db, bundleId: number): Promise<Warranty[]> {
  const rows = await db.getAllAsync<WarrantyRow>(
    `SELECT w.*, (SELECT COUNT(*) FROM attachments a WHERE a.warranty_id = w.id AND a.deleted_at IS NULL) AS doc_count FROM warranties w WHERE w.bundle_id = ? AND w.deleted_at IS NULL ORDER BY w.id`,
    [bundleId],
  );
  return rows.map(withEnd);
}
// One receipt for the whole purchase: the same file is listed on each product (one copy on disk).
export async function shareDocument(db: Db, attachmentId: number, warrantyIds: number[]): Promise<number> {
  const a = await db.getFirstAsync<{ filename: string; local_path: string; label: string }>('SELECT filename, local_path, label FROM attachments WHERE id = ?', [attachmentId]);
  if (!a) throw new Error('Document not found');
  let added = 0;
  for (const w of warrantyIds) {
    if (await db.getFirstAsync('SELECT 1 FROM attachments WHERE warranty_id = ? AND local_path = ? AND deleted_at IS NULL', [w, a.local_path])) continue;
    await db.runAsync('INSERT INTO attachments (warranty_id, filename, local_path, label) VALUES (?, ?, ?, ?)', [w, a.filename, a.local_path, DOC_LABELS.includes(a.label as DocLabel) ? a.label : 'other']);
    added++;
  }
  return added;
}

// --- Backup state: what changed since the last completed backup ---

export async function changeCount(db: Db): Promise<number> {
  return (await db.getFirstAsync<{ value: number }>(`SELECT value FROM meta WHERE key = 'changes'`, []))?.value ?? 0;
}
// `changes` is the count read when the backup's data was taken: later edits stay pending.
export async function markBackedUp(db: Db, changes: number, docs: string[]): Promise<void> {
  await db.runAsync(`UPDATE meta SET value = ? WHERE key = 'backup_changes'`, [changes]);
  for (const d of docs) await db.runAsync('INSERT OR IGNORE INTO backed_up_docs (local_path) VALUES (?)', [d]);
}
export interface PendingBackup { changes: boolean; documents: number }
export async function pendingBackup(db: Db): Promise<PendingBackup> {
  const row = await db.getFirstAsync<{ changes: number; backup: number }>(
    `SELECT (SELECT value FROM meta WHERE key = 'changes') AS changes, (SELECT value FROM meta WHERE key = 'backup_changes') AS backup`, []);
  const docs = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (SELECT local_path FROM attachments WHERE deleted_at IS NULL UNION SELECT photo_path FROM warranties WHERE photo_path IS NOT NULL AND deleted_at IS NULL
       UNION SELECT local_path FROM inbox) f WHERE f.local_path NOT IN (SELECT local_path FROM backed_up_docs)`, []);
  return { changes: (row?.changes ?? 0) > (row?.backup ?? 0), documents: docs?.n ?? 0 };
}
