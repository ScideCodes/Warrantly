import type { Account, Db } from '@/db/repo.ts';

// Web is only used for screen previews; backups need the phone's crypto and Google sign-in.
export const hasBackupPassword = (): boolean => false;
export const setBackupPassword = async (_password: string): Promise<void> => {};
export const runBackup = async (_db: Db, _interactive: boolean): Promise<void> => {};
export const runDueBackup = async (_db: Db): Promise<void> => {};
export const latestBackup = async (): Promise<{ id: string; createdTime: string } | null> => null;
export class PasswordNeededError extends Error {}
export const restoreBackup = async (_db: Db, _id: string, _password: string | null): Promise<void> => {};
export const disconnectAccount = async (_db: Db, _account: Account): Promise<void> => {};
export const disconnectBackupDate = async (_db: Db, _email: string): Promise<string | null> => null;
export const restoreDisconnected = async (_db: Db, _account: Account): Promise<void> => {};
export const deleteDriveBackups = async (): Promise<void> => {};
