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
  const alerts: { reportId: string; category: string }[] = [];
  const decisions: { email: string; text: string }[] = [];
  let accept = options.mailAccepted ?? true;
  let mailDelay: Promise<void> | undefined;
  const mailer: Mailer = {
    sendCode: async (_email, code) => void codes.push(code),
    sendStatementOfReasons: async (email, statement) => {
      if (mailDelay) await mailDelay;
      statements.push({ email, statement });
      return accept;
    },
    sendAuthorityAlert: async (reportId, category) => {
      alerts.push({ reportId, category });
      return accept;
    },
    sendReportDecision: async (email, text) => {
      decisions.push({ email, text });
      return accept;
    },
  };
  const closeSocket = vi.fn();
  const onStoreError = vi.fn();
  const moderationIo = createModerationIo({ store: moderationStore, crypto });
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
    moderation: moderationIo,
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
  return { hub, store, vault, moderationStore, moderationIo, codes, send, enter, enterAs, owner, signIn, reportMax, statements, alerts, decisions, setMailAccepted, setMailDelay, closeSocket, onStoreError, grant };
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

describe("queue (UC12, BR-054, BR-102)", () => {
  it("lists open reports of equal urgency oldest first with the target's state, to a moderator only", async () => {
    const { enterAs, send, owner, reportMax, signIn, moderationStore } = await setup();
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
    expect(reports[1]).toMatchObject({ targetKind: "room", targetRoomId: "lyon", targetRoomName: "Lyon", hasAccount: false, connected: false });
    // The room name is encrypted at rest like the pseudos (ADR-0017).
    expect(JSON.stringify(moderationStore.dump().reports)).not.toContain("Lyon");
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
    ["closeReport", { outcome: "severeDeleted" }],
    ["closeReport", { outcome: "expelled" }],
  ])("answers %s %j with notAvailable: set by its own command only", async (type, extra) => {
    const { owner, send } = await setup();
    await owner();

    expect(only(await send("9", type, { reportId: "r", ...extra }), "error").payload).toMatchObject({ message: "notAvailable" });
  });

  it.each([
    ["warn", { targetSessionId: "s", text: "stop" }],
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
    const patchReport = moderationStore.patchReport;
    let closedBeforeAnswer = false;
    moderationStore.patchReport = async (id, patch) => {
      closedBeforeAnswer = closeSocket.mock.calls.length > 0;
      return patchReport(id, patch);
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
    // The statement is stored encrypted first, then sent outside the hub queue (BR-109).
    await vi.waitFor(() => expect(ctx.statements).toEqual([{ email: "max@example.org", statement: expect.stringContaining("aucun outil automatique") }]));
    const sentBefore = ctx.codes.length;
    only(await ctx.send("1", "requestCode", { email: "max@example.org", remember: false }, later(DAY)), "codeSent");
    expect(ctx.codes).toHaveLength(sentBefore);
    expect(only(await ctx.enter("3", "Max", {}, "10.0.0.77"), "entryRefused").payload).toMatchObject({ reason: "banned" });
  });

  it("retries a refused statement on the tick, for at most 7 days", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { accountId, reportId } = await threeStrikes(ctx);
    await ctx.send("9", "confirmSuspension", { accountId, reportId });
    await vi.waitFor(() => expect(ctx.statements).toHaveLength(1));

    await ctx.hub.tick(later(1000));
    await vi.waitFor(() => expect(ctx.statements).toHaveLength(2));
    await ctx.hub.tick(later(7 * DAY));
    ctx.setMailAccepted(true);
    await ctx.hub.tick(later(7 * DAY + STATEMENT_RETRY_MS));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(ctx.statements).toHaveLength(2);
  });

  it("stops retrying once the statement is accepted", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { accountId, reportId } = await threeStrikes(ctx);
    await ctx.send("9", "confirmSuspension", { accountId, reportId });
    await vi.waitFor(() => expect(ctx.statements).toHaveLength(1));
    ctx.setMailAccepted(true);

    await ctx.hub.tick(later(1000));
    await vi.waitFor(() => expect(ctx.statements).toHaveLength(2));
    await ctx.hub.tick(later(1000 + STATEMENT_RETRY_MS));
    await new Promise((resolve) => setTimeout(resolve, 20));

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
    ctx.moderationStore.patchReport = async () => {
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
    await vi.waitFor(() => expect(ctx.statements).toHaveLength(1));
    const flush = () => new Promise((resolve) => setImmediate(resolve));
    await ctx.hub.tick(later(1000));
    await flush();
    await vi.waitFor(() => expect(ctx.statements).toHaveLength(2));
    await ctx.hub.tick(later(STATEMENT_RETRY_MS));
    await flush();
    await ctx.hub.tick(later(1000 + STATEMENT_RETRY_MS));
    await vi.waitFor(() => expect(ctx.statements).toHaveLength(3));
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

  it("counts the refused grants of one IPv6 /64 together (BR-112)", async () => {
    const { enter } = await setup();
    for (let index = 0; index < GRANT_FAILURES_MAX; index += 1) {
      expect(only(await enter(`${20 + index}`, "Patron", { moderatorGrant: "wrong" }, "2001:db8:0:1::1"), "entryRefused").payload).toEqual({ reason: "notModerator" });
    }

    expect(only(await enter("30", "Patron", { moderatorGrant: "wrong" }, "2001:db8:0:1:ffff::2"), "entryRefused").payload).toEqual({ reason: "rate" });
    expect(only(await enter("31", "Patron", { moderatorGrant: "wrong" }, "2001:db8:0:2::1"), "entryRefused").payload).toEqual({ reason: "notModerator" });
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
  /** Lets every pending triage (keyed hash, call, save) settle. */
  const flush = () => new Promise((done) => setTimeout(done, 20));
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
    expect(inputs).toEqual([{ reason: "harassment", targetKind: "message", lines: ["[B]: salut [A]", "[A]: [B] tu es nulle"] }]);
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

    const saved = vi.spyOn(moderationStore, "saveTriage");

    resolve(answer);

    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce());
    await saved.mock.results[0]?.value;
    expect(moderationStore.dump().reports[0]?.closed).toBeDefined();
    expect(moderationStore.dump().reports[0]?.triage).toBeUndefined();
  });

  it("stops calling after 20 reports from one reporter in a UTC day, and starts again the next day (BR-101)", async () => {
    const { triage, inputs } = fakeTriage("unavailable");
    const ctx = await setup({ triage });
    const { enterAs, send } = ctx;
    await enterAs("1", "Lola");
    await enterAs("2", "Max");
    // BR-052 allows 5 reports per 10 minutes: space them out.
    const { moderationStore } = ctx;
    for (let n = 0; n < 21; n++) await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "spam", excerpt: "", context: [] }, later(n * 11 * 60_000));
    expect(moderationStore.dump().reports).toHaveLength(21);
    await vi.waitFor(() => expect(inputs).toHaveLength(20));
    await flush();
    expect(inputs).toHaveLength(20);

    await send("1", "report", { targetKind: "chatter", targetPseudo: "Max", reason: "spam", excerpt: "", context: [] }, later(DAY));

    await vi.waitFor(() => expect(inputs).toHaveLength(21));
    await flush();
    expect(inputs).toHaveLength(21);
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

type Ctx = Awaited<ReturnType<typeof setup>>;
/** Lets the mails sent without waiting (crypto, store, provider) settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Lola (member when `lolaEmail`) reports Max (member when `maxEmail`); the owner enters as moderator. */
const reported = async (ctx: Ctx, options: { maxEmail?: string; lolaEmail?: string } = {}) => {
  await ctx.enterAs("1", "Lola");
  const max = await ctx.enterAs("2", "Max");
  const lolaAccount = options.lolaEmail === undefined ? undefined : await ctx.signIn("1", options.lolaEmail);
  const maxAccount = options.maxEmail === undefined ? undefined : await ctx.signIn("2", options.maxEmail);
  await ctx.owner();
  const reportId = await ctx.reportMax();
  return { max, maxAccount, lolaAccount, reportId };
};

describe("severe expel (moderation/02h, BR-103)", () => {
  it("deletes a member at once, blocks the e-mail 6 months, bans 7 days, mails the statement and closes every session", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx, { maxEmail: "max@example.org" });
    await ctx.send("2", "joinRoom", { roomId: "lyon" });

    const out = await ctx.send("9", "expel", { reportId, duration: "1h", severe: true });
    await settle();

    expect(only(out, "expelled").payload).toEqual({ until: later(7 * DAY).toISOString() });
    expect(find(out, "expelled")[0]?.to).toEqual(["2"]);
    only(out, "reportClosed");
    expect(ctx.store.dump().accounts).toEqual([]);
    expect(ctx.vault.entries()).toHaveLength(1);
    expect(ctx.statements).toEqual([{ email: "max@example.org", statement: expect.stringContaining(later(183 * DAY).toISOString().slice(0, 10)) }]);
    expect(ctx.statements[0]?.statement).toContain("aucun outil automatique");
    expect(ctx.moderationStore.dump().reports[0]?.closed).toMatchObject({ outcome: "severeDeleted", by: "Marc" });
    expect(ctx.moderationStore.dump().bans[0]).toMatchObject({ until: later(7 * DAY) });
    // BR-078: the e-mail stays blocked, so no new code is sent.
    await ctx.enterAs("3", "Neuf", {}, "10.0.0.77");
    const codes = ctx.codes.length;
    only(await ctx.send("3", "requestCode", { email: "max@example.org", remember: false }, later(10 * DAY)), "codeSent");
    expect(ctx.codes).toHaveLength(codes);
  });

  it("closes the away session of the pseudo too, and bans a guest on IP and pseudo only", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);
    await ctx.hub.close("2", T0);

    const out = await ctx.send("9", "expel", { reportId, duration: "1h", severe: true });

    only(out, "reportClosed");
    expect(ctx.statements).toEqual([]);
    expect(ctx.hub.stats().connected).toBe(2);
    expect(only(await ctx.enter("5", "Max", {}, "10.0.0.88"), "entryRefused").payload).toMatchObject({ reason: "banned" });
    expect(only(await ctx.enter("6", "Autre", {}, "10.0.0.2"), "entryRefused").payload).toMatchObject({ reason: "banned" });
  });

  it("only bans when the member deleted their account before the decision (accepted limit)", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx, { maxEmail: "max@example.org" });
    await ctx.send("2", "deleteAccount", {});

    only(await ctx.send("9", "expel", { reportId, duration: "1h", severe: true }), "reportClosed");
    expect(ctx.statements).toEqual([]);
    expect(ctx.moderationStore.dump().bans).toHaveLength(1);
  });

  it("refuses a severe expel on a room report", async () => {
    const ctx = await setup();
    await ctx.enterAs("1", "Lola");
    await ctx.owner();
    const reportId = only(await ctx.send("1", "report", { targetKind: "room", targetRoomId: "lyon", reason: "spam", excerpt: "", context: [] }), "reportSent").payload.reportId;

    expect(only(await ctx.send("9", "expel", { reportId, duration: "1h", severe: true }), "warning").payload).toMatchObject({ code: "reportInvalid" });
  });

  it("leaves the report open when the ban cannot be written", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx, { maxEmail: "max@example.org" });
    vi.spyOn(ctx.moderationStore, "saveBan").mockRejectedValueOnce(new Error("down"));

    expect(only(await ctx.send("9", "expel", { reportId, duration: "1h", severe: true }), "warning").payload).toMatchObject({ code: "unavailable" });
    expect(ctx.store.dump().accounts).toHaveLength(1);
    expect(only(await ctx.send("9", "listOpenReports", {}), "openReports").payload.total).toBe(1);
  });

  it("still evicts and answers unavailable when only the close fails after the deletion", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx, { maxEmail: "max@example.org" });
    ctx.moderationStore.patchReport = async () => {
      throw new Error("disk");
    };

    const out = await ctx.send("9", "expel", { reportId, duration: "1h", severe: true });

    expect(find(out, "expelled").map((o) => o.to)).toEqual([["2"]]);
    expect(only(out, "warning").payload).toMatchObject({ code: "unavailable" });
  });

  it("mentions the automated triage in the statement when the report was triaged", async () => {
    const ctx = await setup({ triage: { triage: () => Promise.resolve({ category: "threat", urgency: "high", summary: "[A] menace" }) } });
    const { reportId } = await reported(ctx, { maxEmail: "max@example.org" });
    await settle();

    await ctx.send("9", "expel", { reportId, duration: "1h", severe: true });

    await vi.waitFor(() => expect(ctx.statements[0]?.statement).toContain("Un tri automatique"));
  });
});

