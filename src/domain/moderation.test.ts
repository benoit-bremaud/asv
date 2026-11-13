import { describe, expect, it } from "vitest";
import { enter, socketLost, type Random } from "./entry";
import {
  activeStrikes,
  addStrike,
  canSuspend,
  decideExpel,
  fileReport,
  isModerator,
  liveTarget,
  MODERATION_LIMITS,
  pruneReportAttempts,
  sessionsOfAccount,
  sortOpenReports,
  suspensionUntil,
  type ReportCommand,
} from "./moderation";
import { emptyHubState, type HubState } from "./rooms";

const T0 = new Date("2026-11-13T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const DAY = 24 * 60 * 60_000;

const fakeRandom = (): Random => {
  let n = 0;
  return { id: () => `id${++n}`, token: () => ({ value: `t${++n}`, hash: `h${n}` }) };
};

/** Lola (guest, moderator if asked) and Max (member a1) are connected. */
const hub = (lolaModerator = false) => {
  const random = fakeRandom();
  let state: HubState = emptyHubState([{ id: "lyon", name: "Lyon", kind: "regional" }]);
  const add = (pseudo: string, ip: string, accountId?: string, mod = false) => {
    const result = enter(state, { pseudo, age: 30, adultConfirmed: true, termsAccepted: true, ip, accountId, isModerator: mod }, T0, random);
    state = result.state;
    const effect = result.effects[0];
    return effect?.type === "entered" ? effect.sessionId : "";
  };
  const lola = add("Lola", "10.0.0.1", undefined, lolaModerator);
  const max = add("Max", "10.0.0.2", "a1");
  return { state, random, lola, max };
};

const report = (sessionId: string, overrides: Partial<ReportCommand> = {}): ReportCommand => ({
  sessionId,
  targetKind: "message",
  targetPseudo: "max",
  reason: "harassment",
  excerpt: "bad",
  context: ["a", "b"],
  ...overrides,
});

describe("fileReport (UC9, BR-050 to BR-052)", () => {
  it("captures the target's pseudo, session, account and IP and the author's pseudo", () => {
    const { state, random, lola, max } = hub();

    const result = fileReport(state, report(lola), T0, random);

    expect(result).toMatchObject({
      kind: "filed",
      report: {
        targetPseudo: "Max",
        targetSessionId: max,
        targetAccountId: "a1",
        targetIp: "10.0.0.2",
        authorPseudo: "Lola",
        excerpt: "bad",
        context: ["a", "b"],
        createdAt: T0,
      },
    });
  });

  it("cuts the excerpt to 500 characters and keeps the last 20 context lines", () => {
    const { state, random, lola } = hub();
    const lines = Array.from({ length: 25 }, (_, index) => `l${index}`);

    const result = fileReport(state, report(lola, { excerpt: "é".repeat(600), context: lines }), T0, random);

    if (result.kind !== "filed") throw new Error(result.reason);
    expect([...result.report.excerpt]).toHaveLength(MODERATION_LIMITS.maxExcerptLength);
    expect(result.report.context).toEqual(lines.slice(5));
  });

  it("keeps a report on a pseudo that left, without session, account or IP", () => {
    const { state, random, lola } = hub();

    const result = fileReport(state, report(lola, { targetPseudo: "Gone" }), T0, random);

    expect(result).toMatchObject({ kind: "filed", report: { targetPseudo: "Gone", targetSessionId: undefined, targetIp: undefined } });
  });

  it("keeps no IP for an away target", () => {
    const { state, random, lola, max } = hub();
    const away = socketLost(state, max, T0).state;

    const result = fileReport(away, report(lola), T0, random);

    expect(result).toMatchObject({ kind: "filed", report: { targetSessionId: max, targetIp: undefined } });
  });

  it("files a room report with its room id", () => {
    const { state, random, lola } = hub();

    const result = fileReport(state, report(lola, { targetKind: "room", targetPseudo: undefined, targetRoomId: "lyon" }), T0, random);

    expect(result).toMatchObject({ kind: "filed", report: { targetRoomId: "lyon" } });
  });

  it.each([
    ["an unknown author", { sessionId: "nobody" }],
    ["a chatter report without pseudo", { targetPseudo: undefined }],
    ["a room report without room", { targetKind: "room" as const, targetPseudo: undefined }],
  ])("refuses %s as invalid", (_, overrides) => {
    const { state, random, lola } = hub();

    expect(fileReport(state, report(lola, overrides), T0, random)).toMatchObject({ kind: "refused", reason: "invalid", state });
  });

  it("refuses a report on oneself", () => {
    const { state, random, lola } = hub();

    expect(fileReport(state, report(lola, { targetPseudo: "LOLA" }), T0, random)).toMatchObject({ kind: "refused", reason: "self" });
  });

  it("refuses the sixth report within 10 minutes, then accepts once the window slid", () => {
    const { random, lola } = hub();
    let { state } = hub();
    for (let index = 0; index < MODERATION_LIMITS.reportsPerWindow; index += 1) {
      const result = fileReport(state, report(lola), at(index), random);
      if (result.kind !== "filed") throw new Error("expected filed");
      state = result.state;
    }

    expect(fileReport(state, report(lola), at(MODERATION_LIMITS.reportWindowMs - 1), random)).toMatchObject({ kind: "refused", reason: "rate" });
    expect(fileReport(state, report(lola), at(MODERATION_LIMITS.reportWindowMs), random)).toMatchObject({ kind: "filed" });
  });

  it("prunes report counts older than the window", () => {
    const { state, random, lola } = hub();
    const filed = fileReport(state, report(lola), T0, random);
    if (filed.kind !== "filed") throw new Error("expected filed");

    expect(pruneReportAttempts(filed.state, at(MODERATION_LIMITS.reportWindowMs - 1)).reportAttempts.get(lola)).toHaveLength(1);
    expect(pruneReportAttempts(filed.state, at(MODERATION_LIMITS.reportWindowMs)).reportAttempts.size).toBe(0);
    expect(pruneReportAttempts(state, T0)).toBe(state);
  });
});

describe("moderator rights (BR-054, BR-091)", () => {
  it("is true only for a session entered with the grant, and survives away", () => {
    const moderated = hub(true);
    const plain = hub(false);

    expect(isModerator(moderated.state, moderated.lola)).toBe(true);
    expect(isModerator(plain.state, plain.lola)).toBe(false);
    expect(isModerator(moderated.state, "nobody")).toBe(false);
    expect(isModerator(socketLost(moderated.state, moderated.lola, T0).state, moderated.lola)).toBe(true);
  });
});

describe("decideExpel (UC11, BR-053)", () => {
  const filed = () => {
    const h = hub();
    const result = fileReport(h.state, report(h.lola), T0, h.random);
    if (result.kind !== "filed") throw new Error("expected filed");
    return { ...h, report: result.report };
  };

  it.each([
    ["1h", 60 * 60_000],
    ["24h", DAY],
    ["7d", 7 * DAY],
  ] as const)("bans the live IP and pseudo for %s", (duration, ms) => {
    const { state, report: filedReport, max } = filed();

    const decision = decideExpel(state, filedReport, duration, "owner", T0);

    expect(decision.ban).toEqual({ ip: "10.0.0.2", pseudo: "Max", until: at(ms), decidedBy: "owner" });
    expect(decision.session?.id).toBe(max);
  });

  it("falls back on the IP captured on the report once the target is away", () => {
    const { state, report: filedReport, max } = filed();

    const decision = decideExpel(socketLost(state, max, T0).state, filedReport, "1h", "owner", T0);

    expect(decision.ban.ip).toBe("10.0.0.2");
  });

  it("finds a member who re-entered under the same pseudo, never a stranger who took it", () => {
    const { state, report: filedReport, max, random } = filed();
    const gone = { ...state, sessions: new Map([...state.sessions].filter(([id]) => id !== max)), pseudoIndex: new Map() };
    const same = enter(gone, { pseudo: "Max", age: 30, adultConfirmed: true, termsAccepted: true, ip: "10.0.0.9", accountId: "a1" }, T0, random);
    const stranger = enter(gone, { pseudo: "Max", age: 30, adultConfirmed: true, termsAccepted: true, ip: "10.0.0.8" }, T0, random);

    expect(liveTarget(same.state, filedReport)?.status).toBe("connected");
    expect(decideExpel(same.state, filedReport, "1h", "owner", T0).ban.ip).toBe("10.0.0.9");
    expect(liveTarget(stranger.state, filedReport)).toBeUndefined();
    expect(decideExpel(stranger.state, filedReport, "1h", "owner", T0).ban.ip).toBe("10.0.0.2");
  });

  it("has no live target for a guest report whose session is gone", () => {
    const { state, report: filedReport } = filed();

    expect(liveTarget(emptyHubState([]), { ...filedReport, targetAccountId: undefined })).toBeUndefined();
    expect(liveTarget(state, { ...filedReport, targetSessionId: undefined, targetPseudo: undefined })).toBeUndefined();
  });
});

describe("strikes and suspension (BR-074, BR-075, BR-077)", () => {
  it("adds a 90-day strike and drops the expired ones", () => {
    const old = { expiresAt: at(-1) };
    const live = { expiresAt: at(DAY) };

    const result = addStrike([old, live], T0);

    expect(result.strikes).toEqual([live, { expiresAt: at(MODERATION_LIMITS.strikeMs) }]);
    expect(result).toMatchObject({ active: 2, proposeSuspension: false });
  });

  it("proposes a suspension at the third active strike, not before", () => {
    const two = [{ expiresAt: at(DAY) }, { expiresAt: at(DAY) }];

    expect(addStrike(two.slice(1), T0).proposeSuspension).toBe(false);
    expect(addStrike(two, T0)).toMatchObject({ active: 3, proposeSuspension: true });
  });

  it("allows a suspension only while three strikes are still running", () => {
    const three = [{ expiresAt: at(DAY) }, { expiresAt: at(DAY) }, { expiresAt: at(2 * DAY) }];

    expect(canSuspend(three, T0)).toBe(true);
    expect(canSuspend(three, at(DAY))).toBe(false);
    expect(activeStrikes(three, at(DAY))).toHaveLength(1);
  });

  it("suspends for 7 days and reaches every session of the account", () => {
    const { state, max } = hub();

    expect(suspensionUntil(T0)).toEqual(at(7 * DAY));
    expect(sessionsOfAccount(socketLost(state, max, T0).state, "a1").map((session) => session.id)).toEqual([max]);
  });
});

describe("sortOpenReports (BR-092)", () => {
  it("lists the oldest first without changing its input", () => {
    const input = [{ createdAt: at(2) }, { createdAt: at(1) }];

    expect(sortOpenReports(input)).toEqual([{ createdAt: at(1) }, { createdAt: at(2) }]);
    expect(input[0]?.createdAt).toEqual(at(2));
  });
});
