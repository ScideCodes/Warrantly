// Backup health (shortlist 20): one plain state for Settings and the home row. Pure, tested in Node.
import { backupDue, type BackupInterval } from './backup/format.ts';

export type BackupHealth =
  | { state: 'off' }
  | { state: 'failed'; error: string; at: string | null }
  | { state: 'never' }
  | { state: 'overdue'; lastAt: string }
  | { state: 'pending'; lastAt: string; changes: boolean; documents: number }
  | { state: 'ok'; lastAt: string };

export interface HealthInput {
  enabled: boolean;
  hasPassword: boolean;
  lastAt: string | null;
  error: string | null;
  errorAt: string | null;
  interval: BackupInterval;
  pending: { changes: boolean; documents: number };
}

// A failure wins over everything (it needs the user); then "never", "overdue" (interval passed twice over,
// so an app that is rarely opened is told), then edits or documents not yet on Drive.
export function backupHealth(i: HealthInput, now = new Date()): BackupHealth {
  if (!i.enabled || !i.hasPassword) return { state: 'off' };
  if (i.error) return { state: 'failed', error: i.error, at: i.errorAt };
  if (!i.lastAt) return { state: 'never' };
  const twice = new Date(now.getTime() - (now.getTime() - new Date(i.lastAt).getTime()) / 2);
  if (backupDue(i.lastAt, i.interval, twice)) return { state: 'overdue', lastAt: i.lastAt };
  if (i.pending.changes || i.pending.documents > 0) return { state: 'pending', lastAt: i.lastAt, ...i.pending };
  return { state: 'ok', lastAt: i.lastAt };
}
