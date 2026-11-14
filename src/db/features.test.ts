import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addAttachment, addHistory, addManual, deleteAttachment, deleteWarranty, getWarranty, importShared, listArchived, listAttachments, listWarranties, migrate, type Db } from './repo.ts';
import {
  addClaim, addCustomReminder, addInbox, assignInbox, bundleMembers, bundleTogether, changeCount, cleanDocText, collectionsOf, createCollection,
  deleteCollection, discardInbox, indexCounts, leaveBundle, listClaims, listCollections, listCustomReminders, listInbox, markBackedUp, mergeWarranties,
  pendingBackup, plannedCustomReminders, purgeDeleted, restoreCategories, saveDocText, setArchived, setCategory, setMembership, shareDocument,
  softDeleteAttachment, softDeleteWarranties, undoDeleteAttachment, undoDeleteWarranties, unindexedDocuments, updateClaim, warrantiesWithText,
} from './features.ts';
import { nodeDb } from './testDb.ts';
import { dumpDb, restoreDb } from '../backup/format.ts';

const base = {
  account_id: null, product_name: 'Kettle', store_name: 'Shop', purchase_date: '2026-01-10', warranty_start_date: '2026-01-10', warranty_months: 24,
  order_number: null, serial_number: null, contact_email: null, contact_phone: null, website_url: null, notes: null,
};
async function fresh(): Promise<Db & { raw: ReturnType<typeof nodeDb>['raw'] }> {
  const db = nodeDb();
  await migrate(db);
  return db;
}

test('migration from 12: existing rows get favorite 0, labels, and the change counter starts', async () => {
  const db = nodeDb();
  // Run migrations 1-12 only, by applying them through a copy that stops early.
  const { MIGRATIONS_FOR_TEST } = await import('./repo.ts');
  for (let v = 0; v < 12; v++) {
    db.raw.exec(MIGRATIONS_FOR_TEST[v]);
    db.raw.exec(`PRAGMA user_version = ${v + 1}`);
  }
  db.raw.exec(`INSERT INTO warranties (origin, product_name, store_name, purchase_date, warranty_start_date, warranty_months, length_is_suggested, status, created_at, updated_at, photo_path)
    VALUES ('manual', 'Old drill', 'Shop', '2025-05-01', '2025-05-01', 24, 0, 'complete', 'x', 'x', 'photo-1.jpg')`);
  db.raw.exec(`INSERT INTO attachments (warranty_id, filename, local_path) VALUES (1, 'inv.pdf', 'mail-9.pdf'), (1, 'scan.pdf', 'abc.pdf')`);
  await migrate(db);
  const w = (await getWarranty(db, 1))!;
  assert.equal(w.favorite, 0);
  assert.equal(w.photo_path, 'photo-1.jpg');
  assert.deepEqual((await listAttachments(db, 1)).map((a) => [a.filename, a.label]), [['inv.pdf', 'receipt'], ['scan.pdf', 'other']]);
  assert.equal((await pendingBackup(db)).changes, true); // never backed up
});

test('undo: a deleted warranty can come back until purged; then its files go unless shared', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  const b = await addManual(db, { ...base, product_name: 'Toaster' });
  await addAttachment(db, a, 'r.pdf', 'shared.pdf', 'receipt');
  await addAttachment(db, b, 'r.pdf', 'shared.pdf', 'receipt');
  await addAttachment(db, a, 'own.pdf', 'own.pdf');
  await softDeleteWarranties(db, [a], '2026-11-13T10:00:00.000Z');
  assert.equal(await getWarranty(db, a), null);
  assert.equal((await listWarranties(db, 'complete')).length, 1);
  await undoDeleteWarranties(db, [a]);
  assert.equal((await getWarranty(db, a))?.doc_count, 2);
  await softDeleteWarranties(db, [a], '2026-11-13T10:00:00.000Z');
  assert.deepEqual(await purgeDeleted(db, '2026-11-13T09:59:00.000Z'), []); // window not over
  assert.deepEqual(await purgeDeleted(db, '2026-11-13T10:01:00.000Z'), ['own.pdf']); // shared.pdf is still Toaster's
  assert.deepEqual((await listAttachments(db, b)).map((d) => d.local_path), ['shared.pdf']);
});

