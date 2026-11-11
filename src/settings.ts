import Storage from 'expo-sqlite/kv-store';

// Local-only settings (brainstorm section 12 "settings"), stored in SQLite on the phone.
const USERNAME = 'username';

export const getUsername = (): string | null => Storage.getItemSync(USERNAME);
export const setUsername = (name: string): void => Storage.setItemSync(USERNAME, name);

// Expiry reminders are on by default (section 16).
export const getRemindersEnabled = (): boolean => Storage.getItemSync('reminders_enabled') !== '0';
export const setRemindersEnabled = (on: boolean): void => Storage.setItemSync('reminders_enabled', on ? '1' : '0');
