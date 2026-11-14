import assert from 'node:assert/strict';
import { test } from 'node:test';
import { correctedChoices, formatSourceText, reviewDraft, reviewValid, sourceExcerpt } from './importReview.ts';
import { nodeDb } from './db/testDb.ts';
import { migrate, listWarranties, listAttachments } from './db/repo.ts';
import { addInbox, listInbox } from './db/features.ts';
import { saveReviewedImport } from './db/importReview.ts';

const text = 'Acme Shop\nPurchase date: 2026-10-21\nKettle | 24 months warranty\nMouse | 12 months warranty';
test('review detects several products, preserves evidence and requires confirmation of missing values', () => {
  const draft = reviewDraft(text, '2026-11-14');
  assert.equal(draft.products.length, 2);
  assert.equal(reviewValid(draft), true);
  assert.match(sourceExcerpt(text, 'Kettle')!, /Kettle \| 24 months/);
  assert.equal(sourceExcerpt(text, 'Invented name'), null);
  assert.equal(reviewValid({ ...draft, products: draft.products.map(p => ({ ...p, selected: false })) }), false);
  assert.equal(reviewValid(reviewDraft('Acme Shop\n1 × Unknown product', '2026-11-14')), false);
});
test('remembered corrections apply only to that specific product, never every item', () => {
  const draft = reviewDraft(text, '2026-11-14');
  draft.products[0].name = 'Acme Kettle'; draft.products[0].months = '36';
  const next = reviewDraft(text, '2026-11-14', correctedChoices([draft.products[0]]));
  assert.equal(next.products[0].name, 'Acme Kettle');
  assert.equal(next.products[0].months, '36');
  assert.equal(next.products[1].months, '12');
});

test('PDF OCR with no blank lines retains every warranty-tagged product below the header', () => {
  const draft = reviewDraft('ACME SHOP - PAGE 1\nPRIVATE CUSTOMER NAME\nPurchase date: 2026-10-21\nAcme Kettle - 24 months warranty\nAcme Mouse - 12 months warranty', '2026-11-14');
  assert.deepEqual(draft.products.map(p => [p.name, p.months]), [['Acme Kettle', '24'], ['Acme Mouse', '12']]);
});
test('multi-product import shares one receipt, bundles the records and consumes the inbox once', async () => {
  const db = nodeDb(); await migrate(db);
  await addInbox(db, { local_path: 'receipt.pdf', filename: 'receipt.pdf', text, source_key: 'test' });
  const entry = (await listInbox(db))[0];
  const ids = await saveReviewedImport(db, entry.id, reviewDraft(text, '2026-11-14'));
  assert.equal(ids.length, 2);
  const rows = await listWarranties(db, 'complete');
  assert.equal(rows[0].bundle_id, rows[1].bundle_id);
  for (const id of ids) assert.equal((await listAttachments(db, id))[0].local_path, 'receipt.pdf');
  assert.equal((await listInbox(db)).length, 0);
  await assert.rejects(saveReviewedImport(db, entry.id, reviewDraft(text, '2026-11-14')));
  assert.equal((await listWarranties(db, 'complete')).length, 2);
  db.raw.close();
});
test('an import failure rolls back every product and retains the inbox', async () => {
  const db = nodeDb(); await migrate(db);
  await addInbox(db, { local_path: 'receipt.pdf', filename: 'receipt.pdf', text, source_key: 'rollback' });
  db.raw.exec("CREATE TRIGGER fail_second BEFORE INSERT ON warranties WHEN NEW.product_name = 'Mouse' BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(saveReviewedImport(db, (await listInbox(db))[0].id, reviewDraft(text, '2026-11-14')));
  assert.equal((await listWarranties(db, 'complete')).length, 0);
  assert.equal((await listInbox(db)).length, 1);
  db.raw.close();
});

test('unselected products are never saved or bundled', async () => {
  const db = nodeDb(); await migrate(db);
  await addInbox(db, { local_path: 'receipt.pdf', filename: 'receipt.pdf', text, source_key: 'selected' });
  const draft = reviewDraft(text, '2026-11-14'); draft.products[0].selected = false;
  await saveReviewedImport(db, (await listInbox(db))[0].id, draft);
  const rows = await listWarranties(db, 'complete');
  assert.deepEqual(rows.map(r => r.product_name), ['Mouse']);
  assert.equal(rows[0].bundle_id, null);
  db.raw.close();
});

test('formatSourceText merges OCR vertical word fragments into clean readable text', () => {
  const ocrVertical = `PHILIPS
HD9350/90
KETTLE
BLACK
Store:
MediaMarkt
Purchase Date:
2024. 05. 12.
Warranty:
24 months`;
  const formatted = formatSourceText(ocrVertical);
  assert.equal(
    formatted,
    'PHILIPS HD9350/90 KETTLE BLACK\nStore: MediaMarkt\nPurchase Date: 2024. 05. 12.\nWarranty: 24 months',
  );
});

test('formatSourceText unbreaks hyphenated line wraps and preserves lists', () => {
  const textWithHyphen = `Official warran-
ty certificate for the device.

Included accessories:
- 1x Power cable
- 1x Charging dock`;
  const formatted = formatSourceText(textWithHyphen);
  assert.match(formatted, /warranty certificate/);
  assert.match(formatted, /- 1x Power cable\n- 1x Charging dock/);
});

test('sourceExcerpt extracts clean contextual window without cutting mid-word', () => {
  const doc = `Store: MediaMarkt
Order: 1049281
Item: Philips Series 5000 Electric Shaver
Warranty duration: 24 months legal guarantee
Thank you for your purchase!`;
  const excerpt = sourceExcerpt(doc, 'Shaver');
  assert.ok(excerpt);
  assert.match(excerpt, /Item: Philips Series 5000 Electric Shaver/);
  assert.doesNotMatch(excerpt, /\b(hilips|have)\b/); // no chopped partial words
});