test('undo: a removed document returns; purge deletes the row and the unshared file', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  const doc = await addAttachment(db, a, 'r.pdf', 'r.pdf');
  await softDeleteAttachment(db, doc, '2026-11-13T10:00:00.000Z');
  assert.equal((await getWarranty(db, a))?.doc_count, 0);
  await undoDeleteAttachment(db, doc);
  assert.equal((await listAttachments(db, a)).length, 1);
  await softDeleteAttachment(db, doc, '2026-11-13T10:00:00.000Z');
  assert.deepEqual(await purgeDeleted(db, '2026-11-14T00:00:00.000Z'), ['r.pdf']);
});

test('deleting a product that shares a receipt keeps the file for the others', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  const b = await addManual(db, { ...base, product_name: 'Toaster' });
  const doc = await addAttachment(db, a, 'r.pdf', 'r.pdf', 'receipt');
  await bundleTogether(db, [a, b]);
  assert.equal(await shareDocument(db, doc, [b]), 1);
  assert.equal(await shareDocument(db, doc, [b]), 0); // already there
  assert.deepEqual(await deleteWarranty(db, a), []);
  assert.equal(await deleteAttachment(db, (await listAttachments(db, b))[0].id), 'r.pdf'); // last user: now it goes
});

test('archive is apart from expired and deleted; categories undo', async () => {
  const db = await fresh();
  const a = await addManual(db, { ...base, category: 'appliances' });
  const b = await addManual(db, base);
  await setArchived(db, [a], true);
  assert.deepEqual((await listWarranties(db, 'complete')).map((w) => w.id), [b]);
  assert.deepEqual((await listArchived(db)).map((w) => w.id), [a]);
  await setArchived(db, [a], false);
  const undo = await setCategory(db, [a, b], 'tools');
  assert.deepEqual((await listWarranties(db, 'complete')).map((w) => w.category), ['tools', 'tools']);
  await restoreCategories(db, undo);
  assert.deepEqual((await listWarranties(db, 'complete')).map((w) => w.category).sort(), ['appliances', null].sort());
});

test('collections: removing one keeps its warranties', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  const kitchen = await createCollection(db, '  Kitchen ', 'room');
  await setMembership(db, kitchen, [a], true);
  await setMembership(db, kitchen, [a], true); // twice is still once
  assert.deepEqual((await listCollections(db)).map((c) => [c.name, c.kind, c.count]), [['Kitchen', 'room', 1]]);
  assert.deepEqual(await collectionsOf(db, a), [kitchen]);
  await deleteCollection(db, kitchen);
  assert.ok(await getWarranty(db, a));
  await assert.rejects(createCollection(db, ' ', null));
});

test('claims: several per product, status moves, resolved gets a date; history notes stay', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  await addHistory(db, a, '2026-02-01', 'Called the shop');
  const c1 = await addClaim(db, a, { title: 'Lid broken', submitted_on: '2026-03-01' });
  await addClaim(db, a, { title: 'Second fault', submitted_on: '2026-04-01' });
  await updateClaim(db, c1, { status: 'in_repair' }, '2026-03-05');
  await updateClaim(db, c1, { status: 'resolved', notes: 'Replaced' }, '2026-03-20');
  const claims = await listClaims(db, a);
  assert.deepEqual(claims.map((c) => [c.title, c.status, c.resolved_on]), [['Second fault', 'submitted', null], ['Lid broken', 'resolved', '2026-03-20']]);
  await updateClaim(db, c1, { status: 'in_repair' }, '2026-03-21');
  assert.equal((await listClaims(db, a)).find((c) => c.id === c1)?.resolved_on, null);
});

