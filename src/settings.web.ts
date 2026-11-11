// Web is only used for screen previews; expo-sqlite's sync API needs extra web setup.
export const getUsername = (): string | null => localStorage.getItem('username');
export const setUsername = (name: string): void => localStorage.setItem('username', name);
