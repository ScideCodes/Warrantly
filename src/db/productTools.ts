import { completeness } from '../completeness.ts';
import { isValidYmd } from '../warranty.ts';
import { listWarranties, getWarranty, type Db, type Warranty } from './repo.ts';

export async function missingDetails(db: Db): Promise<Warranty[]> {
  const [complete, incomplete, docs] = await Promise.all([listWarranties(db, 'complete'), listWarranties(db, 'needs_input'), db.getAllAsync<{ warranty_id: number; label: string }>('SELECT warranty_id, label FROM attachments WHERE deleted_at IS NULL', [])]);
  const labels = new Map<number, { label: string }[]>();
  for (const doc of docs) { const group = labels.get(doc.warranty_id) ?? []; group.push(doc); labels.set(doc.warranty_id, group); }
  return [...incomplete, ...complete.filter(w => completeness(w, labels.get(w.id) ?? []).length > 0)];
}

export async function setReturnDeadline(db: Db, id: number, date: string | null): Promise<void> {
  const w = await getWarranty(db, id);
  if (!w) throw new Error('Warranty not found');
  if (date !== null && date !== '' && (!isValidYmd(date) || date < w.purchase_date)) throw new Error('Invalid return date');
  await db.runAsync('UPDATE warranties SET return_by = ?, updated_at = ? WHERE id = ?', [date, new Date().toISOString(), id]);
}

export async function linkReplacement(db: Db, original: number, replacement: number | null): Promise<void> {
  const w = await getWarranty(db, original);
  if (!w) throw new Error('Warranty not found');
  if (replacement === null) {
    await db.runAsync('UPDATE warranties SET replacement_of = NULL WHERE replacement_of = ?', [original]);
    return;
  }
  const next = await getWarranty(db, replacement);
  if (!next || next.id === original) throw new Error('Invalid replacement');
  // A chain is allowed, a cycle is not. IDs stay local; shared files never carry them.
  const seen = new Set([replacement]);
  let cursor: Warranty | null = w;
  while (cursor) {
    if (seen.has(cursor.id)) throw new Error('Replacement cycle');
    seen.add(cursor.id);
    cursor = cursor.replacement_of ? await getWarranty(db, cursor.replacement_of) : null;
  }
  await db.runAsync('UPDATE warranties SET replacement_of = ?, updated_at = ? WHERE id = ?', [original, new Date().toISOString(), replacement]);
}

export async function replacementHistory(db: Db, id: number): Promise<{ original: Warranty | null; replacements: Warranty[] }> {
  const w = await getWarranty(db, id);
  const rows = await db.getAllAsync<{ id: number }>('SELECT id FROM warranties WHERE replacement_of = ? AND deleted_at IS NULL ORDER BY created_at', [id]);
  const replacements = (await Promise.all(rows.map(r => getWarranty(db, r.id)))).filter((r): r is Warranty => r !== null);
  return { original: w?.replacement_of ? await getWarranty(db, w.replacement_of) : null, replacements };
}

export async function unlinkReplacements(db: Db, id: number): Promise<void> {
  await db.runAsync('UPDATE warranties SET replacement_of = NULL, updated_at = ? WHERE id = ? OR replacement_of = ?', [new Date().toISOString(), id, id]);
}
