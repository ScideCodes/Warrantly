import { ALL_GROUPS, type ReminderGroup } from '@/warranty';

// Web is only used for screen previews; expo-sqlite's sync API needs extra web setup.
export const getUsername = (): string | null => localStorage.getItem('username');
export const setUsername = (name: string): void => localStorage.setItem('username', name);
export const getRemindersEnabled = (): boolean => localStorage.getItem('reminders_enabled') !== '0';
export const setRemindersEnabled = (on: boolean): void => localStorage.setItem('reminders_enabled', on ? '1' : '0');

// App language: 'system' follows the phone; else a language code the app ships.
export const getLanguageSetting = (): string => localStorage.getItem('language') ?? 'system';
export const setLanguageSetting = (code: string): void => localStorage.setItem('language', code);

// Which "What's new" notes were last shown (whatsNew.ts).
export const getSeenWhatsNew = (): string | null => localStorage.getItem('seen_whats_new');
export const setSeenWhatsNew = (id: string): void => localStorage.setItem('seen_whats_new', id);

// Theme: 'system' follows the phone, else 'light' or 'dark'.
export const getThemeSetting = (): string => localStorage.getItem('theme') ?? 'system';
export const setThemeSetting = (theme: string): void => localStorage.setItem('theme', theme);

// Reminder time of day (hour) and which reminders (groups from warranty.ts), section 16.
// Minutes after midnight (9:00 = 540). Older installs saved only the hour.
export const getReminderTime = (): number => Number(localStorage.getItem('reminder_time') ?? Number(localStorage.getItem('reminder_hour') ?? 9) * 60);
export const setReminderTime = (minutes: number): void => localStorage.setItem('reminder_time', String(minutes));
export const getReminderGroups = (): ReminderGroup[] => JSON.parse(localStorage.getItem('reminder_groups') ?? 'null') ?? ALL_GROUPS;
export const setReminderGroups = (groups: ReminderGroup[]): void => localStorage.setItem('reminder_groups', JSON.stringify(groups));

// Return-window reminders (EU 14-day withdrawal) are on by default.
export const getReturnRemindersEnabled = (): boolean => localStorage.getItem('return_reminders') !== '0';
export const setReturnRemindersEnabled = (on: boolean): void => localStorage.setItem('return_reminders', on ? '1' : '0');

// Widget (section 13): product names hidden by default while the app lock is on. null = follow that default.
export const getWidgetNames = (): boolean | null => {
  const v = localStorage.getItem('widget_names');
  return v === null ? null : v === '1';
};
export const setWidgetNames = (on: boolean | null): void => (on === null ? localStorage.removeItem('widget_names') : localStorage.setItem('widget_names', on ? '1' : '0'));

// Backup settings (section 17). The backup password's key lives in SecureStore, not here.
export const getSetting = (key: 'backup_enabled' | 'backup_interval' | 'last_backup_at' | 'last_backup_error' | 'backup_account' | 'gmail_import_enabled'): string | null => localStorage.getItem(key);
export const setSetting = (key: 'backup_enabled' | 'backup_interval' | 'last_backup_at' | 'last_backup_error' | 'backup_account' | 'gmail_import_enabled', value: string): void => localStorage.setItem(key, value);
// What a backup carries besides the database.
export const settingsSnapshot = (): Record<string, string | null> => ({ username: localStorage.getItem('username'), theme: localStorage.getItem('theme'), language: localStorage.getItem('language'), reminder_time: localStorage.getItem('reminder_time'), reminder_groups: localStorage.getItem('reminder_groups'), return_reminders: localStorage.getItem('return_reminders'), reminders_enabled: localStorage.getItem('reminders_enabled') });
export function applySnapshot(s: Record<string, string | null>): void {
  for (const [k, v] of Object.entries(s)) if (['username', 'theme', 'language', 'reminders_enabled', 'reminder_time', 'reminder_groups', 'return_reminders'].includes(k) && v !== null) localStorage.setItem(k, v);
}

// List density (shortlist): compact rows use less padding and one meta line; text size is never reduced.
export type Density = 'comfortable' | 'compact';
export const getDensity = (): Density => (localStorage.getItem('density') === 'compact' ? 'compact' : 'comfortable');
export const setDensity = (d: Density): void => localStorage.setItem('density', d);

// Home list order (src/listView.ts).
export const getListSort = (): string => localStorage.getItem('list_sort') ?? 'expiry';
export const setListSort = (key: string): void => localStorage.setItem('list_sort', key);

// Recently opened (src/recent.ts): this phone only, never backed up.
export const getRecentText = (): string | null => localStorage.getItem('recent');
export const setRecentText = (text: string): void => localStorage.setItem('recent', text);
export const clearRecent = (): void => localStorage.removeItem('recent');

// Per placed widget (src/widgetConfig.ts), keyed by Android's widget id.
export const getWidgetConfigText = (id: number): string | null => localStorage.getItem(`widget:${id}`);
export const setWidgetConfigText = (id: number, text: string): void => localStorage.setItem(`widget:${id}`, text);
export const removeWidgetConfig = (id: number): void => localStorage.removeItem(`widget:${id}`);

export const getUpdateLater = (): string | null => localStorage.getItem('update_later');
export const setUpdateLater = (day: string): void => localStorage.setItem('update_later', day);
