import type { TFunction } from 'i18next';
import type { BackupStep } from '@/backup';

// The line a busy backup or restore screen shows, so a long first backup never looks frozen.
export const backupStepText = (t: TFunction, s: BackupStep): string =>
  s.step === 'docs' ? t('backupSteps.docs', { done: s.done ?? 0, total: s.total ?? 0 }) : t(`backupSteps.${s.step}`);
