import { hasBackupPassword } from '@/backup';
import type { BackupInterval } from '@/backup/format.ts';
import { backupHealth, type BackupHealth } from '@/backupHealth';
import { getDb } from '@/db/client';
import { pendingBackup } from '@/db/features.ts';
import { getSetting } from '@/settings';

// The stored backup facts read into one state (src/backupHealth.ts).
export async function readBackupHealth(): Promise<BackupHealth> {
  return backupHealth({
    enabled: getSetting('backup_enabled') === '1',
    hasPassword: hasBackupPassword(),
    lastAt: getSetting('last_backup_at') || null,
    error: getSetting('last_backup_error') || null,
    errorAt: getSetting('last_backup_error_at') || null,
    interval: (getSetting('backup_interval') as BackupInterval) ?? 'weekly',
    pending: await pendingBackup(await getDb()),
  });
}
