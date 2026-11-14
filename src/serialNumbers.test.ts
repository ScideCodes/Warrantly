import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serialEntries, serialFields, serialSummary, encodeSerialEntries, validSerialEntries, mergeSerialEntries } from './serialNumbers.ts';
import { addManual, updateWarranty, getWarranty, migrate, sharedWarranties, importShared, MIGRATIONS_FOR_TEST } from './db/repo.ts';
import { nodeDb } from './db/testDb.ts';
import { dumpDb, restoreDb } from './backup/format.ts';
import { mergeWarranties } from './db/features.ts';
import { transferItem, transferHtml } from './transfer.ts';
import { duplicatePairs } from './duplicates.ts';
import { toCsv, toHtml } from './export.ts';
import type { TFunction } from 'i18next';

const entries = [{ label: 'Indoor unit', value: 'IN-001' }, { label: 'Outdoor unit', value: 'OUT-002' }];
const fields = serialFields({ serial_numbers: encodeSerialEntries(entries) });
const base = { account_id: null, product_name: 'AC unit', store_name: 'Shop', purchase_date: '2026-11-14', warranty_start_date: '2026-11-14', warranty_months: 24, order_number: null, serial_number: null, contact_email: null, contact_phone: null, website_url: null, notes: null };

test('serial model: old records, canonical clearing, validation and scalar callers preserve components', () => {
  assert.deepEqual(serialEntries({ serial_number: ' LEGACY ' }), [{ label: '', value: 'LEGACY' }]);
  assert.deepEqual(serialEntries(fields), entries);
  assert.equal(fields.serial_number, 'IN-001');
  assert.equal(encodeSerialEntries([{ label: '', value: ' ' }]), null);
  assert.equal(validSerialEntries([{ label: 'Outdoor', value: '' }]), false);
  assert.throws(() => encodeSerialEntries([{ label: 'Outdoor', value: '' }]));
  assert.deepEqual(serialEntries({ serial_number: 'OLD', serial_numbers: '[]' }), []);
  assert.deepEqual(serialEntries({ serial_number: 'OLD', serial_numbers: 'broken' }), [{ label: '', value: 'OLD' }]);
  assert.deepEqual(serialEntries(serialFields({ serial_number: 'NEW' }, fields)), [{ label: 'Indoor unit', value: 'NEW' }, entries[1]]);
  assert.deepEqual(serialEntries(serialFields({ serial_number: null }, fields)), [entries[1]]);
  assert.deepEqual(mergeSerialEntries(fields, fields), entries);
});

test('migration from 13 preserves old serial; labeled serials save, edit, backup, restore and share', async () => {
  const db = nodeDb();
  for (let v = 0; v < 13; v++) { db.raw.exec(MIGRATIONS_FOR_TEST[v]); db.raw.exec(`PRAGMA user_version = ${v + 1}`); }
  db.raw.exec(`INSERT INTO warranties (origin, product_name, store_name, purchase_date, warranty_start_date, warranty_months, length_is_suggested, status, serial_number, created_at, updated_at) VALUES ('manual','Old','Shop','2026-01-01','2026-01-01',24,0,'complete','OLD-SERIAL','x','x')`);
  await migrate(db);
  assert.equal(serialSummary((await getWarranty(db, 1))!), 'OLD-SERIAL');
  const id = await addManual(db, { ...base, ...fields });
  let w = (await getWarranty(db, id))!;
  assert.deepEqual(serialEntries(w), entries);
  await updateWarranty(db, id, { ...base, serial_number: 'NEW-IN' });
  w = (await getWarranty(db, id))!;
  assert.equal(serialEntries(w)[1].value, 'OUT-002');
  await updateWarranty(db, id, { ...base, ...serialFields({ serial_numbers: encodeSerialEntries([entries[1]]) }) });
  w = (await getWarranty(db, id))!;
  assert.equal(w.serial_number, 'OUT-002');
  await updateWarranty(db, id, { ...base, ...fields });
  const backup = await dumpDb(db, {});
  const restored = nodeDb(); await migrate(restored); await restoreDb(restored, backup);
  assert.deepEqual(serialEntries((await getWarranty(restored, id))!), entries);
  const shared = (await sharedWarranties(db, [id]))[0];
  const target = nodeDb(); await migrate(target);
  assert.equal(await importShared(target, [shared], async () => null), 1);
  assert.deepEqual(serialEntries((await getWarranty(target, 1))!), entries);
  const oldBackup = await dumpDb(db, {});
  oldBackup.schema = 13;
  for (const row of oldBackup.tables.warranties ?? []) delete row.serial_numbers;
  await restoreDb(restored, oldBackup);
  assert.equal(serialSummary((await getWarranty(restored, 1))!), 'OLD-SERIAL');
  assert.equal(serialSummary((await getWarranty(restored, id))!), 'IN-001');
  assert.equal(await importShared(target, [{ ...shared, warranty: { ...shared.warranty, product_name: 'Legacy AC', serial_number: 'LEGACY-AC', serial_numbers: undefined } }], async () => null), 1);
  assert.equal(serialSummary((await getWarranty(target, 2))!), 'LEGACY-AC');
  const stripped = transferItem(shared, new Set(), new Set());
  assert.equal(stripped.warranty.serial_number, undefined);
  assert.equal(stripped.warranty.serial_numbers, undefined);
  const html = transferHtml(shared, { title: 'AC', rows: { serial_number: 'Serials' }, documents: 'Documents', note: '' });
  assert.ok(html.includes('Indoor unit: IN-001\nOutdoor unit: OUT-002'));
  assert.ok(!html.includes('"value"'));
  const translate = ((key: string) => key) as TFunction;
  w = (await getWarranty(db, id))!;
  assert.ok(toCsv([w], translate).includes('Outdoor unit: OUT-002'));
  assert.ok(toHtml([w], translate, 'AC').includes('Indoor unit: IN-001'));
});

test('matching any component finds duplicates and merging retains both units', async () => {
  const db = nodeDb(); await migrate(db);
  const a = await addManual(db, { ...base, ...fields });
  const b = await addManual(db, { ...base, product_name: 'Other name', serial_number: 'OUT-002' });
  const wa = (await getWarranty(db, a))!, wb = (await getWarranty(db, b))!;
  assert.ok(duplicatePairs([wa, wb], new Set())[0].reasons.includes('serial'));
  await mergeWarranties(db, a, b);
  const merged = serialEntries((await getWarranty(db, a))!);
  assert.equal(merged.length, 2);
  assert.ok(merged.some(e => e.value === 'IN-001'));
  assert.ok(merged.some(e => e.value === 'OUT-002'));
});