test('custom reminders: no duplicates; archived and deleted products get none', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  assert.equal(await addCustomReminder(db, a, '2027-01-01', 'Descale'), true);
  assert.equal(await addCustomReminder(db, a, '2027-01-01', 'again'), false);
  assert.equal((await listCustomReminders(db, a)).length, 1);
  assert.equal((await plannedCustomReminders(db)).length, 1);
  await setArchived(db, [a], true);
  assert.equal((await plannedCustomReminders(db)).length, 0);
  await setArchived(db, [a], false);
  await softDeleteWarranties(db, [a]);
  assert.equal((await plannedCustomReminders(db)).length, 0);
});

test('inbox: the same share is taken once; assign moves the file, discard frees it', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  assert.equal(await addInbox(db, { local_path: 'in-1.pdf', filename: 'Receipt.pdf', text: '', source_key: 'k1' }), true);
  assert.equal(await addInbox(db, { local_path: 'in-1b.pdf', filename: 'Receipt.pdf', text: '', source_key: 'k1' }), false);
  await addInbox(db, { local_path: 'in-2.pdf', filename: 'Other.pdf', text: '', source_key: 'k2' });
  const [second, first] = await listInbox(db);
  await assignInbox(db, first.id, a, 'receipt');
  await assert.rejects(assignInbox(db, first.id, a, 'receipt')); // no double processing
  assert.deepEqual((await listAttachments(db, a)).map((d) => [d.local_path, d.label]), [['in-1.pdf', 'receipt']]);
  assert.equal(await discardInbox(db, second.id), 'in-2.pdf');
  assert.equal((await listInbox(db)).length, 0);
});

test('text index: unread files are listed once, searched by every word, cleaned when gone', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  const b = await addManual(db, { ...base, product_name: 'Toaster' });
  const d = await addAttachment(db, a, 'r.pdf', 'r.pdf');
  await addAttachment(db, b, 'r.pdf', 'r.pdf'); // shared file: read once
  await addAttachment(db, b, 's.pdf', 's.pdf');
  assert.deepEqual((await unindexedDocuments(db, 10)).sort(), ['r.pdf', 's.pdf']);
  await saveDocText(db, 'r.pdf', 'order no 260427-380724 serial sn12345', 'done');
  await saveDocText(db, 's.pdf', '', 'failed');
  assert.deepEqual(await indexCounts(db), { total: 2, done: 1, failed: 1 });
  assert.deepEqual([...(await warrantiesWithText(db, ['260427', 'sn12345']))].sort(), [a, b].sort());
  assert.deepEqual([...(await warrantiesWithText(db, ['260427', 'nothere']))], []);
  assert.deepEqual([...(await warrantiesWithText(db, ['%']))], []); // wildcards are literal
  await deleteAttachment(db, d);
  await deleteWarranty(db, b);
  assert.equal(await cleanDocText(db), 2);
});

test('merge: documents, notes, claims, reminders and collections move; empty fields fill; covers stay apart', async () => {
  const db = await fresh();
  const keep = await addManual(db, { ...base, order_number: null });
  const drop = await addManual(db, { ...base, order_number: 'A-123', serial_number: 'SN9', notes: 'from mail', price: 30, currency: 'EUR' });
  const extended = await addManual(db, { ...base, coverage: 'extended' });
  await addAttachment(db, keep, 'k.pdf', 'k.pdf');
  await addAttachment(db, drop, 'd.pdf', 'd.pdf');
  await addHistory(db, drop, '2026-02-02', 'note');
  await addClaim(db, drop, { title: 'Fault', submitted_on: '2026-03-01' });
  await addCustomReminder(db, keep, '2027-01-01', null);
  await addCustomReminder(db, drop, '2027-01-01', null); // same day on both: one stays
  await addCustomReminder(db, drop, '2027-02-01', null);
  const col = await createCollection(db, 'Kitchen', null);
  await setMembership(db, col, [drop], true);
  await mergeWarranties(db, keep, drop);
  const w = (await getWarranty(db, keep))!;
  assert.deepEqual([w.order_number, w.serial_number, w.notes, w.price, w.currency, w.doc_count], ['A-123', 'SN9', 'from mail', 30, 'EUR', 2]);
  assert.equal(await getWarranty(db, drop), null);
  assert.equal((await listClaims(db, keep)).length, 1);
  assert.deepEqual((await listCustomReminders(db, keep)).map((r) => r.date), ['2027-01-01', '2027-02-01']);
  assert.deepEqual(await collectionsOf(db, keep), [col]);
  await assert.rejects(mergeWarranties(db, keep, extended), /covers/);
});

