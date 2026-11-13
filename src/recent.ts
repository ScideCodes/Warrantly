// Recently opened warranties and documents (shortlist 22). Kept on this phone only, at most 8, newest first,
// each target once. Never in backups or shares. Pure list logic; storage is in src/settings.ts.
export type RecentEntry = { kind: 'warranty'; id: number; at: string } | { kind: 'document'; id: number; warrantyId: number; at: string };
export const RECENT_MAX = 8;

const same = (a: RecentEntry, b: RecentEntry) => a.kind === b.kind && a.id === b.id;

export function pushRecent(list: RecentEntry[], entry: RecentEntry, max = RECENT_MAX): RecentEntry[] {
  return [entry, ...list.filter((e) => !same(e, entry))].slice(0, max);
}

// Drops entries whose warranty or document no longer exists (deleted, merged, archived away is kept).
export function liveRecent(list: RecentEntry[], warranties: Set<number>, documents: Set<number>): RecentEntry[] {
  return list.filter((e) => (e.kind === 'warranty' ? warranties.has(e.id) : documents.has(e.id) && warranties.has(e.warrantyId)));
}

export function parseRecent(text: string | null): RecentEntry[] {
  try {
    const v = JSON.parse(text ?? '[]');
    return Array.isArray(v) ? v.filter((e) => e && (e.kind === 'warranty' || e.kind === 'document') && Number.isInteger(e.id)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}
