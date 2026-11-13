/**
 * Hub moderation flow of brick 8a (`moderation/02a`, `02d`, `02e`) over the real crypto and the in-memory
 * stores of the Node transport. Only the mailer, the boundary, is a fake.
 */
import { describe, expect, it, vi } from "vitest";
import type { Mailer, ReportTriage, Triage, TriageInput } from "../../domain";
import type { ServerMessage } from "../../shared/protocol";
import { createAccountIo } from "../../server/account-io";
import { createCrypto } from "../../server/crypto/cipher";
import { cryptoKeysFromEnv } from "../../server/crypto/keys";
import { createHub, GRANT_FAILURES_MAX, GRANT_WINDOW_MS, type Outgoing } from "../../server/hub";
import { STATEMENT_RETRY_MS } from "../../server/hub-moderation";
import { createModerationIo } from "../../server/moderation-io";
import { createGrantKey, signGrant } from "../../server/moderator-grant";
import { createMemoryAccountStore, createMemoryVault } from "./memory-accounts";
import { createMemoryLog } from "./memory-log";
import { createMemoryModerationStore } from "./memory-moderation";
import { createNodeRandom } from "./random";

const T0 = new Date("2026-11-13T10:00:00Z");
const later = (ms: number) => new Date(T0.getTime() + ms);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

const setup = async (options: { mailAccepted?: boolean; canReport?: boolean; triage?: ReportTriage } = {}) => {
  const grantKey = await createGrantKey();
  /** A fresh passkey grant for "Marc" (BR-095). */
  const grant = (at: Date = T0) => signGrant(grantKey, "Marc", at);
  const random = createNodeRandom();
  const store = createMemoryAccountStore();
  const vault = createMemoryVault();
  const moderationStore = createMemoryModerationStore();
  const crypto = createCrypto(await cryptoKeysFromEnv({}, false, () => undefined));
  const codes: string[] = [];
  const statements: { email: string; statement: string }[] = [];
  let accept = options.mailAccepted ?? true;
  let mailDelay: Promise<void> | undefined;
  const mailer: Mailer = {
    sendCode: async (_email, code) => void codes.push(code),
    sendStatementOfReasons: async (email, statement) => {
      if (mailDelay) await mailDelay;
      statements.push({ email, statement });
      return accept;
    },
  };
  const closeSocket = vi.fn();
  const onStoreError = vi.fn();
  const hub = createHub({
    officialRooms: [{ id: "lyon", name: "Lyon", kind: "regional" }],
    random,
    hashToken: random.hashToken,
    log: createMemoryLog(),
    protocols: "HTTP/1.1 WebSocket",
    onLogError: vi.fn(),
    closeSocket,
    accounts: createAccountIo({ store, vault, crypto }),
    mailer,
    onStoreError,
    moderation: createModerationIo({ store: moderationStore, crypto }),
    grantKey,
    canReport: options.canReport,
    triage: options.triage,
  });
  let seq = 0;
  const send = (key: string, type: string, payload: object, now = T0) => hub.receive(key, JSON.stringify({ type, seq: ++seq, payload }), now);
  const enter = async (key: string, pseudo: string, extra: object = {}, ip = `10.0.0.${key}`) => {
    hub.open(key, ip, 4000);
    return send(key, "enter", { pseudo, age: 30, adultConfirmed: true, termsAccepted: true, ...extra });
  };
  const enterAs = async (key: string, pseudo: string, extra: object = {}, ip?: string) => only(await enter(key, pseudo, extra, ip), "entered").payload;
  const owner = async () => enterAs("9", "Patron", { moderatorGrant: await grant() });
  const signIn = async (key: string, email: string) => {
    only(await send(key, "requestCode", { email, remember: false }), "codeSent");
    return only(await send(key, "verifyCode", { code: codes.at(-1) ?? "" }), "accountLinked").payload.accountId;
  };
  const reportMax = async (key = "1") =>
    only(
      await send(key, "report", { targetKind: "message", targetPseudo: "Max", reason: "harassment", excerpt: "insulte", context: ["salut", "insulte"] }),
      "reportSent",
    ).payload.reportId;
  const setMailAccepted = (value: boolean) => {
    accept = value;
  };
  const setMailDelay = (value: Promise<void> | undefined) => {
    mailDelay = value;
  };
  return { hub, store, vault, moderationStore, codes, send, enter, enterAs, owner, signIn, reportMax, statements, setMailAccepted, setMailDelay, closeSocket, onStoreError, grant };
};

