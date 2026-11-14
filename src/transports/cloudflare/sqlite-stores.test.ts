import { describe, expect, it } from "vitest";
import { ACCOUNT_LIMITS, MODERATION_LIMITS, type StoredAccount, type StoredModerator, type StoredReport } from "../../domain";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { MAIL_GIVE_UP_MS } from "../../server/moderation-mail";
import { createModerationIo } from "../../server/moderation-io";
import { rows } from "./sql";
import {
  closeOpenLines,
  createSqlAccountStore,
  createSqlLog,
  createSqlModerationStore,
  createSqlModeratorStore,
  createSqlVault,
  hasPendingMail,
  LOG_RETENTION_MS,
  migrate,
  MIGRATIONS,
  readMeta,
  writeMeta,
} from "./sqlite-stores";
import { createTestStorage } from "./test-sqlite";

const T0 = new Date("2026-11-14T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const DAY = 24 * 60 * 60_000;

const storage = () => {
  const store = createTestStorage();
  migrate(store);
  return store;
};

const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));

/** Every text value of every table, to check no clear personal value is stored. */
const allText = (store: ReturnType<typeof storage>) =>
  rows(store, "SELECT name FROM sqlite_master WHERE type = 'table'")
    .flatMap((table) => rows(store, `SELECT * FROM ${String(table.name)}`))
    .flatMap((row) => Object.values(row))
    .filter((value): value is string => typeof value === "string")
    .join("\n");

