import { addAttachment, addManual, type Db } from './repo.ts';
import { reviewValid, type ReviewDraft } from '../importReview.ts';
import { getInboxItem } from './features.ts';

// All chosen products, the shared receipt and inbox consumption commit together. A failed save
// leaves the original inbox entry available for retry; no half-imported order or orphaned copy.
export async function saveReviewedImport(db: Db, inboxId: number, draft: ReviewDraft): Promise<number[]> {
  if (!reviewValid(draft)) throw new Error('Review the required fields');
  const ids: number[] = [];
  await db.withTransactionAsync(async () => {
    const item = await getInboxItem(db, inboxId);
    if (!item) throw new Error('This import was already saved or removed');
    const chosen = draft.products.filter(p => p.selected);
    let bundle: number | null = null;
    if (chosen.length > 1) bundle = (await db.runAsync('INSERT INTO bundles (created_at) VALUES (?)', [new Date().toISOString()])).lastInsertRowId;
    for (const p of chosen) {
      const id = await addManual(db, { account_id: null, product_name: p.name.trim(), store_name: draft.store.trim(), purchase_date: draft.date,
        warranty_start_date: draft.date, warranty_months: Number(p.months), order_number: draft.order.trim() || null,
        serial_number: null, contact_email: null, contact_phone: null, website_url: null, notes: null }, 'scan');
      await addAttachment(db, id, item.filename, item.local_path);
      if (bundle) await db.runAsync('UPDATE warranties SET bundle_id = ? WHERE id = ?', [bundle, id]);
      ids.push(id);
    }
    await db.runAsync('DELETE FROM inbox WHERE id = ?', [inboxId]);
  });
  return ids;
}
