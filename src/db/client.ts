import { openDatabaseAsync } from 'expo-sqlite';
import { migrate, type Db } from './repo.ts';

let db: Promise<Db> | null = null;

// One connection for the app, migrated on first use.
export function getDb(): Promise<Db> {
  db ??= openDatabaseAsync('warrantly.db').then(async (conn) => {
    // One connection cannot nest transactions: a delete tapped while a sync is saving a mail would fail
    // with "cannot start a transaction within a transaction". So transactions wait for each other.
    let queue: Promise<unknown> = Promise.resolve();
    const serial: Db = {
      execAsync: (sql) => conn.execAsync(sql),
      runAsync: (sql, params) => conn.runAsync(sql, params),
      getAllAsync: (sql, params) => conn.getAllAsync(sql, params),
      getFirstAsync: (sql, params) => conn.getFirstAsync(sql, params),
      withTransactionAsync(task) {
        const run = queue.then(() => conn.withTransactionAsync(task));
        queue = run.catch(() => {});
        return run;
      },
    };
    await migrate(serial);
    return serial;
  });
  return db;
}