const find = <T extends ServerMessage["type"]>(out: Outgoing[], type: T) =>
  out.filter((o): o is Outgoing & { message: Extract<ServerMessage, { type: T }> } => o.message.type === type);
const only = <T extends ServerMessage["type"]>(out: Outgoing[], type: T) => {
  const [first, ...rest] = find(out, type);
  if (!first || rest.length > 0) throw new Error(`expected one ${type}, got ${JSON.stringify(out.map((o) => o.message))}`);
  return first.message;
};

describe("moderator grant at entry (UC16, BR-095, BR-096)", () => {
  it("enters the owner with moderator rights", async () => {
    const { owner } = await setup();

    expect(await owner()).toMatchObject({ isModerator: true });
  });

  it("refuses a wrong grant without creating a session", async () => {
    const { enter, hub } = await setup();

    const out = await enter("9", "Patron", { moderatorGrant: "wrong" });

    expect(only(out, "entryRefused").payload).toEqual({ reason: "notModerator" });
    expect(hub.stats().connected).toBe(0);
  });

  it("keeps the rights across a resume, and a chatter's resume carries none", async () => {
    const { hub, send, owner, enterAs } = await setup();
    const moderator = await owner();
    const chatter = await enterAs("1", "Lola");
    const resume = async (key: string, sessionResumeToken: string) => {
      await hub.close(key, T0);
      hub.open(`${key}b`, `10.0.0.${key}`, 4000);
      return only(await send(`${key}b`, "resume", { resumeToken: sessionResumeToken, profile: { gender: "unspecified", age: 30 } }), "resumed").payload;
    };

    expect(await resume("9", moderator.resumeToken)).toMatchObject({ isModerator: true, moderatorName: "Marc" });
    const resumed = await resume("1", chatter.resumeToken);
    expect(resumed).not.toHaveProperty("isModerator");
    expect(resumed).not.toHaveProperty("moderatorName");
    expect(only(await send("9b", "listOpenReports", {}), "openReports").payload.reports).toEqual([]);
  });

  it("names the moderator on entered from the grant (BR-055, BR-095)", async () => {
    const { owner } = await setup();

    expect(await owner()).toMatchObject({ isModerator: true, moderatorName: "Marc" });
  });

  it("gives a chatter no moderatorName", async () => {
    const { enterAs } = await setup();

    expect(await enterAs("1", "Lola")).not.toHaveProperty("moderatorName");
  });

  it("refuses a grant that was already used to enter (single use, BR-095)", async () => {
    const { enter, enterAs, grant } = await setup();
    const used = await grant();
    await enterAs("8", "Patron", { moderatorGrant: used });

    const out = await enter("9", "Patron2", { moderatorGrant: used });

    expect(only(out, "entryRefused").payload).toEqual({ reason: "notModerator" });
  });

  it("does not spend the nonce on a refused entry, so the same grant still works", async () => {
    const { enter, enterAs, grant } = await setup();
    const fresh = await grant();
    expect(only(await enter("8", "Patron", { moderatorGrant: fresh, adultConfirmed: false }), "entryRefused").payload).not.toEqual({ reason: "notModerator" });

    expect(await enterAs("9", "Patron", { moderatorGrant: fresh })).toMatchObject({ isModerator: true });
  });

  it("refuses an expired grant, and still accepts it just before the 60 s limit", async () => {
    const { enter, hub, grant } = await setup();
    const stale = await grant(later(-60_000));
    const nearlyStale = await grant(later(-59_000));

    expect(only(await enter("8", "Patron", { moderatorGrant: stale }), "entryRefused").payload).toEqual({ reason: "notModerator" });
    expect(only(await enter("9", "Patron", { moderatorGrant: nearlyStale }), "entered").payload.isModerator).toBe(true);
    expect(hub.stats().connected).toBe(1);
  });

  it("refuses a grant signed under another key", async () => {
    const { enter } = await setup();
    const forged = await signGrant(await createGrantKey(), "Marc", T0);

    expect(only(await enter("9", "Patron", { moderatorGrant: forged }), "entryRefused").payload).toEqual({ reason: "notModerator" });
  });

  it("keeps a chatter without the grant as a chatter", async () => {
    const { enterAs } = await setup();

    expect(await enterAs("1", "Lola")).toMatchObject({ isModerator: false });
  });
});