describe("migrate (platform/10: additive)", () => {
  it("creates every table of platform/09 once and records the version", () => {
    const store = createTestStorage();

    expect(migrate(store)).toBe(MIGRATIONS.length);
    expect(migrate(store)).toBe(MIGRATIONS.length);

    const tables = rows(store, "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((row) => row.name);
    expect(tables).toEqual([
      "accounts", "alerts", "bans", "carry_overs", "code_events", "codes", "connection_lines", "contribution_lines", "devices",
      "email_blocks", "invitations", "meta", "moderators", "pending_mails", "pending_statements", "reports", "vault",
    ]);
    expect(readMeta(store, "schema")).toBe(String(MIGRATIONS.length));
  });

  it("never stores gender, age or city (personal data invariant)", () => {
    const store = storage();
    const columns = rows(store, "SELECT name FROM sqlite_master WHERE type = 'table'").flatMap((table) =>
      rows(store, `PRAGMA table_info(${String(table.name)})`).map((column) => String(column.name)));

    expect(columns.filter((name) => /gender|age$|city/.test(name))).toEqual([]);
  });

  it("rolls a failed step back entirely", () => {
    const store = createTestStorage();
    store.transactionSync(() => store.sql.exec("CREATE TABLE accounts (id TEXT)"));

    expect(() => migrate(store)).toThrow();
    expect(rows(store, "SELECT name FROM sqlite_master WHERE name = 'codes'")).toEqual([]);
    expect(readMeta(store, "schema")).toBeUndefined();
  });

  it("keeps meta values", () => {
    const store = storage();
    writeMeta(store, "lastPurgeAt", "42");
    writeMeta(store, "lastPurgeAt", "43");
    expect(readMeta(store, "lastPurgeAt")).toBe("43");
  });
});

describe("connection log (BR-060, BR-109)", () => {
  it("encrypts IP, port, pseudo and account id, and keeps dates and protocols clear", async () => {
    const store = storage();
    const log = createSqlLog(store, crypto);

    await log.open({ connectionId: "c1", ip: "203.0.113.7", port: 4242, protocols: "HTTP/1.1 WebSocket", pseudo: "Lola", accountId: "acc-1", openedAt: T0 });
    await log.appendContribution({ connectionId: "c1", protocols: "HTTP/1.1 WebSocket", at: at(1000) });
    await log.close("c1", at(2000));

    const [line] = rows(store, "SELECT * FROM connection_lines");
    expect(line).toMatchObject({ connection_id: "c1", protocols: "HTTP/1.1 WebSocket", opened_at: T0.getTime(), closed_at: at(2000).getTime() });
    expect(JSON.parse(await crypto.decrypt(String(line?.sealed), "connection:c1"))).toEqual({ ip: "203.0.113.7", port: 4242, pseudo: "Lola", accountId: "acc-1" });
    expect(allText(store)).not.toMatch(/203\.0\.113\.7|Lola|acc-1/);
    expect(rows(store, "SELECT connection_id, at FROM contribution_lines")).toEqual([{ connection_id: "c1", at: at(1000).getTime() }]);
  });

  it("keeps the first close date", async () => {
    const store = storage();
    const log = createSqlLog(store, crypto);
    await log.open({ connectionId: "c1", ip: "::1", protocols: "p", pseudo: "A", openedAt: T0 });
    await log.close("c1", at(1));
    await log.close("c1", at(2));

    expect(rows(store, "SELECT closed_at FROM connection_lines")).toEqual([{ closed_at: at(1).getTime() }]);
  });

  it("closes every line left open at start time, and only those", async () => {
    const store = storage();
    const log = createSqlLog(store, crypto);
    await log.open({ connectionId: "open", ip: "::1", protocols: "p", pseudo: "A", openedAt: T0 });
    await log.open({ connectionId: "done", ip: "::1", protocols: "p", pseudo: "B", openedAt: T0 });
    await log.close("done", at(5));

    closeOpenLines(store, at(60_000));

    expect(rows(store, "SELECT connection_id, closed_at FROM connection_lines ORDER BY connection_id")).toEqual([
      { connection_id: "done", closed_at: at(5).getTime() },
      { connection_id: "open", closed_at: at(60_000).getTime() },
    ]);
  });

  it("purges lines older than one year, keeps younger ones", async () => {
    const store = storage();
    const log = createSqlLog(store, crypto);
    await log.open({ connectionId: "old", ip: "::1", protocols: "p", pseudo: "A", openedAt: T0 });
    await log.appendContribution({ connectionId: "old", protocols: "p", at: T0 });
    await log.open({ connectionId: "new", ip: "::1", protocols: "p", pseudo: "B", openedAt: at(DAY) });
    await log.appendContribution({ connectionId: "new", protocols: "p", at: at(DAY) });

    await log.purge(at(LOG_RETENTION_MS));

    expect(rows(store, "SELECT connection_id FROM connection_lines")).toEqual([{ connection_id: "new" }]);
    expect(rows(store, "SELECT connection_id FROM contribution_lines")).toEqual([{ connection_id: "new" }]);
  });
});

const account = (overrides: Partial<StoredAccount> = {}): StoredAccount => ({
  id: "acc-1",
  email: "v1.cipher.text",
  emailKeyedHash: "email-hash",
  verifiedAt: T0,
  lastSeenAt: at(1000),
  strikes: [{ expiresAt: at(30 * DAY) }],
  ...overrides,
});

describe("account store (accounts/04)", () => {
  it("saves, finds and deletes an account with its strikes", async () => {
    const accounts = createSqlAccountStore(storage());
    await accounts.saveAccount(account());

    expect(await accounts.findAccountById("acc-1")).toEqual(account());
    expect(await accounts.findAccountByEmailHash("email-hash")).toEqual(account());
    await accounts.saveAccount(account({ strikes: [] }));
    expect((await accounts.findAccountById("acc-1"))?.strikes).toEqual([]);
    await accounts.deleteAccount("acc-1");
    expect(await accounts.findAccountById("acc-1")).toBeUndefined();
    expect(await accounts.findAccountByEmailHash("email-hash")).toBeUndefined();
  });

  it("keeps codes until deleted", async () => {
    const accounts = createSqlAccountStore(storage());
    const code = { sessionId: "s1", codeHash: "h", email: "v1.x.y", emailKeyedHash: "e", remember: true, triesLeft: 3, expiresAt: at(600_000) };
    await accounts.saveCode(code);
    await accounts.saveCode({ ...code, sessionId: "s2", remember: false });

    expect(await accounts.loadCode("s1")).toEqual(code);
    expect((await accounts.loadCode("s2"))?.remember).toBe(false);
    await accounts.deleteCode("s1");
    expect(await accounts.loadCode("s1")).toBeUndefined();
  });

  it("counts codes per e-mail and per IP over the quota window, and wrong tries over theirs", async () => {
    const accounts = createSqlAccountStore(storage());
    await accounts.recordCodeIssued("e", "ip", T0);
    await accounts.recordCodeIssued("e", "other-ip", at(1000));
    await accounts.recordCodeIssued("other-e", "ip", at(2000));
    await accounts.recordWrongTry("e", at(3000));

    expect(await accounts.codeCounts("e", "ip", at(5000))).toEqual({ email: 2, ip: 2, lastEmailCodeAt: at(1000), wrongTries: 1 });
    const late = at(ACCOUNT_LIMITS.quotaWindowMs + 1500);
    expect(await accounts.codeCounts("e", "ip", late)).toMatchObject({ email: 0, ip: 1, lastEmailCodeAt: undefined });
    expect((await accounts.codeCounts("e", "ip", at(ACCOUNT_LIMITS.wrongTryWindowMs + 3000))).wrongTries).toBe(0);
  });

  it("finds an account by an unexpired device only", async () => {
    const accounts = createSqlAccountStore(storage());
    await accounts.saveAccount(account());
    await accounts.saveDevice({ tokenHash: "d1", accountId: "acc-1", expiresAt: at(DAY) });
    await accounts.saveDevice({ tokenHash: "d2", accountId: "acc-1", expiresAt: at(DAY) });

    expect(await accounts.accountForDevice("d1", T0)).toEqual(account());
    expect(await accounts.accountForDevice("d1", at(DAY))).toBeUndefined();
    await accounts.deleteDevice("d1");
    expect(await accounts.accountForDevice("d1", T0)).toBeUndefined();
    await accounts.deleteAllDevices("acc-1");
    expect(await accounts.accountForDevice("d2", T0)).toBeUndefined();
  });

  it("blocks an e-mail until a date, and keeps carry-overs", async () => {
    const accounts = createSqlAccountStore(storage());
    await accounts.blockEmail("e", at(DAY));
    await accounts.saveCarryOver("e", [at(DAY), at(2 * DAY)]);

    expect(await accounts.isBlocked("e", T0)).toBe(true);
    expect(await accounts.isBlocked("e", at(DAY))).toBe(false);
    expect(await accounts.isBlocked("other", T0)).toBe(false);
    expect(await accounts.loadCarryOver("e")).toEqual([at(DAY), at(2 * DAY)]);
    await accounts.deleteCarryOver("e");
    expect(await accounts.loadCarryOver("e")).toBeUndefined();
  });

  it("purges expired codes, devices, blocks, carry-overs and old code events", async () => {
    const store = storage();
    const accounts = createSqlAccountStore(store);
    await accounts.saveAccount(account());
    await accounts.saveCode({ sessionId: "s1", codeHash: "h", email: "x", emailKeyedHash: "e", remember: false, triesLeft: 3, expiresAt: at(1) });
    await accounts.saveDevice({ tokenHash: "d1", accountId: "acc-1", expiresAt: at(1) });
    await accounts.saveDevice({ tokenHash: "d2", accountId: "acc-1", expiresAt: at(10 * DAY) });
    await accounts.blockEmail("e", at(1));
    await accounts.saveCarryOver("gone", [at(1)]);
    await accounts.saveCarryOver("kept", [at(1), at(10 * DAY)]);
    await accounts.recordCodeIssued("e", "ip", T0);
    await accounts.recordWrongTry("e", T0);

    await accounts.purgeExpired(at(ACCOUNT_LIMITS.quotaWindowMs + ACCOUNT_LIMITS.wrongTryWindowMs));

    expect(rows(store, "SELECT session_id FROM codes")).toEqual([]);
    expect(rows(store, "SELECT token_hash FROM devices")).toEqual([{ token_hash: "d2" }]);
    expect(rows(store, "SELECT * FROM email_blocks")).toEqual([]);
    expect(rows(store, "SELECT email_keyed_hash FROM carry_overs")).toEqual([{ email_keyed_hash: "kept" }]);
    expect(rows(store, "SELECT * FROM code_events")).toEqual([]);
  });
});

describe("legal vault (BR-081)", () => {
  it("drops the account id after 1 year and the row after 5", async () => {
    const store = storage();
    const vault = createSqlVault(store);
    await vault.record({ accountId: "acc-1", sealedEmail: "e1.sealed", createdAt: T0, closedAt: T0 });
    await vault.record({ accountId: "acc-2", sealedEmail: "e1.other", createdAt: T0, closedAt: at(ACCOUNT_LIMITS.vaultRetentionMs) });

    await vault.purgeExpired(at(ACCOUNT_LIMITS.vaultIdentityMs));
    expect(rows(store, "SELECT account_id FROM vault ORDER BY id")).toEqual([{ account_id: "" }, { account_id: "acc-2" }]);

    await vault.purgeExpired(at(ACCOUNT_LIMITS.vaultRetentionMs));
    expect(rows(store, "SELECT account_id, sealed_email FROM vault")).toEqual([{ account_id: "acc-2", sealed_email: "e1.other" }]);
  });
});

const report = (overrides: Partial<StoredReport> = {}): StoredReport => ({
  id: "r1",
  reason: "harassment",
  targetKind: "chatter",
  targetPseudo: "v1.pseudo",
  targetSessionId: "s2",
  targetAccountId: "acc-2",
  targetIpKeyedHash: "ip-hash",
  excerpt: "v1.excerpt",
  context: "v1.context",
  authorPseudo: "v1.author",
  reporterAccountId: "acc-1",
  createdAt: T0,
  ...overrides,
});

const alert = { offenceCategory: "v1.category", raisedBy: "v1.by", raisedAt: at(1000), status: "pending" as const };

describe("moderation store (moderation/04)", () => {
  it("saves and finds a report, patches only the given fields, and lists open ones", async () => {
    const moderation = createSqlModerationStore(storage());
    await moderation.saveReport(report());
    await moderation.saveReport(report({ id: "r2", createdAt: at(1) }));

    expect(await moderation.findReport("r1")).toEqual(report());
    expect(await moderation.patchReport("r1", { struckAt: at(5) })).toBe(true);
    expect(await moderation.patchReport("r1", { closed: { outcome: "warned", by: "Marc", at: at(6) } })).toBe(true);
    expect(await moderation.patchReport("missing", { struckAt: at(5) })).toBe(false);
    expect(await moderation.findReport("r1")).toEqual(report({ struckAt: at(5), closed: { outcome: "warned", by: "Marc", at: at(6) } }));
    expect((await moderation.openReports()).map((one) => one.id)).toEqual(["r2"]);
    expect(await moderation.findReport("missing")).toBeUndefined();
  });

  it("saves the triage of an open report only", async () => {
    const moderation = createSqlModerationStore(storage());
    const triage = { category: "threat" as const, urgency: "high" as const, summary: "v1.s", labels: "v1.l" };
    await moderation.saveReport(report());
    await moderation.saveReport(report({ id: "r2", closed: { outcome: "noAction", by: "Marc", at: T0 } }));

    await moderation.saveTriage("r1", triage);
    await moderation.saveTriage("r2", triage);
    await moderation.saveTriage("missing", triage);

    expect((await moderation.findReport("r1"))?.triage).toEqual(triage);
    expect((await moderation.findReport("r2"))?.triage).toBeUndefined();
  });

  it("keeps one alert per report, marks it notified, records a filing once (BR-104)", async () => {
    let pending = 0;
    const moderation = createSqlModerationStore(storage(), () => (pending += 1));
    await moderation.saveReport(report());

    expect(await moderation.saveAuthorityAlert("r1", alert)).toBe(true);
    expect(await moderation.saveAuthorityAlert("r1", alert)).toBe(false);
    expect(await moderation.saveAuthorityAlert("missing", alert)).toBe(false);
    expect(pending).toBe(1);
    expect(await moderation.pendingAlerts()).toEqual([{ reportId: "r1", offenceCategory: "v1.category", raisedAt: at(1000) }]);

    await moderation.markAlertNotified("r1", at(2000));
    expect(await moderation.pendingAlerts()).toEqual([]);
    expect(await moderation.recordFiling("r1", "PHAROS", "v1.ref", at(3000))).toBe("filed");
    expect(await moderation.recordFiling("r1", "PHAROS", "v1.ref", at(4000))).toBe("alreadyFiled");
    expect(await moderation.recordFiling("missing", "PHAROS", "v1.ref", at(4000))).toBe("noAlert");
    expect((await moderation.findReport("r1"))?.alert).toEqual({ ...alert, notifiedAt: at(2000), status: "filed", channel: "PHAROS", reference: "v1.ref", filedAt: at(3000) });
  });

  it("saves a report filed with its alert, and lists closed alerted reports", async () => {
    const moderation = createSqlModerationStore(storage());
    await moderation.saveReport(report({ alert, closed: { outcome: "expelled", by: "Marc", at: T0 } }));
    await moderation.saveReport(report({ id: "r2", closed: { outcome: "noAction", by: "Marc", at: T0 } }));

    expect((await moderation.alertedReports()).map((one) => [one.id, one.alert?.status])).toEqual([["r1", "pending"]]);
  });

  it("keeps decision e-mails and statements until deleted, and reports them pending (BR-107, BR-110)", async () => {
    let pending = 0;
    const store = storage();
    const moderation = createSqlModerationStore(store, () => (pending += 1));
    const mail = { id: "m1", reportId: "r1", email: "v1.mail", text: "v1.text", createdAt: T0 };
    const statement = { id: "st1", email: "v1.mail", text: "v1.text", giveUpAt: at(MAIL_GIVE_UP_MS) };

    expect(hasPendingMail(store, T0)).toBe(false);
    await moderation.savePendingDecisionMail(mail);
    await moderation.savePendingStatement(statement);
    expect(pending).toBe(2);
    expect(await moderation.pendingDecisionMails()).toEqual([mail]);
    expect(await moderation.pendingStatements()).toEqual([statement]);
    expect(hasPendingMail(store, T0)).toBe(true);
    expect(hasPendingMail(store, at(MAIL_GIVE_UP_MS))).toBe(false);

    await moderation.deletePendingDecisionMail("m1");
    await moderation.deletePendingStatement("st1");
    expect(await moderation.pendingDecisionMails()).toEqual([]);
    expect(await moderation.pendingStatements()).toEqual([]);
  });

  it("counts an alert not yet notified as pending for 7 days", async () => {
    const store = storage();
    const moderation = createSqlModerationStore(store);
    await moderation.saveReport(report());
    await moderation.saveAuthorityAlert("r1", alert);

    expect(hasPendingMail(store, at(1000))).toBe(true);
    expect(hasPendingMail(store, at(1000 + 7 * DAY))).toBe(false);
  });

  it("finds the latest-ending running ban on either key", async () => {
    const moderation = createSqlModerationStore(storage());
    const ban = { id: "b1", ipKeyedHash: "ip", until: at(DAY), decidedBy: "Marc", decidedAt: T0 };
    await moderation.saveBan(ban);
    await moderation.saveBan({ id: "b2", pseudoKeyedHash: "ps", until: at(2 * DAY), decidedBy: "Marc", decidedAt: T0 });

    expect(await moderation.activeBan("ip", "ps", T0)).toMatchObject({ id: "b2" });
    expect(await moderation.activeBan("ip", "none", T0)).toEqual(ban);
    expect(await moderation.activeBan("ip", "none", at(DAY))).toBeUndefined();
  });

  it("purges closed reports after 6 months, alerted ones after a year, bans 30 days after their end", async () => {
    const store = storage();
    const moderation = createSqlModerationStore(store);
    const closed = { outcome: "noAction" as const, by: "Marc", at: T0 };
    await moderation.saveReport(report({ closed }));
    await moderation.saveReport(report({ id: "alerted", closed, alert }));
    await moderation.saveReport(report({ id: "open" }));
    await moderation.saveBan({ id: "b1", ipKeyedHash: "ip", until: T0, decidedBy: "Marc", decidedAt: T0 });

    await moderation.purgeExpired(at(MODERATION_LIMITS.closedReportMs));
    expect(rows(store, "SELECT id FROM reports ORDER BY id")).toEqual([{ id: "alerted" }, { id: "open" }]);
    expect(rows(store, "SELECT id FROM bans")).toEqual(MODERATION_LIMITS.expiredBanMs <= MODERATION_LIMITS.closedReportMs ? [] : [{ id: "b1" }]);

    await moderation.purgeExpired(at(MODERATION_LIMITS.alertedReportMs));
    expect(rows(store, "SELECT id FROM reports")).toEqual([{ id: "open" }]);
    expect(rows(store, "SELECT * FROM alerts")).toEqual([]);
  });

  it("drops pending statements past their give-up time and decision e-mails past the give-up window (BR-076, BR-107)", async () => {
    const store = storage();
    const moderation = createSqlModerationStore(store);
    await moderation.savePendingStatement({ id: "old", email: "v1.m", text: "v1.t", giveUpAt: at(DAY) });
    await moderation.savePendingStatement({ id: "young", email: "v1.m", text: "v1.t", giveUpAt: at(3 * DAY) });
    await moderation.savePendingDecisionMail({ id: "old", reportId: "r1", email: "v1.m", text: "v1.t", createdAt: T0 });
    await moderation.savePendingDecisionMail({ id: "young", reportId: "r1", email: "v1.m", text: "v1.t", createdAt: at(2 * DAY) });

    await moderation.purgeExpired(at(2 * DAY));
    expect((await moderation.pendingStatements()).map((one) => one.id)).toEqual(["young"]);
    expect((await moderation.pendingDecisionMails()).map((one) => one.id)).toEqual(["old", "young"]);

    await moderation.purgeExpired(at(MAIL_GIVE_UP_MS));
    expect((await moderation.pendingDecisionMails()).map((one) => one.id)).toEqual(["young"]);
  });

  it("stores no moderator name in clear: closed reports and bans (ADR-0017)", async () => {
    const store = storage();
    const io = createModerationIo({ store: createSqlModerationStore(store), crypto });
    const clear = { id: "r1", reason: "harassment" as const, targetKind: "chatter" as const, targetPseudo: "Max", targetIp: "203.0.113.9", excerpt: "x", context: [], authorPseudo: "Lola", createdAt: T0 };
    await io.saveReport(clear);
    await io.closeReport(clear, "expelled", "Marcelline", at(1));
    await io.saveBan({ ip: "203.0.113.9", pseudo: "Max", until: at(DAY), decidedBy: "Marcelline" }, "r1", "b1", at(1));

    expect(JSON.stringify([...rows(store, "SELECT * FROM reports"), ...rows(store, "SELECT * FROM bans")])).not.toContain("Marcelline");
    expect((await io.findReport("r1"))?.closed).toEqual({ outcome: "expelled", by: "Marcelline", at: at(1) });
  });

  it("rolls an interrupted patch back (atomic write)", async () => {
    const store = storage();
    const moderation = createSqlModerationStore(store);
    await moderation.saveReport(report());
    const exec = store.sql.exec;
    store.sql.exec = (query, ...bindings) => {
      if (query.startsWith("INSERT OR REPLACE INTO reports")) {
        exec.call(store.sql, query, ...bindings);
        throw new Error("disk");
      }
      return exec.call(store.sql, query, ...bindings);
    };

    await expect(moderation.patchReport("r1", { struckAt: at(5) })).rejects.toThrow("disk");
    store.sql.exec = exec;
    expect((await moderation.findReport("r1"))?.struckAt).toBeUndefined();
  });
});

const moderator = (overrides: Partial<StoredModerator> = {}): StoredModerator => ({
  nameKeyedHash: "name-hash",
  credentialKeyedHash: "cred-hash",
  name: "v1.name",
  credentialId: "v1.cred",
  publicKey: "v1.key",
  signCount: 0,
  ...overrides,
});
const invitation = { tokenHash: "tok", nameKeyedHash: "name-hash", name: "v1.name", expiresAt: at(DAY) };

describe("moderator store (BR-094, BR-099)", () => {
  it("enrols once per valid invitation, replacing a moderator of the same name", async () => {
    const store = storage();
    const moderators = createSqlModeratorStore(store);
    await moderators.saveInvitation(invitation);
    await moderators.saveInvitation({ ...invitation, tokenHash: "tok2" });

    expect(await moderators.findInvitation("tok", T0)).toEqual(invitation);
    expect(await moderators.findInvitation("tok", at(DAY))).toBeUndefined();
    expect(await moderators.enrollModerator("tok", moderator(), T0)).toBe(true);
    expect(await moderators.enrollModerator("tok", moderator(), T0)).toBe(false);
    expect(await moderators.enrollModerator("tok2", moderator({ credentialKeyedHash: "cred-2" }), at(DAY))).toBe(false);
    expect(await moderators.enrollModerator("tok2", moderator({ credentialKeyedHash: "cred-2" }), T0)).toBe(true);

    expect(rows(store, "SELECT credential_keyed_hash FROM moderators")).toEqual([{ credential_keyed_hash: "cred-2" }]);
    expect(await moderators.findByCredential("cred-2")).toEqual(moderator({ credentialKeyedHash: "cred-2" }));
    expect(await moderators.findByCredential("cred-hash")).toBeUndefined();
  });

  it("rolls the enrolment back when the moderator write fails (atomic)", async () => {
    const store = storage();
    const moderators = createSqlModeratorStore(store);
    await moderators.saveInvitation(invitation);
    const exec = store.sql.exec;
    store.sql.exec = (query, ...bindings) => {
      if (query.startsWith("INSERT INTO moderators")) throw new Error("disk");
      return exec.call(store.sql, query, ...bindings);
    };

    await expect(moderators.enrollModerator("tok", moderator(), T0)).rejects.toThrow("disk");
    store.sql.exec = exec;
    expect(await moderators.findInvitation("tok", T0)).toEqual(invitation);
  });

  it("updates the sign count, revokes with pending invitations, purges expired invitations", async () => {
    const store = storage();
    const moderators = createSqlModeratorStore(store);
    await moderators.saveInvitation(invitation);
    await moderators.enrollModerator("tok", moderator(), T0);
    await moderators.saveInvitation({ ...invitation, tokenHash: "again" });
    await moderators.saveInvitation({ tokenHash: "old", nameKeyedHash: "other", name: "v1.o", expiresAt: T0 });

    await moderators.updateSignCount("cred-hash", 7);
    expect((await moderators.findByCredential("cred-hash"))?.signCount).toBe(7);
    expect(await moderators.deleteModerator("name-hash")).toBe(true);
    expect(await moderators.deleteModerator("name-hash")).toBe(false);
    expect(rows(store, "SELECT token_hash FROM invitations")).toEqual([{ token_hash: "old" }]);
    expect(await moderators.deleteModerator("other")).toBe(true);
    await moderators.saveInvitation({ tokenHash: "old", nameKeyedHash: "other", name: "v1.o", expiresAt: T0 });
    await moderators.purgeExpiredInvitations(T0);
    expect(rows(store, "SELECT * FROM invitations")).toEqual([]);
  });
});