describe("authority alert (moderation/02h, BR-104, BR-105, UC20)", () => {
  it("stores one pending alert, mails the owner the id and category only, and lists it in the alertes tab", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);

    only(await ctx.send("9", "expel", { reportId, duration: "1h", severe: true, alertAuthorities: "threatToLife" }), "reportClosed");
    await settle();

    expect(ctx.alerts).toEqual([{ reportId, category: "threatToLife" }]);
    const stored = ctx.moderationStore.dump().reports[0]?.alert;
    expect(stored).toMatchObject({ status: "pending", notifiedAt: T0 });
    // The category is encrypted at rest too (ADR-0017).
    expect(stored?.offenceCategory).not.toContain("threatToLife");
    expect(stored?.raisedBy).not.toContain("Marc");
    const [row] = only(await ctx.send("9", "listAlertedReports", {}), "alertedReports").payload.reports;
    expect(row).toMatchObject({
      id: reportId,
      targetPseudo: "Max",
      authorPseudo: "Lola",
      excerpt: "insulte",
      closedAt: T0.toISOString(),
      alert: { offenceCategory: "threatToLife", raisedBy: "Marc", status: "pending" },
    });
  });

  it("shows the filing with its channel and reference once recorded, and refuses a second filing", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);
    await ctx.send("9", "closeReport", { reportId, outcome: "noAction", alertAuthorities: "harassment" });

    expect(await ctx.moderationIo.recordFiling(reportId, "police17", "appel 2026-11-13T22:10", later(HOUR))).toBe("filed");
    expect(await ctx.moderationIo.recordFiling(reportId, "PHAROS", "x", later(HOUR))).toBe("alreadyFiled");
    expect(await ctx.moderationIo.recordFiling("unknown", "PHAROS", "x", later(HOUR))).toBe("noAlert");
    expect(JSON.stringify(ctx.moderationStore.dump().reports)).not.toContain("appel");
    const [row] = only(await ctx.send("9", "listAlertedReports", {}), "alertedReports").payload.reports;
    expect(row?.alert).toMatchObject({ status: "filed", channel: "police17", reference: "appel 2026-11-13T22:10", filedAt: later(HOUR).toISOString() });
  });

  it("keeps a filing recorded while the report closes (owner route outside the hub queue)", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);
    const proposal = await ctx.moderationIo.saveAuthorityAlert(reportId, "harassment", "Marc", T0);
    const report = await ctx.moderationIo.findReport(reportId);
    if (!proposal || !report) throw new Error("expected an open report with an alert");

    await Promise.all([ctx.moderationIo.closeReport(report, "noAction", "Marc", T0), ctx.moderationIo.recordFiling(reportId, "PHAROS", "PV-1", T0)]);

    expect(ctx.moderationStore.dump().reports[0]).toMatchObject({ closed: { outcome: "noAction" }, alert: { status: "filed", channel: "PHAROS" } });
  });

  it("answers noAlert for a report without alert", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);

    expect(await ctx.moderationIo.recordFiling(reportId, "PHAROS", "x", T0)).toBe("noAlert");
  });

  /** Max has two strikes; a third `warned` on a new report proposes the suspension (BR-075). */
  const proposed = async (alertAuthorities?: "harassment") => {
    const ctx = await setup();
    await ctx.enterAs("1", "Lola");
    await ctx.enterAs("2", "Max");
    await ctx.signIn("2", "max@example.org");
    await ctx.owner();
    for (let index = 0; index < 2; index += 1) {
      await ctx.send("9", "closeReport", { reportId: await ctx.reportMax(), outcome: "warned" });
    }
    const reportId = await ctx.reportMax();
    const proposal = only(await ctx.send("9", "closeReport", { reportId, outcome: "warned", alertAuthorities }), "suspensionProposed").payload;
    return { ctx, reportId, proposal };
  };

  it("keeps the alert raised on the warning when the suspension is confirmed, one per report", async () => {
    const { ctx, reportId, proposal } = await proposed("harassment");
    expect(proposal.alert).toBe("harassment");
    // An open row with an alert shows it, and the proposal shows it read-only (`web-ui/08`).
    expect(only(await ctx.send("9", "listOpenReports", {}), "openReports").payload.reports[0]?.alert).toMatchObject({ status: "pending", offenceCategory: "harassment" });

    // A forged second category is ignored: one alert per report (BR-104).
    only(await ctx.send("9", "confirmSuspension", { ...proposal, alertAuthorities: "terrorism" }), "reportClosed");
    await settle();

    expect(ctx.alerts).toEqual([{ reportId, category: "harassment" }]);
  });

  it("keeps the alert raised on the warning when the suspension is declined", async () => {
    const { ctx, reportId, proposal } = await proposed("harassment");

    only(await ctx.send("9", "declineSuspension", proposal), "reportClosed");
    await settle();

    expect(ctx.alerts).toEqual([{ reportId, category: "harassment" }]);
  });

  it("raises the alert picked in the proposal on both answers (BR-104)", async () => {
    const declined = await proposed();
    only(await declined.ctx.send("9", "declineSuspension", { ...declined.proposal, alertAuthorities: "terrorism" }), "reportClosed");
    const confirmed = await proposed();
    only(await confirmed.ctx.send("9", "confirmSuspension", { ...confirmed.proposal, alertAuthorities: "childAbuse" }), "reportClosed");
    await settle();

    expect(declined.ctx.alerts).toEqual([{ reportId: declined.reportId, category: "terrorism" }]);
    expect(confirmed.ctx.alerts).toEqual([{ reportId: confirmed.reportId, category: "childAbuse" }]);
  });

  it("raises no alert when the proposal is declined without one", async () => {
    const { ctx, proposal } = await proposed();
    expect(proposal).not.toHaveProperty("alert");

    only(await ctx.send("9", "declineSuspension", proposal), "reportClosed");
    await settle();

    expect(ctx.alerts).toEqual([]);
  });

  it("raises an alert on an ordinary expel and on room removal", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);

    only(await ctx.send("9", "expel", { reportId, duration: "1h", alertAuthorities: "otherListed" }), "reportClosed");
    await settle();

    expect(ctx.alerts).toEqual([{ reportId, category: "otherListed" }]);
  });

  it("retries a refused owner alert every 10 minutes until accepted, for at most 7 days", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { reportId } = await reported(ctx);
    await ctx.send("9", "closeReport", { reportId, outcome: "noAction", alertAuthorities: "childAbuse" });
    await settle();
    expect(ctx.alerts).toHaveLength(1);

    await ctx.hub.tick(later(1000));
    await settle();
    expect(ctx.alerts).toHaveLength(2);
    await ctx.hub.tick(later(2000));
    await settle();
    expect(ctx.alerts).toHaveLength(2);

    ctx.setMailAccepted(true);
    await ctx.hub.tick(later(1000 + STATEMENT_RETRY_MS));
    await settle();
    expect(ctx.alerts).toHaveLength(3);
    await ctx.hub.tick(later(1000 + 2 * STATEMENT_RETRY_MS));
    await settle();
    expect(ctx.alerts).toHaveLength(3);
  });

  it("retries the other alerts when one stored category cannot be read, and the decision mails too", async () => {
    const ctx = await setup({ mailAccepted: false });
    const first = await reported(ctx);
    await ctx.send("9", "closeReport", { reportId: first.reportId, outcome: "noAction", alertAuthorities: "childAbuse" });
    const second = await ctx.reportMax();
    await ctx.send("9", "closeReport", { reportId: second, outcome: "noAction", alertAuthorities: "terrorism" });
    await settle();
    const store = ctx.moderationStore;
    const real = await store.pendingAlerts();
    vi.spyOn(store, "pendingAlerts").mockResolvedValueOnce(real.map((alert) => (alert.reportId === first.reportId ? { ...alert, offenceCategory: "garbage" } : alert)));
    const decisions = vi.spyOn(store, "pendingDecisionMails");
    ctx.alerts.length = 0;

    await ctx.hub.tick(later(1000));
    await settle();

    expect(ctx.alerts).toEqual([{ reportId: second, category: "terrorism" }]);
    expect(ctx.onStoreError).toHaveBeenCalled();
    expect(decisions).toHaveBeenCalled();
  });

  it("gives up the owner alert after 7 days", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { reportId } = await reported(ctx);
    await ctx.send("9", "closeReport", { reportId, outcome: "noAction", alertAuthorities: "childAbuse" });
    await settle();

    await ctx.hub.tick(later(7 * DAY));
    await settle();

    expect(ctx.alerts).toHaveLength(1);
  });

  it("lists at most 50 alerted reports, pending first then the most recently filed", async () => {
    const ctx = await setup();
    await ctx.owner();
    const add = async (index: number, filedAt?: Date) => {
      const id = `r${index}`;
      await ctx.moderationIo.saveReport({ id, reason: "spam", targetKind: "chatter", targetPseudo: "Max", excerpt: "", context: [], authorPseudo: "Lola", createdAt: T0 });
      await ctx.moderationIo.saveAuthorityAlert(id, "otherListed", "Marc", later(index * 1000));
      const report = await ctx.moderationIo.findReport(id);
      if (report) await ctx.moderationIo.closeReport(report, "noAction", "Marc", T0);
      if (filedAt) await ctx.moderationIo.recordFiling(id, "PHAROS", "ref", filedAt);
    };
    for (let index = 0; index < 49; index += 1) await add(index, later(DAY + index * 1000));
    await add(100);
    await add(101);

    const { reports } = only(await ctx.send("9", "listAlertedReports", {}), "alertedReports").payload;

    expect(reports).toHaveLength(50);
    expect(reports.slice(0, 3).map((report) => report.id)).toEqual(["r100", "r101", "r48"]);
    expect(reports.at(-1)?.id).toBe("r1");
  });

  it("keeps an alerted report 1 year after closing, an ordinary one 6 months (BR-061, BR-105)", async () => {
    const ctx = await setup();
    const first = await reported(ctx);
    await ctx.send("9", "closeReport", { reportId: first.reportId, outcome: "noAction", alertAuthorities: "harassment" });
    const second = await ctx.reportMax();
    await ctx.send("9", "closeReport", { reportId: second, outcome: "noAction" });

    await ctx.hub.tick(later(200 * DAY));
    expect(ctx.moderationStore.dump().reports.map((report) => report.id)).toEqual([first.reportId]);
    await ctx.hub.tick(later(365 * DAY));
    expect(ctx.moderationStore.dump().reports).toEqual([]);
  });
});

