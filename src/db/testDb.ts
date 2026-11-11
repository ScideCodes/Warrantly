import { DatabaseSync } from 'node:sqlite';
import type { Db } from './repo.ts';

// Same SQL as on the phone, run on Node's built-in SQLite.
export function nodeDb(): Db & { raw: DatabaseSync } {
  const d = new DatabaseSync(':memory:');
  return {
    raw: d,
    execAsync: async (sql) => void d.exec(sql),
    runAsync: async (sql, p) => {
      const r = d.prepare(sql).run(...p);
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getAllAsync: async <T,>(sql: string, p: (string | number | null)[]) => d.prepare(sql).all(...p) as T[],
    getFirstAsync: async <T,>(sql: string, p: (string | number | null)[]) => (d.prepare(sql).get(...p) ?? null) as T | null,
    withTransactionAsync: async (task) => {
      d.exec('BEGIN');
      try {
        await task();
        d.exec('COMMIT');
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
