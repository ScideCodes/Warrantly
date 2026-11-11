import { openDatabaseAsync } from 'expo-sqlite';
import { migrate, type Db } from './repo.ts';

let db: Promise<Db> | null = null;

// One connection for the app, migrated on first use.
export function getDb(): Promise<Db> {
  db ??= openDatabaseAsync('warrantly.db').then(async (conn) => {
    await migrate(conn);
    return conn;
  });
  return db;
}
