import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_LIMITS } from "../../domain";
import { createAccountIo } from "../../server/account-io";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { createFileLog, createFileVault, LOG_RETENTION_MS } from "./file-stores";
import { createMemoryAccountStore } from "./memory-accounts";

const T0 = new Date("2026-10-24T10:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);
const dirs: string[] = [];
const file = (name: string) => {
  const dir = mkdtempSync(join(tmpdir(), "asv-"));
  dirs.push(dir);
  return join(dir, "nested", name);
};
const lines = (path: string) =>
  readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((text) => JSON.parse(text) as Record<string, unknown>);

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("createFileLog (BR-084)", () => {
  it("appends open, contribution and close lines in order, readable by the owner only", async () => {
    const path = file("log.jsonl");
    mkdirSync(dirname(path), { recursive: true, mode: 0o755 });
    writeFileSync(path, "", { mode: 0o644 });
    chmodSync(path, 0o644);
    const log = createFileLog(path, T0);
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(path)).mode & 0o777).toBe(0o700);

    await log.open({ connectionId: "c1", ip: "203.0.113.7", protocols: "HTTP/1.1 WebSocket", pseudo: "Lola", openedAt: T0 });
    await log.appendContribution({ connectionId: "c1", protocols: "HTTP/1.1 WebSocket", at: after(1000) });
    await log.close("c1", after(2000));

    expect(lines(path).map((line) => line.kind)).toEqual(["open", "contribution", "close"]);
    expect(lines(path)[0]).toMatchObject({ ip: "203.0.113.7", pseudo: "Lola" });
    expect(JSON.stringify(lines(path))).not.toContain("content");
  });

  it("purges connections opened and contributions dated over 1 year ago, keeps the rest", async () => {
    const path = file("log.jsonl");
    const log = createFileLog(path, T0);
    await log.open({ connectionId: "old", ip: "a", protocols: "p", pseudo: "A", openedAt: T0 });
    await log.close("old", after(1000));
    await log.appendContribution({ connectionId: "old", protocols: "p", at: after(1000) });
    await log.open({ connectionId: "new", ip: "b", protocols: "p", pseudo: "B", openedAt: after(DAY) });

    log.purge(after(LOG_RETENTION_MS + 2000));

    expect(lines(path).map((line) => line.connectionId)).toEqual(["new"]);
  });
});

const DAY = 24 * 60 * 60_000;
const opening = { accountId: "acc1", sealedEmail: "e1.sealed", createdAt: T0 };