describe("report (UC9)", () => {
  it("answers reportSent and stores only ciphertext and keyed hashes", async () => {
    const { enterAs, reportMax, moderationStore } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");

    await reportMax();

    const [stored] = moderationStore.dump().reports;
    expect(stored).toMatchObject({ reason: "harassment", targetKind: "message" });
    expect(JSON.stringify(stored)).not.toMatch(/insulte|salut|Lola|Max|10\.0\.0/);
  });

  it("warns on the sixth report within 10 minutes", async () => {
    const { enterAs, send, reportMax } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    for (let index = 0; index < 5; index += 1) await reportMax();

    const out = await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "spam", excerpt: "", context: [] });

    expect(only(out, "warning").payload).toMatchObject({ code: "reportRate" });
  });

  it("refuses a report on oneself", async () => {
    const { enterAs, send } = await setup();
    await enterAs("1", "Lola");

    const out = await send("1", "report", { targetKind: "chatter", targetPseudo: "Lola", reason: "spam", excerpt: "", context: [] });

    expect(only(out, "warning").payload).toMatchObject({ code: "reportInvalid" });
  });
});

describe("queue (UC12, BR-054, BR-092)", () => {
  it("lists open reports oldest first with the target's state, to a moderator only", async () => {
    const { enterAs, send, owner, reportMax, signIn } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    await signIn("2", "max@example.org");
    const first = await reportMax();
    await send("1", "report", { targetKind: "room", targetRoomId: "lyon", reason: "other", excerpt: "", context: [] }, later(1));
    await owner();

    const out = await send("9", "listOpenReports", {}, later(2));

    const { reports } = only(out, "openReports").payload;
    expect(reports.map((report) => report.id)[0]).toBe(first);
    expect(reports[0]).toMatchObject({
      excerpt: "insulte",
      context: ["salut", "insulte"],
      authorPseudo: "Lola",
      targetPseudo: "Max",
      hasAccount: true,
      connected: true,
      activeStrikes: 0,
    });
    expect(reports[1]).toMatchObject({ targetKind: "room", targetRoomId: "lyon", hasAccount: false, connected: false });
    expect(only(await send("1", "listOpenReports", {}), "error").payload).toMatchObject({ code: "forbidden" });
  });

  it("closes a report with no action and drops it from the queue", async () => {
    const { enterAs, send, owner, reportMax } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    const reportId = await reportMax();
    await owner();

    expect(only(await send("9", "closeReport", { reportId, outcome: "noAction" }), "reportClosed").payload).toEqual({ reportId });
    expect(only(await send("9", "listOpenReports", {}), "openReports").payload.reports).toEqual([]);
    expect(only(await send("9", "closeReport", { reportId, outcome: "noAction" }), "warning").payload).toMatchObject({ code: "reportGone" });
  });

  it.each([
    ["closeReport", { outcome: "suspended" }],
    ["closeReport", { outcome: "roomRemoved" }],
    ["expel", { duration: "1h", severe: true }],
  ])("answers %s %j with notAvailable until brick 8c", async (type, extra) => {
    const { owner, send } = await setup();
    await owner();

    expect(only(await send("9", type, { reportId: "r", ...extra }), "error").payload).toMatchObject({ message: "notAvailable" });
  });

  it.each([
    ["warn", { targetSessionId: "s", text: "stop" }],
    ["removeRoom", { roomId: "lyon" }],
  ])("answers %s from a moderator with notAvailable", async (type, payload) => {
    const { owner, send } = await setup();
    await owner();

    expect(only(await send("9", type, payload), "error").payload).toMatchObject({ code: "invalid", message: "notAvailable" });
  });

  it("answers unavailable when the store fails", async () => {
    const { owner, send, moderationStore, onStoreError } = await setup();
    await owner();
    vi.spyOn(moderationStore, "openReports").mockRejectedValueOnce(new Error("down"));

    expect(only(await send("9", "listOpenReports", {}), "warning").payload).toMatchObject({ code: "unavailable" });
    expect(onStoreError).toHaveBeenCalled();
  });
});

