/**
 * File-backed connection log and legal vault for the tester exposure (ADR-0018, BR-084, `platform/04c`).
 * One JSON object per line, appended synchronously so lines keep their order and survive a crash. A purge
 * rewrites through a temporary file and a rename, so an interrupted purge never truncates legal data.
 */
import { appendFileSync, chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname } from "node:path";
import { ACCOUNT_LIMITS, type ConnectionLogStore, type LegalVaultStore, type VaultEntry, type VaultOpening } from "../../domain";

/** Connection and contribution lines are kept 1 year (BR-060). */
export const LOG_RETENTION_MS = 365 * 24 * 60 * 60_000;

/** A parsed line, or the raw text of a line that does not parse (a write cut by a crash): kept as is. */
type Line = { readonly parsed: Record<string, unknown>; readonly raw?: undefined } | { readonly parsed?: undefined; readonly raw: string };

const serialise = (line: Record<string, unknown>) => `${JSON.stringify(line)}\n`;

const append = (path: string, line: Record<string, unknown>) => appendFileSync(path, serialise(line), { mode: 0o600 });

const parse = (text: string): Line => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return { parsed: parsed as Record<string, unknown> };
  } catch {
    // Falls through: kept raw below.
  }
  console.warn("legal file: unreadable line kept as is");
  return { raw: text };
};

const readLines = (path: string): Line[] =>
  existsSync(path)
    ? readFileSync(path, "utf8")
        .split("\n")
        .filter((text) => text.length > 0)
        .map(parse)
    : [];

/** Writes `${path}.tmp`, syncs it, then renames it over `path` in one step. */
const rewrite = (path: string, lines: readonly Line[]) => {
  const temporary = `${path}.tmp`;
  const fd = openSync(temporary, "w", 0o600);
  try {
    writeSync(fd, lines.map((line) => (line.parsed ? serialise(line.parsed) : `${line.raw}\n`)).join(""));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
};

/** Milliseconds of a date field; `undefined` when unreadable, so the caller keeps the line. */
const time = (value: unknown): number | undefined => {
  const at = new Date(String(value)).getTime();
  return Number.isNaN(at) ? undefined : at;
};

/** Creates the folder (0700) and file (0600), and tightens them when they already exist. */
const prepare = (path: string) => {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  if (!existsSync(path)) appendFileSync(path, "", { mode: 0o600 });
  chmodSync(path, 0o600);
};

/** The `open` lines that have no `close` line, matched on the given id field. */
const leftOpen = (lines: readonly Line[], key: string) => {
  const closed = new Set(lines.filter((line) => line.parsed?.kind === "close").map((line) => line.parsed?.[key]));
  return lines.flatMap((line) => (line.parsed?.kind === "open" && !closed.has(line.parsed[key]) ? [line.parsed] : []));
};

/**
 * Connection log in a JSONL file: `open`, `close` and `contribution` lines (BR-060, BR-084). At start-up,
 * connections a previous process left open (stop or crash) get a `close` line dated at that start-up.
 */
export const createFileLog = (path: string, startedAt: Date): ConnectionLogStore & { purge(now: Date): void } => {
  prepare(path);
  for (const line of leftOpen(readLines(path), "connectionId")) append(path, { kind: "close", connectionId: line.connectionId, at: startedAt });
  return {
    open: async (line) => append(path, { kind: "open", ...line }),
    close: async (connectionId, at) => append(path, { kind: "close", connectionId, at }),
    appendContribution: async (line) => append(path, { kind: "contribution", ...line }),
    /** Drops every line of a connection opened over 1 year ago, and contributions dated over 1 year ago. */
    purge(now) {
      const limit = now.getTime() - LOG_RETENTION_MS;
      const lines = readLines(path);
      // An unreadable date keeps the line: never lose legal data on a bad line.
      const old = (value: unknown) => (time(value) ?? Infinity) <= limit;
      const expired = new Set(
        lines.filter((line) => line.parsed?.kind === "open" && old(line.parsed.openedAt)).map((line) => line.parsed?.connectionId),
      );
      rewrite(
        path,
        lines.filter(({ parsed }) => !parsed || (parsed.kind === "contribution" ? !old(parsed.at) : !expired.has(parsed.connectionId))),
      );
    },
  };
};

/**
 * Legal vault in a JSONL file (BR-081, BR-084): an `open` line when an account is created and a `close`
 * line when it is deleted, both with the e-mail sealed to the owner key. At start-up, accounts left open by
 * a previous process (stop or crash) are closed, since in-memory accounts died with it.
 */
export const createFileVault = (path: string, startedAt: Date): LegalVaultStore & { purge(now: Date): void } => {
  prepare(path);
  for (const line of leftOpen(readLines(path), "accountId")) append(path, { ...line, kind: "close", closedAt: startedAt });
  const purge = (now: Date) => {
    const at = now.getTime();
    const lines = readLines(path);
    const done = new Set(lines.filter((line) => line.parsed?.kind === "close").map((line) => line.parsed?.accountId));
    // An unreadable closing date counts as closed now, so the record is kept.
    const closedFor = (parsed: Record<string, unknown>) => at - (time(parsed.closedAt) ?? at);
    rewrite(
      path,
      lines
        // An `open` line is redundant once its `close` line exists.
        .filter(({ parsed }) => !parsed || (parsed.kind === "open" ? !done.has(parsed.accountId) : closedFor(parsed) < ACCOUNT_LIMITS.vaultRetentionMs))
        .map((line) =>
          line.parsed?.kind === "close" && closedFor(line.parsed) >= ACCOUNT_LIMITS.vaultIdentityMs ? { parsed: { ...line.parsed, accountId: "" } } : line,
        ),
    );
  };
  return {
    opened: async (entry: VaultOpening) => append(path, { kind: "open", ...entry }),
    record: async (entry: VaultEntry) => append(path, { kind: "close", ...entry }),
    // The hub calls this every tick; the transport runs `purge` at start-up and once a day instead (BR-084).
    purgeExpired: () => Promise.resolve(),
    purge,
  };
};