test('merge preserves a live shared document when the retained copy is pending deletion', async () => {
  const db = await fresh();
  const keep = await addManual(db, base);
  const drop = await addManual(db, base);
  const removed = await addAttachment(db, keep, 'receipt.pdf', 'shared.pdf');
  await addAttachment(db, drop, 'receipt.pdf', 'shared.pdf');
  await softDeleteAttachment(db, removed, '2026-01-01');
  await mergeWarranties(db, keep, drop);
  assert.deepEqual(await purgeDeleted(db, '2026-01-02'), []);
  assert.deepEqual((await listAttachments(db, keep)).map((d) => d.local_path), ['shared.pdf']);
});

test('bundles: leaving down to one dissolves it; each keeps its own dates', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  const b = await addManual(db, { ...base, product_name: 'Toaster', warranty_months: 12 });
  const c = await addManual(db, { ...base, product_name: 'Blender' });
  const id = await bundleTogether(db, [a, b]);
  assert.equal(await bundleTogether(db, [b, c]), id); // joins the existing bundle
  assert.deepEqual((await bundleMembers(db, id)).map((w) => w.end_date), ['2028-01-10', '2027-01-10', '2028-01-10']);
  await leaveBundle(db, a);
  await leaveBundle(db, b);
  assert.equal((await getWarranty(db, c))?.bundle_id, null);
});

test('backup state: changes after a completed backup are pending; documents count until uploaded', async () => {
  const db = await fresh();
  const a = await addManual(db, base);
  await addAttachment(db, a, 'r.pdf', 'r.pdf');
  assert.deepEqual(await pendingBackup(db), { changes: true, documents: 1 });
  const at = await changeCount(db);
  await markBackedUp(db, at, ['r.pdf']);
  assert.deepEqual(await pendingBackup(db), { changes: false, documents: 0 });
  await setArchived(db, [a], true);
  assert.equal((await pendingBackup(db)).changes, true);
});

test('backup restore: v13 tables travel; a v12 backup without them restores; junk is refused', async () => {
  const source = await fresh();
  const a = await addManual(source, base);
  await addClaim(source, a, { title: 'Fault', submitted_on: '2026-03-01' });
  const col = await createCollection(source, 'Kitchen', 'room');
  await setMembership(source, col, [a], true);
  await addCustomReminder(source, a, '2027-01-01', null);
  const data = await dumpDb(source, {});
  const target = await fresh();
  await restoreDb(target, data);
  assert.equal((await listClaims(target, a)).length, 1);
  assert.deepEqual(await collectionsOf(target, a), [col]);
  assert.equal((await listCustomReminders(target, a)).length, 1);
  const old = { ...data, schema: 12, tables: { accounts: [], warranties: data.tables.warranties, sources: [], store_rules: [], attachments: [], returns: [], history: [] } };
  const target2 = await fresh();
  await restoreDb(target2, old);
  assert.equal((await listWarranties(target2, 'complete')).length, 1);
  assert.equal((await listClaims(target2, a)).length, 0);
  await assert.rejects(restoreDb(target2, { app: 'warrantly', schema: 1, createdAt: '', tables: { warranties: 'nope' }, settings: {} } as never), /Damaged/);
  await assert.rejects(restoreDb(target2, { app: 'other' } as never), /Not a Warrantly/);
});

test('a shared file from someone else binds only plain values', async () => {
  const db = await fresh();
  const added = await importShared(db, [{
    warranty: { product_name: 'TV', store_name: 'Shop', purchase_date: '2026-01-01', warranty_start_date: '2026-01-01', warranty_months: 24, notes: { evil: 1 }, website_url: ['x'] },
    history: [],
    documents: [],
  }], async () => null);
  assert.equal(added, 1);
  const [w] = await listWarranties(db, 'complete');
  assert.equal(w.notes, null);
  assert.equal(w.website_url, null);
});