describe("expel (UC11, BR-008, BR-053, BR-055)", () => {
  it("tells the target its end, closes it, and refuses its pseudo and IP until the end", async () => {
    const { enterAs, enter, send, owner, reportMax, closeSocket, moderationStore } = await setup();
    await enterAs("1", "Lola");
    const max = await enterAs("2", "Max");
    await send("1", "joinRoom", { roomId: "lyon" });
    await send("2", "joinRoom", { roomId: "lyon" });
    const reportId = await reportMax();
    await owner();

    // The socket closes only once the whole command answered, so `expelled` reaches it first (QA 2026-11-13).
    const saveReport = moderationStore.saveReport;
    let closedBeforeAnswer = false;
    moderationStore.saveReport = async (report) => {
      closedBeforeAnswer = closeSocket.mock.calls.length > 0;
      return saveReport(report);
    };
    const out = await send("9", "expel", { reportId, duration: "1h" });

    expect(closedBeforeAnswer).toBe(false);
    expect(only(out, "expelled")).toMatchObject({ payload: { until: later(HOUR).toISOString() } });
    expect(find(out, "expelled")[0]?.to).toEqual(["2"]);
    expect(only(out, "memberLeft").payload).toMatchObject({ roomId: "lyon", sessionId: max.sessionId });
    only(out, "reportClosed");
    expect(closeSocket).toHaveBeenCalledWith("2");
    expect(moderationStore.dump().bans[0]).toMatchObject({ decidedBy: "Marc", until: later(HOUR) });
    expect(only(await enter("3", "MAX", {}, "10.0.0.50"), "entryRefused").payload).toEqual({ reason: "banned", bannedUntil: later(HOUR).toISOString() });
    expect(only(await enter("4", "Autre", {}, "10.0.0.2"), "entryRefused").payload).toMatchObject({ reason: "banned" });
    expect(only(await send("4", "enter", { pseudo: "Autre", age: 30, adultConfirmed: true, termsAccepted: true }, later(HOUR)), "entered")).toBeDefined();
  });

  it("bans a target who already left, on the IP captured on the report", async () => {
    const { hub, enterAs, enter, send, owner, reportMax } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    const reportId = await reportMax();
    await send("2", "leave", {});
    hub.close("2", T0);
    await owner();

    const out = await send("9", "expel", { reportId, duration: "24h" });

    expect(find(out, "expelled")).toEqual([]);
    only(out, "reportClosed");
    expect(only(await enter("5", "Neuf", {}, "10.0.0.2"), "entryRefused").payload).toEqual({ reason: "banned", bannedUntil: later(DAY).toISOString() });
  });
});