describe("room removal (moderation/02i, BR-106)", () => {
  const roomReport = async (ctx: Ctx, roomId: string) =>
    only(await ctx.send("1", "report", { targetKind: "room", targetRoomId: roomId, reason: "illegalContent", excerpt: "", context: [] }), "reportSent").payload.reportId;

  it("closes a user room, tells its members, frees its name and closes the report", async () => {
    const ctx = await setup();
    await ctx.enterAs("1", "Lola");
    await ctx.enterAs("2", "Max");
    await ctx.owner();
    const list = only(await ctx.send("2", "createRoom", { name: "Les Viennois" }), "roomList").payload.rooms;
    const viennois = list.find((room) => room.name === "Les Viennois")?.id ?? "";
    await ctx.send("1", "joinRoom", { roomId: viennois });
    const reportId = await roomReport(ctx, viennois);

    const out = await ctx.send("9", "removeRoom", { reportId, alertAuthorities: "hateOrViolence" });

    expect(only(out, "roomClosed").payload).toEqual({ roomId: viennois });
    expect(find(out, "roomClosed")[0]?.to.toSorted()).toEqual(["1", "2"]);
    expect(only(out, "roomList").payload.rooms.map((room) => room.name)).not.toContain("Les Viennois");
    only(out, "reportClosed");
    expect(ctx.moderationStore.dump().reports[0]?.closed).toMatchObject({ outcome: "roomRemoved" });
    expect(only(await ctx.send("9", "createRoom", { name: "Les Viennois" }), "roomList").payload.rooms.map((room) => room.name)).toContain("Les Viennois");
  });

  it.each([
    ["an official room", "lyon"],
    ["a room already gone", "gone"],
  ])("answers reportInvalid on %s and keeps the report open", async (_label, roomId) => {
    const ctx = await setup();
    await ctx.enterAs("1", "Lola");
    await ctx.owner();
    const reportId = await roomReport(ctx, roomId);

    expect(only(await ctx.send("9", "removeRoom", { reportId }), "warning").payload).toMatchObject({ code: "reportInvalid" });
    expect(only(await ctx.send("9", "listOpenReports", {}), "openReports").payload.total).toBe(1);
  });

  it("answers reportInvalid on a chatter report, and reportGone on a closed one", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);

    expect(only(await ctx.send("9", "removeRoom", { reportId }), "warning").payload).toMatchObject({ code: "reportInvalid" });
    await ctx.send("9", "closeReport", { reportId, outcome: "noAction" });
    expect(only(await ctx.send("9", "removeRoom", { reportId }), "warning").payload).toMatchObject({ code: "reportGone" });
  });
});

