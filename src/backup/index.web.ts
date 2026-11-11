import type { Db } from '@/db/repo.ts';

// Web is only used for screen previews; backups need the phone's crypto and Google sign-in.
export const hasBackupPassword = (): boolean => false;
export const setBackupPassword = async (_password: string): Promise<void> => {};
export const runBackup = async (_db: Db, _interactive: boolean): Promise<void> => {};
export const runDueBackup = async (_db: Db): Promise<void> => {};
export const latestBackup = async (): Promise<{ id: string; createdTime: string } | null> => null;
export class PasswordNeededError extends Error {}
export const restoreBackup = async (_db: Db, _id: string, _password: string | null): Promise<void> => {};
