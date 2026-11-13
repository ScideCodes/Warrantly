// Completeness check (shortlist 15): what is missing for a smooth claim, each with a direct fix. Never blocks
// saving. `needed`: without it a claim is likely refused or the dates may be wrong. `suggested`: helps.
export type IssueKey = 'no_document' | 'no_receipt_label' | 'length_unconfirmed' | 'start_unconfirmed' | 'no_serial';
export interface Issue { key: IssueKey; level: 'needed' | 'suggested'; fix: 'attach' | 'label' | 'edit' | 'serial' }

export function completeness(
  w: { length_is_suggested: number; start_is_suggested: number; serial_number: string | null; status: string },
  docs: { label: string }[],
): Issue[] {
  const issues: Issue[] = [];
  if (!docs.length) issues.push({ key: 'no_document', level: 'needed', fix: 'attach' });
  else if (!docs.some((d) => d.label === 'receipt' || d.label === 'warranty_card')) issues.push({ key: 'no_receipt_label', level: 'suggested', fix: 'label' });
  if (w.length_is_suggested) issues.push({ key: 'length_unconfirmed', level: 'needed', fix: 'edit' });
  if (w.start_is_suggested) issues.push({ key: 'start_unconfirmed', level: 'suggested', fix: 'edit' });
  if (!w.serial_number?.trim()) issues.push({ key: 'no_serial', level: 'suggested', fix: 'serial' });
  return issues;
}
