/** Ignore lists of the hub state (UC8, BR-042), shared by rooms, private conversations and search. */

/** Session id → the session ids it ignores. */
export type IgnoreLists = ReadonlyMap<string, readonly string[]>;

/** BR-042: either session ignores the other, so neither sees the other's messages. */
export const blocks = (ignores: IgnoreLists, a: string, b: string): boolean =>
  (ignores.get(a)?.includes(b) ?? false) || (ignores.get(b)?.includes(a) ?? false);