describe("warn, strikes and suspension (`moderation/02d`, BR-074 to BR-077)", () => {
  const threeStrikes = async (ctx: Awaited<ReturnType<typeof setup>>) => {
    await ctx.enterAs("1", "Lola");
    await ctx.enterAs("2", "Max");
    const accountId = await ctx.signIn("2", "max@example.org");
    await ctx.owner();
    const outs: Outgoing[][] = [];
    let reportId = "";
    for (let index = 0; index < 3; index += 1) {
      reportId = await ctx.reportMax();
      outs.push(await ctx.send("9", "closeReport", { reportId, outcome: "warned" }));
    }
    return { accountId, reportId, outs };
  };

  it("warns a guest in the chat without a strike and closes the report", async () => {
    const { enterAs, send, owner, reportMax } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    const reportId = await reportMax();
    await owner();

    const out = await send("9", "closeReport", { reportId, outcome: "warned" });

    expect(only(out, "warned")).toMatchObject({ payload: { rule: "harassment", activeStrikes: 0 } });
    only(out, "reportClosed");
  });

  it("counts strikes, then proposes a suspension at the third without closing the report", async () => {
    const ctx = await setup();

    const { outs, accountId, reportId } = await threeStrikes(ctx);

    expect(outs.map((out) => only(out, "warned").payload.activeStrikes)).toEqual([1, 2, 3]);
    only(outs[1] ?? [], "reportClosed");
    expect(only(outs[2] ?? [], "suspensionProposed").payload).toEqual({ accountId, reportId, activeStrikes: 3 });
    expect(find(outs[2] ?? [], "reportClosed")).toEqual([]);
    expect(only(await ctx.send("9", "listOpenReports", {}), "openReports").payload.reports[0]).toMatchObject({ id: reportId, activeStrikes: 3 });
  });

  it("closes as warned when the moderator declines", async () => {
    const ctx = await setup();
    const { accountId, reportId } = await threeStrikes(ctx);

    only(await ctx.send("9", "declineSuspension", { accountId, reportId }), "reportClosed");
    expect(ctx.store.dump().accounts).toHaveLength(1);
  });

  it("on confirmation deletes the account, blocks the e-mail, writes the vault, mails the statement and closes the sessions", async () => {
    const ctx = await setup();
    const { accountId, reportId } = await threeStrikes(ctx);

    const out = await ctx.send("9", "confirmSuspension", { accountId, reportId }, later(1000));

    expect(only(out, "expelled").payload.until).toBe(later(1000 + 7 * DAY).toISOString());
    only(out, "reportClosed");
    expect(ctx.store.dump().accounts).toEqual([]);
    expect(ctx.vault.entries()).toHaveLength(1);
    expect(ctx.statements).toEqual([{ email: "max@example.org", statement: expect.stringContaining("aucun outil automatique") }]);
    const sentBefore = ctx.codes.length;
    only(await ctx.send("1", "requestCode", { email: "max@example.org", remember: false }, later(DAY)), "codeSent");
    expect(ctx.codes).toHaveLength(sentBefore);
    expect(only(await ctx.enter("3", "Max", {}, "10.0.0.77"), "entryRefused").payload).toMatchObject({ reason: "banned" });
  });

  it("retries a refused statement on the tick, for at most 7 days", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { accountId, reportId } = await threeStrikes(ctx);
    await ctx.send("9", "confirmSuspension", { accountId, reportId });

    await ctx.hub.tick(later(1000));
    await ctx.hub.tick(later(7 * DAY));
    ctx.setMailAccepted(true);
    await ctx.hub.tick(later(7 * DAY + 1));

    expect(ctx.statements).toHaveLength(2);
  });

  it("stops retrying once the statement is accepted", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { accountId, reportId } = await threeStrikes(ctx);
    await ctx.send("9", "confirmSuspension", { accountId, reportId });
    ctx.setMailAccepted(true);

    await ctx.hub.tick(later(1000));
    await ctx.hub.tick(later(2000));

    expect(ctx.statements).toHaveLength(2);
  });

  it("refuses a suspension below three active strikes or for another account", async () => {
    const ctx = await setup();
    await ctx.enterAs("1", "Lola");
    await ctx.enterAs("2", "Max");
    const accountId = await ctx.signIn("2", "max@example.org");
    await ctx.owner();
    const reportId = await ctx.reportMax();

    expect(only(await ctx.send("9", "confirmSuspension", { accountId, reportId }), "warning").payload).toMatchObject({ code: "suspensionRefused" });
    expect(only(await ctx.send("9", "confirmSuspension", { accountId: "other", reportId }), "warning").payload).toMatchObject({ code: "suspensionRefused" });
  });

  it("gives one strike per report: a repeated warning only proposes the suspension again (review Must)", async () => {
    const ctx = await setup();
    const { accountId, reportId } = await threeStrikes(ctx);

    const again = await ctx.send("9", "closeReport", { reportId, outcome: "warned" });

    expect(find(again, "warned")).toEqual([]);
    expect(only(again, "suspensionProposed").payload).toEqual({ accountId, reportId, activeStrikes: 3 });
    expect(only(await ctx.send("9", "listOpenReports", {}), "openReports").payload.reports[0]).toMatchObject({ id: reportId, activeStrikes: 3, struck: true });
  });

  it("still evicts the suspended member when closing the report fails after the account is gone (Codex P1)", async () => {
    const ctx = await setup();
    const { accountId, reportId } = await threeStrikes(ctx);
    ctx.moderationStore.saveReport = async () => {
      throw new Error("disk");
    };

    const outs = await ctx.send("9", "confirmSuspension", { accountId, reportId });

    expect(find(outs, "expelled").map((o) => o.to)).toEqual([["2"]]);
    expect(only(outs, "warning").payload).toMatchObject({ code: "unavailable" });
    expect(ctx.onStoreError).toHaveBeenCalled();
  });

  it("refuses to decline a suspension nobody proposed", async () => {
    const ctx = await setup();
    await ctx.enterAs("1", "Lola");
    await ctx.enterAs("2", "Max");
    const accountId = await ctx.signIn("2", "max@example.org");
    await ctx.owner();
    const reportId = await ctx.reportMax();

    expect(only(await ctx.send("9", "declineSuspension", { accountId, reportId }), "warning").payload).toMatchObject({ code: "suspensionRefused" });
    expect(only(await ctx.send("9", "listOpenReports", {}), "openReports").payload.reports).toHaveLength(1);
  });

  it("does not hold the chat while the provider is slow, and retries refused statements every 10 minutes", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { accountId, reportId } = await threeStrikes(ctx);
    let release = () => {};
    ctx.setMailDelay(new Promise<void>((resolve) => { release = resolve; }));

    only(await ctx.send("9", "confirmSuspension", { accountId, reportId }), "reportClosed");
    only(await ctx.send("1", "joinRoom", { roomId: "lyon" }), "roomJoined");
    release();
    ctx.setMailDelay(undefined);
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    await ctx.hub.tick(later(1000));
    await flush();
    await ctx.hub.tick(later(STATEMENT_RETRY_MS));
    await flush();
    expect(ctx.statements).toHaveLength(2);

    await ctx.hub.tick(later(STATEMENT_RETRY_MS + 1000));
    await flush();
    expect(ctx.statements).toHaveLength(3);
  });
});

