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

// Reminder time of day (hour) and which reminders (groups from warranty.ts), section 16.
export const getReminderHour = (): number => Number(Storage.getItemSync('reminder_hour') ?? 9);
export const setReminderHour = (hour: number): void => Storage.setItemSync('reminder_hour', String(hour));
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
export const getSetting = (key: 'backup_enabled' | 'backup_interval' | 'last_backup_at' | 'last_backup_error' | 'backup_account'): string | null => Storage.getItemSync(key);
export const setSetting = (key: 'backup_enabled' | 'backup_interval' | 'last_backup_at' | 'last_backup_error' | 'backup_account', value: string): void => Storage.setItemSync(key, value);
// What a backup carries besides the database.
export const settingsSnapshot = (): Record<string, string | null> => ({ username: Storage.getItemSync('username'), language: Storage.getItemSync('language'), reminder_hour: Storage.getItemSync('reminder_hour'), reminder_groups: Storage.getItemSync('reminder_groups'), return_reminders: Storage.getItemSync('return_reminders'), reminders_enabled: Storage.getItemSync('reminders_enabled') });
export function applySnapshot(s: Record<string, string | null>): void {
  for (const [k, v] of Object.entries(s)) if (['username', 'language', 'reminders_enabled', 'reminder_hour', 'reminder_groups', 'return_reminders'].includes(k) && v !== null) Storage.setItemSync(k, v);
}
