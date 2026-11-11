// Web is only used for screen previews; expo-sqlite's sync API needs extra web setup.
export const getUsername = (): string | null => localStorage.getItem('username');
export const setUsername = (name: string): void => localStorage.setItem('username', name);
export const getRemindersEnabled = (): boolean => localStorage.getItem('reminders_enabled') !== '0';
export const setRemindersEnabled = (on: boolean): void => localStorage.setItem('reminders_enabled', on ? '1' : '0');

// Widget (section 13): product names hidden by default while the app lock is on. null = follow that default.
export const getWidgetNames = (): boolean | null => {
  const v = localStorage.getItem('widget_names');
  return v === null ? null : v === '1';
};
export const setWidgetNames = (on: boolean | null): void => (on === null ? localStorage.removeItem('widget_names') : localStorage.setItem('widget_names', on ? '1' : '0'));

// Backup settings (section 17). The backup password's key lives in SecureStore, not here.
export const getSetting = (key: 'backup_enabled' | 'backup_interval' | 'last_backup_at' | 'last_backup_error' | 'backup_account'): string | null => localStorage.getItem(key);
export const setSetting = (key: 'backup_enabled' | 'backup_interval' | 'last_backup_at' | 'last_backup_error' | 'backup_account', value: string): void => localStorage.setItem(key, value);
// What a backup carries besides the database.
export const settingsSnapshot = (): Record<string, string | null> => ({ username: localStorage.getItem('username'), reminders_enabled: localStorage.getItem('reminders_enabled') });
export function applySnapshot(s: Record<string, string | null>): void {
  for (const [k, v] of Object.entries(s)) if ((k === 'username' || k === 'reminders_enabled') && v !== null) localStorage.setItem(k, v);
}