describe("hardening (review round 1)", () => {
  it("answers forbidden to a chatter before any other check", async () => {
    const { enterAs, send } = await setup();
    await enterAs("1", "Lola");

    expect(only(await send("1", "expel", { reportId: "r", duration: "1h", severe: true }), "error").payload).toMatchObject({ code: "forbidden" });
    expect(only(await send("1", "closeReport", { reportId: "r", outcome: "roomRemoved" }), "error").payload).toMatchObject({ code: "forbidden" });
  });

  it("refuses to expel or warn on a room report, and to close a report as expelled without an expel", async () => {
    const { enterAs, send, owner, reportMax } = await setup();
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    const roomReport = only(await send("1", "report", { targetKind: "room", targetRoomId: "lyon", reason: "spam", excerpt: "", context: [] }), "reportSent").payload.reportId;
    const reportId = await reportMax();
    await owner();

    expect(only(await send("9", "expel", { reportId: roomReport, duration: "1h" }), "warning").payload).toMatchObject({ code: "reportInvalid" });
    expect(only(await send("9", "closeReport", { reportId: roomReport, outcome: "warned" }), "warning").payload).toMatchObject({ code: "reportInvalid" });
    expect(only(await send("9", "closeReport", { reportId, outcome: "expelled" }), "error").payload).toMatchObject({ code: "invalid" });
  });

  it("refuses the sixth moderator grant from one IP within 10 minutes, even the right one", async () => {
    const { enter, hub, grant } = await setup();
    for (let index = 0; index < GRANT_FAILURES_MAX; index += 1) {
      expect(only(await enter(`${20 + index}`, "Patron", { moderatorGrant: "wrong" }, "10.0.0.9"), "entryRefused").payload).toEqual({ reason: "notModerator" });
    }

    expect(only(await enter("30", "Patron", { moderatorGrant: await grant() }, "10.0.0.9"), "entryRefused").payload).toEqual({ reason: "rate" });
    await hub.tick(later(GRANT_WINDOW_MS));
    hub.open("31", "10.0.0.9", 4000);
    expect(only(await hub.receive("31", JSON.stringify({ type: "enter", seq: 1, payload: { pseudo: "Patron", age: 30, adultConfirmed: true, termsAccepted: true, moderatorGrant: await grant(later(GRANT_WINDOW_MS)) } }), later(GRANT_WINDOW_MS)), "entered").payload.isModerator).toBe(true);
  });

  it("keeps reporting off behind the tester tunnel (`moderation/01`)", async () => {
    const { enterAs, send } = await setup({ canReport: false });

    expect(await enterAs("1", "Lola")).toMatchObject({ canReport: false });
    expect(only(await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "spam", excerpt: "", context: [] }), "error").payload).toMatchObject({ code: "invalid", message: "notAvailable" });
  });

  it("answers unavailable to an entry when the ban store fails", async () => {
    const { enter, moderationStore, onStoreError } = await setup();
    moderationStore.activeBan = () => {
      throw new Error("disk");
    };

    expect(only(await enter("1", "Lola"), "warning").payload).toMatchObject({ code: "unavailable" });
    expect(onStoreError).toHaveBeenCalled();
  });
});

