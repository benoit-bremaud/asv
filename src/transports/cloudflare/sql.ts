/**
 * The part of the Durable Object storage the SQLite stores use (`platform/09`): `ctx.storage.sql.exec` and
 * `ctx.storage.transactionSync`. Kept this small so the stores run in Node tests on `node:sqlite`.
 */

/** A bound value or a column value; the stores never use blobs. */
export type SqlValue = string | number | null;

/** A row as `exec` returns it. */
export type SqlRow = Record<string, unknown>;

/** The cursor of one statement; only `toArray` is used. */
export interface SqlCursor {
  toArray(): SqlRow[];
}

/** `ctx.storage` of a SQLite-backed Durable Object, reduced to what the stores call. */
export interface SqlStorage {
  readonly sql: { exec(query: string, ...bindings: SqlValue[]): SqlCursor };
  /** Runs `closure` in one transaction; a throw rolls every write back. */
  transactionSync<T>(closure: () => T): T;
}

/** Rows of one statement. */
export const rows = (storage: SqlStorage, query: string, ...bindings: SqlValue[]): SqlRow[] =>
  storage.sql.exec(query, ...bindings).toArray();

/** Runs a statement for its effect. */
export const run = (storage: SqlStorage, query: string, ...bindings: SqlValue[]): void => {
  storage.sql.exec(query, ...bindings).toArray();
};

/** The first row, or `undefined`. */
export const first = (storage: SqlStorage, query: string, ...bindings: SqlValue[]): SqlRow | undefined =>
  rows(storage, query, ...bindings)[0];

/** A text column; `undefined` for NULL. */
export const text = (row: SqlRow, column: string): string | undefined => {
  const value = row[column];
  return typeof value === "string" ? value : undefined;
};

/** An integer column (epoch milliseconds, counters); `undefined` for NULL. */
export const int = (row: SqlRow, column: string): number | undefined => {
  const value = row[column];
  if (typeof value === "bigint") return Number(value);
  return typeof value === "number" ? value : undefined;
};

/** A NOT NULL text column. @throws when the row does not match the schema. */
export const textOf = (row: SqlRow, column: string): string => {
  const value = text(row, column);
  if (value === undefined) throw new Error(`column ${column} is not text`);
  return value;
};

/** A NOT NULL date column. @throws when the row does not match the schema. */
export const dateOf = (row: SqlRow, column: string): Date => {
  const value = int(row, column);
  if (value === undefined) throw new Error(`column ${column} is not a date`);
  return new Date(value);
};

/** A nullable date column. */
export const optionalDate = (row: SqlRow, column: string): Date | undefined => {
  const value = int(row, column);
  return value === undefined ? undefined : new Date(value);
};