describe("crash safety (BR-084)", () => {
  it("closes at start-up the connections a previous process left open", async () => {
    const path = file("log.jsonl");
    const first = createFileLog(path, T0);
    await first.open({ connectionId: "c1", ip: "a", protocols: "p", pseudo: "A", openedAt: T0 });

    createFileLog(path, after(DAY));

    expect(lines(path).at(-1)).toEqual({ kind: "close", connectionId: "c1", at: after(DAY).toISOString() });
  });

  it("keeps a cut-off line and lines with unreadable dates through start-up and purge", async () => {
    const path = file("vault.jsonl");
    createFileVault(path, T0);
    appendFileSync(path, '{"kind":"close","accountId":"bad","closedAt":"not a date"}\n{"kind":"open","accou');
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const vault = createFileVault(path, after(1000));
    vault.purge(after(ACCOUNT_LIMITS.vaultRetentionMs * 2));

    const text = readFileSync(path, "utf8");
    expect(text).toContain('"accountId":"bad"');
    expect(text).toContain('{"kind":"open","accou');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("ends a line cut by a crash so the start-up close record stays readable", () => {
    const path = file("log.jsonl");
    createFileLog(path, T0);
    appendFileSync(path, '{"kind":"open","connectionId":"c1","openedAt":"2026-10-24T00:00:00.000Z"}\n{"kind":"op');
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createFileLog(path, after(1000));

    const lines = readFileSync(path, "utf8").trimEnd().split("\n");
    expect(lines[1]).toBe('{"kind":"op');
    expect(JSON.parse(lines[2] ?? "")).toMatchObject({ kind: "close", connectionId: "c1" });
    warn.mockRestore();
  });

  it("keeps log lines with unreadable dates", () => {
    const path = file("log.jsonl");
    const log = createFileLog(path, T0);
    appendFileSync(path, '{"kind":"contribution","connectionId":"x","at":"??"}\n');

    log.purge(after(LOG_RETENTION_MS * 2));

    expect(lines(path)).toEqual([{ kind: "contribution", connectionId: "x", at: "??" }]);
  });
});

describe("createFileVault (BR-084, BR-081)", () => {
  it("closes at start-up every account a previous process left open", async () => {
    const path = file("vault.jsonl");
    const first = createFileVault(path, T0);
    await first.opened?.(opening);
    await first.opened?.({ ...opening, accountId: "acc2" });
    await first.record({ ...opening, accountId: "acc2", closedAt: after(1000) });

    createFileVault(path, after(DAY));

    const closes = lines(path).filter((line) => line.kind === "close");
    expect(closes).toEqual([
      { kind: "close", accountId: "acc2", sealedEmail: "e1.sealed", createdAt: T0.toISOString(), closedAt: after(1000).toISOString() },
      { kind: "close", accountId: "acc1", sealedEmail: "e1.sealed", createdAt: T0.toISOString(), closedAt: after(DAY).toISOString() },
    ]);
  });

  it("drops redundant openings, blanks the id after 1 year and drops the record after 5 years", async () => {
    const path = file("vault.jsonl");
    const vault = createFileVault(path, T0);
    await vault.opened?.(opening);
    await vault.record({ ...opening, closedAt: T0 });
    await vault.opened?.({ ...opening, accountId: "live" });

    vault.purge(after(ACCOUNT_LIMITS.vaultIdentityMs));
    expect(lines(path)).toEqual([
      { kind: "close", accountId: "", sealedEmail: "e1.sealed", createdAt: T0.toISOString(), closedAt: T0.toISOString() },
      { kind: "open", accountId: "live", sealedEmail: "e1.sealed", createdAt: T0.toISOString() },
    ]);

    vault.purge(after(ACCOUNT_LIMITS.vaultRetentionMs));
    expect(lines(path).map((line) => line.accountId)).toEqual(["live"]);
  });

  it("leaves the purge to the transport's daily timer, not the hub tick", async () => {
    const path = file("vault.jsonl");
    const vault = createFileVault(path, T0);
    await vault.record({ ...opening, closedAt: T0 });

    await vault.purgeExpired(after(ACCOUNT_LIMITS.vaultRetentionMs));

    expect(lines(path)).toHaveLength(1);
  });
});

describe("account opening record (BR-084)", () => {
  const setup = async () => {
    const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
    const opened = vi.fn(() => Promise.resolve());
    const io = createAccountIo({ store: createMemoryAccountStore(), vault: { record: () => Promise.resolve(), purgeExpired: () => Promise.resolve(), opened }, crypto });
    const account = { id: "acc1", email: "nath@example.org", verifiedAt: T0, lastSeenAt: T0, strikes: [] };
    return { io, opened, account };
  };

  it("tells the vault about a created account with the e-mail sealed", async () => {
    const { io, opened, account } = await setup();

    await io.saveAccount(account, "hash", true);

    expect(opened).toHaveBeenCalledWith({ accountId: "acc1", sealedEmail: expect.not.stringContaining("nath"), createdAt: T0 });
  });

  it("saves no account when its opening record fails", async () => {
    const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
    const store = createMemoryAccountStore();
    const io = createAccountIo({ store, vault: { record: () => Promise.resolve(), purgeExpired: () => Promise.resolve(), opened: () => Promise.reject(new Error("disk full")) }, crypto });

    await expect(io.saveAccount({ id: "acc1", email: "nath@example.org", verifiedAt: T0, lastSeenAt: T0, strikes: [] }, "hash", true)).rejects.toThrow("disk full");

    expect(await store.findAccountById("acc1")).toBeUndefined();
  });

  it("says nothing when an existing account is saved again", async () => {
    const { io, opened, account } = await setup();

    await io.saveAccount(account, "hash", false);

    expect(opened).not.toHaveBeenCalled();
  });
});
