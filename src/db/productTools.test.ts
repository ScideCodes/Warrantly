import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeDb } from './testDb.ts';
import { migrate, addManualWithDocument, addManual, addAttachment, getWarranty, updateWarranty, sharedWarranties, importShared, deleteWarranty } from './repo.ts';
import { dismissedMissingDetails, dismissMissingDetails, missingDetails, linkReplacement, replacementHistory, setReturnDeadline } from './productTools.ts';
import { duplicatePairs } from '../duplicates.ts';
import { returnDeadline, reminderPlan } from '../warranty.ts';
import { dumpDb, restoreDb } from '../backup/format.ts';
const input = { account_id: null, product_name: 'Air conditioner', store_name: 'Shop', purchase_date: '2026-11-01', warranty_start_date: '2026-11-01', warranty_months: 24, order_number: null, serial_number: 'SN1', contact_email: null, contact_phone: null, website_url: null, notes: null };
async function fresh() { const db = nodeDb(); await migrate(db); return db; }
test('missing details includes confirmed records without receipts or serials and excludes archived/deleted ones', async () => {
  const db = await fresh();
  const a = await addManual(db, input);
  assert.deepEqual((await missingDetails(db)).map(w => w.id), [a]);
  await addAttachment(db, a, 'receipt.pdf', 'receipt.pdf', 'receipt');
  assert.equal((await missingDetails(db)).length, 0);
  await db.runAsync('UPDATE warranties SET serial_number = NULL, serial_numbers = NULL WHERE id = ?', [a]);
  assert.equal((await missingDetails(db)).length, 1);
  await db.runAsync("UPDATE warranties SET archived_at = 'now' WHERE id = ?", [a]);
  assert.equal((await missingDetails(db)).length, 0);
  db.raw.close();
});
test('return date supports manual purchases, removing/resetting and survives editing and sharing', async () => {
  const db = await fresh(); const id = await addManual(db, input);
  await assert.rejects(setReturnDeadline(db, id, '2026-02-30'));
  await assert.rejects(setReturnDeadline(db, id, '2026-10-31'));
  await setReturnDeadline(db, id, '2026-12-01');
  await updateWarranty(db, id, input);
  assert.equal(returnDeadline((await getWarranty(db, id))!), '2026-12-01');
  const shared = await sharedWarranties(db, [id]);
  const other = await fresh(); await importShared(other, shared, async () => null);
  assert.equal(returnDeadline((await getWarranty(other, 1))!), '2026-12-01');
  const jobs = reminderPlan([{ id, end_date: '2028-11-01', return_by: '2026-12-01' }], '2026-11-16', 60, []);
  assert.equal(jobs.find(j => j.kind === 'return')?.date, '2026-11-29');
  await db.runAsync("UPDATE warranties SET origin = 'gmail' WHERE id = ?", [id]);
  await setReturnDeadline(db, id, ''); assert.equal(returnDeadline((await getWarranty(db, id))!), null);
  await setReturnDeadline(db, id, null); assert.equal(returnDeadline((await getWarranty(db, id))!), '2026-11-15');
  db.raw.close(); other.raw.close();
});
test('replacement chains are bidirectional, reject cycles, survive backup, never leak local IDs through sharing', async () => {
  const db = await fresh();
  const a = await addManual(db, input), b = await addManual(db, { ...input, product_name: 'New AC' }), c = await addManual(db, { ...input, product_name: 'Third AC' });
  await linkReplacement(db, a, b); await linkReplacement(db, b, c);
  assert.equal((await replacementHistory(db, b)).original?.id, a);
  assert.deepEqual((await replacementHistory(db, b)).replacements.map(w => w.id), [c]);
  await assert.rejects(linkReplacement(db, c, a)); await assert.rejects(linkReplacement(db, a, a));
  await assert.rejects(linkReplacement(db, a, 999));
  assert.equal((await sharedWarranties(db, [b]))[0].warranty.replacement_of, undefined);
  const restored = await fresh(); await restoreDb(restored, await dumpDb(db, {}));
  assert.equal((await replacementHistory(restored, b)).original?.id, a);
  assert.equal((await getWarranty(restored, a))!.warranty_start_date, input.warranty_start_date);
  db.raw.close(); restored.raw.close();
});

test('linked replacements are not duplicates and deletion cannot link a reused ID', async () => {
  const db = await fresh(); const a = await addManual(db, input), b = await addManual(db, input);
  await linkReplacement(db, a, b);
  assert.equal(duplicatePairs([(await getWarranty(db, a))!, (await getWarranty(db, b))!], new Set()).length, 0);
  await deleteWarranty(db, a);
  assert.equal((await getWarranty(db, b))!.replacement_of, null);
  db.raw.close();
});

test('adding a replacement and linking it is atomic when its original disappeared', async () => {
  const db = await fresh();
  await assert.rejects(addManualWithDocument(db, input, null, 999));
  assert.equal((await missingDetails(db)).length, 0);
  const original = await addManual(db, input);
  const child = await addManualWithDocument(db, input, null, original);
  assert.equal((await getWarranty(db, child))!.replacement_of, original);
  db.raw.close();
});

test('missing-details dismissal persists through edits and backups, can be restored, never changes warranty status or shared records', async () => {
  const db = await fresh(); const id = await addManual(db, { ...input, serial_number: null });
  await dismissMissingDetails(db, id, true);
  await updateWarranty(db, id, { ...input, serial_number: null });
  assert.equal((await missingDetails(db)).length, 0);
  assert.equal((await getWarranty(db, id))!.status, 'complete');
  assert.equal((await sharedWarranties(db, [id]))[0].warranty.details_dismissed, undefined);
  const restored = await fresh(); await restoreDb(restored, await dumpDb(db, {}));
  assert.equal((await missingDetails(restored)).length, 0);
  await dismissMissingDetails(restored, id, false);
  assert.equal((await missingDetails(restored)).length, 1);
  await restored.runAsync("UPDATE warranties SET status = 'needs_input' WHERE id = ?", [id]);
  await dismissMissingDetails(restored, id, true);
  assert.equal((await missingDetails(restored)).length, 0);
  assert.equal((await getWarranty(restored, id))!.status, 'needs_input');
  assert.deepEqual((await dismissedMissingDetails(restored)).map(w => w.id), [id]);
  db.raw.close(); restored.raw.close();
});
