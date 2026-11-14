/**
 * Test double of the Durable Object storage on Node's `node:sqlite` (tests only, never bundled): same SQL
 * dialect as the Durable Object SQLite, with `transactionSync` on BEGIN, COMMIT and ROLLBACK.
 */
import { DatabaseSync } from "node:sqlite";
import type { SqlStorage, SqlValue } from "./sql";

export const createTestStorage = (): SqlStorage & { readonly db: DatabaseSync } => {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec: (query: string, ...bindings: SqlValue[]) => {
        const statement = db.prepare(query);
        const result = statement.columns().length > 0 ? statement.all(...bindings) : (statement.run(...bindings), []);
        return { toArray: () => result as Record<string, unknown>[] };
      },
    },
    transactionSync<T>(closure: () => T): T {
      db.exec("BEGIN");
      try {
        const value = closure();
        db.exec("COMMIT");
        return value;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
};
