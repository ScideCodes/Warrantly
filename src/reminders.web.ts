import type { Db, Warranty } from '@/db/repo.ts';

// Web is only used for screen previews; local notifications are native.
export const rescheduleReminders = async (_db: Db): Promise<void> => {};
export const useReminderTaps = (): void => {};
export const sendTestReminder = async (_w: Warranty, _daysLeft: number): Promise<boolean> => false;
