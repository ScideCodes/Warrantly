import type { Db } from '@/db/repo.ts';

// Web is only used for screen previews; local notifications are native.
export const rescheduleReminders = async (_db: Db): Promise<void> => {};
export const useReminderTaps = (): void => {};
