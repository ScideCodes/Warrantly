import Storage from 'expo-sqlite/kv-store';

// Local-only settings (brainstorm section 12 "settings"), stored in SQLite on the phone.
const USERNAME = 'username';

export const getUsername = (): string | null => Storage.getItemSync(USERNAME);
export const setUsername = (name: string): void => Storage.setItemSync(USERNAME, name);

// Expiry reminders are on by default (section 16).
export const getRemindersEnabled = (): boolean => Storage.getItemSync('reminders_enabled') !== '0';
export const setRemindersEnabled = (on: boolean): void => Storage.setItemSync('reminders_enabled', on ? '1' : '0');

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
export const settingsSnapshot = (): Record<string, string | null> => ({ username: Storage.getItemSync('username'), reminders_enabled: Storage.getItemSync('reminders_enabled') });
export function applySnapshot(s: Record<string, string | null>): void {
  for (const [k, v] of Object.entries(s)) if ((k === 'username' || k === 'reminders_enabled') && v !== null) Storage.setItemSync(k, v);
}
