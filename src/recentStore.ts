import { clearRecent, getRecentText, setRecentText } from '@/settings';
import { parseRecent, pushRecent, type RecentEntry } from '@/recent';

// Recently opened, stored on this phone (never in backups). Opening a warranty or document records it.
export const readRecent = (): RecentEntry[] => parseRecent(getRecentText());

export function recordWarranty(id: number): void {
  setRecentText(JSON.stringify(pushRecent(readRecent(), { kind: 'warranty', id, at: new Date().toISOString() })));
}
export function recordDocument(id: number, warrantyId: number): void {
  setRecentText(JSON.stringify(pushRecent(readRecent(), { kind: 'document', id, warrantyId, at: new Date().toISOString() })));
}
export const forgetRecent = (): void => clearRecent();
