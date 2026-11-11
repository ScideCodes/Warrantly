import Storage from 'expo-sqlite/kv-store';

// Local-only settings (brainstorm section 12 "settings"), stored in SQLite on the phone.
const USERNAME = 'username';

export const getUsername = (): string | null => Storage.getItemSync(USERNAME);
export const setUsername = (name: string): void => Storage.setItemSync(USERNAME, name);