describe("decision e-mail to a member reporter (moderation/02i, BR-107)", () => {
  it.each([
    ["noAction", "aucune mesure"],
    ["warned", "une mesure a été prise"],
  ] as const)("mails the reporter the decision in general terms on %s", async (outcome, words) => {
    const ctx = await setup();
    const { reportId } = await reported(ctx, { lolaEmail: "lola@example.org" });

    await ctx.send("9", "closeReport", { reportId, outcome });
    await settle();

    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.decisions[0]?.email).toBe("lola@example.org");
    expect(ctx.decisions[0]?.text).toContain(words);
    expect(ctx.decisions[0]?.text).not.toContain("Max");
    expect(ctx.decisions[0]?.text).toContain("aucun outil automatique");
    expect(ctx.moderationStore.dump().mails).toEqual([]);
  });

  it("says automated means were used when the report was triaged", async () => {
    const ctx = await setup({ triage: { triage: () => Promise.resolve({ category: "spam", urgency: "low", summary: "spam" }) } });
    const { reportId } = await reported(ctx, { lolaEmail: "lola@example.org" });
    await settle();

    await ctx.send("9", "expel", { reportId, duration: "1h" });
    await settle();

    expect(ctx.decisions[0]?.text).toContain("Un tri automatique");
  });

  it("sends nothing to a guest reporter, or to a reporter whose account is gone", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx);
    await ctx.send("9", "closeReport", { reportId, outcome: "noAction" });

    const other = await setup();
    const second = await reported(other, { lolaEmail: "lola@example.org" });
    await other.send("1", "deleteAccount", {});
    await other.send("9", "closeReport", { reportId: second.reportId, outcome: "noAction" });
    await settle();

    expect(ctx.decisions).toEqual([]);
    expect(other.decisions).toEqual([]);
  });

  it("keeps a refused mail encrypted, retries it, deletes it once accepted", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { reportId } = await reported(ctx, { lolaEmail: "lola@example.org" });
    await ctx.send("9", "closeReport", { reportId, outcome: "noAction" });
    await settle();

    const [kept] = ctx.moderationStore.dump().mails;
    expect(kept?.reportId).toBe(reportId);
    expect(JSON.stringify(kept)).not.toContain("lola@");
    ctx.setMailAccepted(true);
    await ctx.hub.tick(later(1000));
    await settle();

    expect(ctx.decisions).toHaveLength(2);
    expect(ctx.moderationStore.dump().mails).toEqual([]);
  });

  it("gives up and deletes the address after 7 days", async () => {
    const ctx = await setup({ mailAccepted: false });
    const { reportId } = await reported(ctx, { lolaEmail: "lola@example.org" });
    await ctx.send("9", "closeReport", { reportId, outcome: "noAction" });
    await settle();

    await ctx.hub.tick(later(7 * DAY));
    await settle();

    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.moderationStore.dump().mails).toEqual([]);
  });

  it("still closes the report when the decision mail cannot be stored", async () => {
    const ctx = await setup();
    const { reportId } = await reported(ctx, { lolaEmail: "lola@example.org" });
    vi.spyOn(ctx.moderationStore, "savePendingDecisionMail").mockRejectedValueOnce(new Error("down"));

    only(await ctx.send("9", "closeReport", { reportId, outcome: "noAction" }), "reportClosed");
    expect(ctx.onStoreError).toHaveBeenCalled();
  });

  it("reports a failing retry round to onStoreError without throwing", async () => {
    const ctx = await setup();
    await ctx.owner();
    vi.spyOn(ctx.moderationStore, "pendingDecisionMails").mockRejectedValueOnce(new Error("down"));

    await ctx.hub.tick(later(1000));
    await settle();

    expect(ctx.onStoreError).toHaveBeenCalled();
  });
});
