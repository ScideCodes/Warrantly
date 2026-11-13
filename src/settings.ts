import Storage from 'expo-sqlite/kv-store';
import { ALL_GROUPS, type ReminderGroup } from '@/warranty';

// Local-only settings (brainstorm section 12 "settings"), stored in SQLite on the phone.
const USERNAME = 'username';

export const getUsername = (): string | null => Storage.getItemSync(USERNAME);
export const setUsername = (name: string): void => Storage.setItemSync(USERNAME, name);

// Expiry reminders are on by default (section 16).
export const getRemindersEnabled = (): boolean => Storage.getItemSync('reminders_enabled') !== '0';
export const setRemindersEnabled = (on: boolean): void => Storage.setItemSync('reminders_enabled', on ? '1' : '0');

// App language: 'system' follows the phone; else a language code the app ships.
export const getLanguageSetting = (): string => Storage.getItemSync('language') ?? 'system';
export const setLanguageSetting = (code: string): void => Storage.setItemSync('language', code);

// Which "What's new" notes were last shown (whatsNew.ts).
export const getSeenWhatsNew = (): string | null => Storage.getItemSync('seen_whats_new');
export const setSeenWhatsNew = (id: string): void => Storage.setItemSync('seen_whats_new', id);

// The day "Later" was tapped on the home update card (updateCard.ts).
export const getUpdateLater = (): string | null => Storage.getItemSync('update_later');
export const setUpdateLater = (day: string): void => Storage.setItemSync('update_later', day);

// Theme: 'system' follows the phone, else 'light' or 'dark'.
export const getThemeSetting = (): string => Storage.getItemSync('theme') ?? 'system';
export const setThemeSetting = (theme: string): void => Storage.setItemSync('theme', theme);

// Reminder time of day (hour) and which reminders (groups from warranty.ts), section 16.
// Minutes after midnight (9:00 = 540). Older installs saved only the hour.
export const getReminderTime = (): number => Number(Storage.getItemSync('reminder_time') ?? Number(Storage.getItemSync('reminder_hour') ?? 9) * 60);
export const setReminderTime = (minutes: number): void => Storage.setItemSync('reminder_time', String(minutes));
export const getReminderGroups = (): ReminderGroup[] => JSON.parse(Storage.getItemSync('reminder_groups') ?? 'null') ?? ALL_GROUPS;
export const setReminderGroups = (groups: ReminderGroup[]): void => Storage.setItemSync('reminder_groups', JSON.stringify(groups));

// Return-window reminders (EU 14-day withdrawal) are on by default.
export const getReturnRemindersEnabled = (): boolean => Storage.getItemSync('return_reminders') !== '0';
export const setReturnRemindersEnabled = (on: boolean): void => Storage.setItemSync('return_reminders', on ? '1' : '0');

// Widget (section 13): product names hidden by default while the app lock is on. null = follow that default.
export const getWidgetNames = (): boolean | null => {
  const v = Storage.getItemSync('widget_names');
  return v === null ? null : v === '1';
};
export const setWidgetNames = (on: boolean | null): void => void (on === null ? Storage.removeItemSync('widget_names') : Storage.setItemSync('widget_names', on ? '1' : '0'));

// Backup settings (section 17). The backup password's key lives in SecureStore, not here.
type SettingKey = 'backup_enabled' | 'backup_interval' | 'last_backup_at' | 'last_backup_error' | 'last_backup_error_at' | 'backup_account';
export const getSetting = (key: SettingKey): string | null => Storage.getItemSync(key);
export const setSetting = (key: SettingKey, value: string): void => Storage.setItemSync(key, value);
// What a backup carries besides the database.
export const settingsSnapshot = (): Record<string, string | null> => ({ username: Storage.getItemSync('username'), theme: Storage.getItemSync('theme'), language: Storage.getItemSync('language'), reminder_time: Storage.getItemSync('reminder_time'), reminder_groups: Storage.getItemSync('reminder_groups'), return_reminders: Storage.getItemSync('return_reminders'), reminders_enabled: Storage.getItemSync('reminders_enabled'), density: Storage.getItemSync('density'), list_sort: Storage.getItemSync('list_sort') });
export function applySnapshot(s: Record<string, string | null>): void {
  for (const [k, v] of Object.entries(s)) if (['username', 'theme', 'language', 'reminders_enabled', 'reminder_time', 'reminder_groups', 'return_reminders', 'density', 'list_sort'].includes(k) && v !== null) Storage.setItemSync(k, v);
}

// List density (shortlist): compact rows use less padding and one meta line; text size is never reduced.
export type Density = 'comfortable' | 'compact';
export const getDensity = (): Density => (Storage.getItemSync('density') === 'compact' ? 'compact' : 'comfortable');
export const setDensity = (d: Density): void => Storage.setItemSync('density', d);

// Home list order (src/listView.ts).
export const getListSort = (): string => Storage.getItemSync('list_sort') ?? 'expiry';
export const setListSort = (key: string): void => Storage.setItemSync('list_sort', key);

// Recently opened (src/recent.ts): this phone only, never backed up.
export const getRecentText = (): string | null => Storage.getItemSync('recent');
export const setRecentText = (text: string): void => Storage.setItemSync('recent', text);
export const clearRecent = (): void => void Storage.removeItemSync('recent');

// Per placed widget (src/widgetConfig.ts), keyed by Android's widget id.
export const getWidgetConfigText = (id: number): string | null => Storage.getItemSync(`widget:${id}`);
export const setWidgetConfigText = (id: number, text: string): void => Storage.setItemSync(`widget:${id}`, text);
export const removeWidgetConfig = (id: number): void => void Storage.removeItemSync(`widget:${id}`);