describe("AI triage of a report (moderation/02g, BR-100 to BR-102)", () => {
  const answer: Triage = { category: "harassment", urgency: "high", summary: "[A] insulte [B]" };
  /** A fake of the provider boundary that records what left asv. */
  const fakeTriage = (result: Triage | "unavailable" | Error = answer) => {
    const inputs: TriageInput[] = [];
    const triage: ReportTriage = {
      triage: (input) => {
        inputs.push(input);
        return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
      },
    };
    return { triage, inputs };
  };
  const listed = async (send: (key: string, type: string, payload: object, now?: Date) => Promise<Outgoing[]>) =>
    only(await send("9", "listOpenReports", {}, later(5)), "openReports").payload;

  it("sends only labelled lines, stores the triage encrypted, and shows it with its legend", async () => {
    const { triage, inputs } = fakeTriage();
    const { enterAs, send, owner, moderationStore } = await setup({ triage });
    await enterAs("1", "Lola");
    await enterAs("2", "Max");

    const out = await send("1", "report", { targetKind: "message", targetPseudo: "Max", reason: "harassment", excerpt: "lola tu es nulle", context: ["Lola: salut max", "Max: lola tu es nulle"] });

    expect(find(out, "reportSent")).toHaveLength(1);
    await vi.waitFor(() => expect(moderationStore.dump().reports[0]?.triage).toBeDefined());
    expect(inputs).toEqual([{ reason: "harassment", targetKind: "message", lines: ["[B]: salut [A]", "[A]: [B] tu es nulle", "[A]: [B] tu es nulle"] }]);
    const stored = JSON.stringify(moderationStore.dump().reports);
    expect(stored).not.toContain("insulte [B]");
    expect(stored).not.toContain("Lola");
    await owner();
    expect((await listed(send)).reports[0]?.triage).toEqual({
      ...answer,
      labels: [{ label: "[A]", pseudo: "Max" }, { label: "[B]", pseudo: "Lola" }],
    });
  });

  it("raises a low urgency to medium on a seemsMinor report (BR-101)", async () => {
    const { triage } = fakeTriage({ ...answer, urgency: "low" });
    const { enterAs, send, owner, moderationStore } = await setup({ triage });
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "seemsMinor", excerpt: "", context: [] });
    await vi.waitFor(() => expect(moderationStore.dump().reports[0]?.triage).toBeDefined());
    await owner();

    expect((await listed(send)).reports[0]?.triage?.urgency).toBe("medium");
  });

  it("leaves the report unknown when the triage is unavailable or fails, never delaying reportSent", async () => {
    const failing = fakeTriage(new Error("down"));
    const { enterAs, send, owner, onStoreError, reportMax } = await setup({ triage: failing.triage });
    await enterAs("1", "Lola");
    await enterAs("2", "Max");

    await reportMax();

    await vi.waitFor(() => expect(onStoreError).toHaveBeenCalledWith(new Error("down")));
    await owner();
    expect((await listed(send)).reports[0]).not.toHaveProperty("triage");
  });

  it("drops a triage arriving after the report closed (moderation/05)", async () => {
    let resolve: (value: Triage) => void = () => undefined;
    const triage: ReportTriage = { triage: () => new Promise((done) => (resolve = done)) };
    const { enterAs, send, owner, moderationStore, reportMax } = await setup({ triage });
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    const reportId = await reportMax();
    await owner();
    await send("9", "closeReport", { reportId, outcome: "noAction" });

    resolve(answer);

    await vi.waitFor(() => expect(moderationStore.dump().reports[0]?.closed).toBeDefined());
    await new Promise((done) => setTimeout(done, 0));
    expect(moderationStore.dump().reports[0]?.triage).toBeUndefined();
  });

  it("stops calling after 20 reports from one reporter in a UTC day, and starts again the next day (BR-101)", async () => {
    const { triage, inputs } = fakeTriage("unavailable");
    const { enterAs, send } = await setup({ triage });
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    // BR-052 allows 5 reports per 10 minutes: space them out.
    for (let n = 0; n < 21; n++) await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "spam", excerpt: "", context: [] }, later(n * 11 * 60_000));
    await vi.waitFor(() => expect(inputs).toHaveLength(20));

    await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "spam", excerpt: "", context: [] }, later(DAY));

    await vi.waitFor(() => expect(inputs).toHaveLength(21));
  });

  it("lists by urgency then oldest, the first 50 only, with the open count (BR-102)", async () => {
    let calls = 0;
    // Only the first report gets a triage, a low one: it sorts after every unknown spam report.
    const triage: ReportTriage = { triage: () => Promise.resolve(++calls === 1 ? { ...answer, urgency: "low" } : "unavailable") };
    const { enterAs, send, owner, moderationStore } = await setup({ triage });
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    for (let n = 0; n < 52; n++) await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "spam", excerpt: "", context: [] }, later(n * 11 * 60_000));
    await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "illegalContent", excerpt: "", context: [] }, later(53 * 11 * 60_000));
    await vi.waitFor(() => expect(moderationStore.dump().reports[0]?.triage).toBeDefined());
    const [first, second] = moderationStore.dump().reports;
    await owner();

    const { reports, total } = await listed(send);

    expect(total).toBe(53);
    expect(reports).toHaveLength(50);
    expect(reports[0]?.reason).toBe("illegalContent");
    expect(reports[1]?.id).toBe(second?.id);
    expect(reports.map((report) => report.id)).not.toContain(first?.id);
  });
});
