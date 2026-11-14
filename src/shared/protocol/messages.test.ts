import { describe, expect, it } from "vitest";
import { CAPS, clientMessage, serverMessage } from "./messages";

describe("clientMessage", () => {
  it("accepts a valid enter message", () => {
    const enter = {
      type: "enter",
      seq: 1,
      payload: { pseudo: "Lola", gender: "woman", age: 25, adultConfirmed: true, termsAccepted: true },
    };

    expect(clientMessage.safeParse(enter).success).toBe(true);
  });

  it("accepts a message with an empty payload", () => {
    expect(clientMessage.safeParse({ type: "leave", seq: 0, payload: {} }).success).toBe(true);
  });

  it("refuses an unknown type", () => {
    expect(clientMessage.safeParse({ type: "hack", seq: 1, payload: {} }).success).toBe(false);
  });

  it("refuses a negative or fractional seq", () => {
    const leave = (seq: number) => ({ type: "leave", seq, payload: {} });

    expect(clientMessage.safeParse(leave(-1)).success).toBe(false);
    expect(clientMessage.safeParse(leave(1.5)).success).toBe(false);
  });

  it("refuses a gender outside BR-005, on the gender field", () => {
    const enter = {
      type: "enter",
      seq: 1,
      payload: { pseudo: "Lola", gender: "other", age: 25, adultConfirmed: true, termsAccepted: true },
    };

    expect(clientMessage.safeParse(enter).error?.issues[0]?.path).toEqual(["payload", "gender"]);
  });

  it("refuses a report with more than 20 context lines", () => {
    const report = (lines: number) => ({
      type: "report",
      seq: 3,
      payload: { targetKind: "message", reason: "spam", excerpt: "buy", context: Array<string>(lines).fill("x") },
    });

    expect(clientMessage.safeParse(report(20)).success).toBe(true);
    expect(clientMessage.safeParse(report(21)).success).toBe(false);
  });

  it("refuses an empty room id", () => {
    expect(clientMessage.safeParse({ type: "joinRoom", seq: 2, payload: { roomId: "" } }).success).toBe(false);
  });
});

describe("serverMessage", () => {
  it("accepts a room message with an ISO date", () => {
    const msg = {
      type: "roomMessage",
      seq: 7,
      payload: {
        roomId: "r1",
        authorSessionId: "s1",
        pseudo: "Lola",
        gender: "woman",
        text: "salut",
        sentAt: "2026-10-22T10:00:00Z",
      },
    };

    expect(serverMessage.safeParse(msg).success).toBe(true);
  });

  it("refuses a room message whose date is not ISO", () => {
    const msg = {
      type: "roomMessage",
      seq: 7,
      payload: { roomId: "r1", authorSessionId: "s1", pseudo: "Lola", gender: "woman", text: "salut", sentAt: "yesterday" },
    };

    expect(serverMessage.safeParse(msg).success).toBe(false);
  });

  it("refuses room messages in the resume buffer (BR-013)", () => {
    const resumed = (buffered: unknown[]) => ({
      type: "resumed",
      seq: 1,
      payload: { sessionId: "s1", pseudo: "Lola", resumeToken: "t", rooms: [], windows: [], buffered, canReport: true },
    });
    const privateMsg = { conversationId: "c1", authorSessionId: "s1", text: "re", sentAt: "2026-10-22T10:00:00Z" };
    const roomMsg = { roomId: "r1", authorSessionId: "s1", pseudo: "Lola", gender: "woman", text: "hi", sentAt: "2026-10-22T10:00:00Z" };

    expect(serverMessage.safeParse(resumed([privateMsg])).success).toBe(true);
    expect(serverMessage.safeParse(resumed([roomMsg])).success).toBe(false);
  });

  it("links an error to the command that caused it", () => {
    const error = { type: "error", seq: 8, payload: { code: "offline", message: "gone", replyTo: 3 } };

    expect(serverMessage.parse(error)).toMatchObject({ type: "error", payload: { replyTo: 3 } });
  });

  it("refuses an error code outside the protocol", () => {
    const error = { type: "error", seq: 8, payload: { code: "teapot", message: "?" } };

    expect(serverMessage.safeParse(error).success).toBe(false);
  });
});

describe("openReports triage (BR-100, BR-102)", () => {
  const list = (triage: object) => ({
    type: "openReports",
    seq: 1,
    payload: {
      total: 1,
      reports: [{
        id: "r", reason: "spam", targetKind: "chatter", excerpt: "", context: [], authorPseudo: "ana", createdAt: "2026-11-13T10:00:00.000Z",
        hasAccount: false, connected: true, activeStrikes: 0, struck: false, triage,
      }],
    },
  });
  const triage = { category: "spam", urgency: "low", summary: "[A] spamme", labels: [{ label: "[A]", pseudo: "bob" }] };

  it("carries the category, urgency, summary and label legend", () => {
    expect(serverMessage.safeParse(list(triage)).success).toBe(true);
  });

  it.each([
    ["summary", (n: number) => ({ ...triage, summary: "x".repeat(n) }), CAPS.triageSummary],
    ["label", (n: number) => ({ ...triage, labels: [{ label: "x".repeat(n), pseudo: "bob" }] }), CAPS.triageLabel],
  ] as const)("caps the triage %s at the limit and refuses one over", (_name, build, cap) => {
    expect(serverMessage.safeParse(list(build(cap))).success).toBe(true);
    expect(serverMessage.safeParse(list(build(cap + 1))).success).toBe(false);
  });

  it("caps the page at 50 reports and refuses 51", () => {
    const page = (n: number) => {
      const base = list(triage);
      return { ...base, payload: { total: n, reports: Array.from({ length: n }, () => base.payload.reports[0]) } };
    };
    expect(serverMessage.safeParse(page(CAPS.queuePage)).success).toBe(true);
    expect(serverMessage.safeParse(page(CAPS.queuePage + 1)).success).toBe(false);
  });

  it("refuses a category outside BR-101 and a list without its total", () => {
    expect(serverMessage.safeParse(list({ ...triage, category: "insult" })).success).toBe(false);
    expect(serverMessage.safeParse({ ...list(triage), payload: { reports: list(triage).payload.reports } }).success).toBe(false);
  });
});

describe("transport caps (issue #13)", () => {
  const ok = (msg: unknown) => clientMessage.safeParse(msg).success;
  const x = (n: number) => "x".repeat(n);
  const enter = (fields: Record<string, unknown>) => ({
    type: "enter",
    seq: 1,
    payload: { pseudo: "Lola", age: 25, adultConfirmed: true, termsAccepted: true, ...fields },
  });

  it.each([
    ["pseudo", CAPS.pseudo],
    ["city", CAPS.city],
    ["moderatorGrant", CAPS.moderatorGrant],
  ])("caps enter %s at %i", (field, cap) => {
    expect(ok(enter({ [field]: x(cap) }))).toBe(true);
    expect(ok(enter({ [field]: x(cap + 1) }))).toBe(false);
  });

  it.each<[string, string, number, Record<string, unknown>]>([
    ["postRoom", "text", CAPS.text, { roomId: "lyon" }],
    ["createRoom", "name", CAPS.roomName, {}],
    ["sendPrivate", "text", CAPS.text, { targetPseudo: "Lola" }],
    ["sendPrivate", "targetPseudo", CAPS.pseudo, { text: "hi" }],
    ["search", "query", CAPS.query, {}],
    ["requestCode", "email", CAPS.email, { remember: false }],
    ["verifyCode", "code", CAPS.code, {}],
    ["warn", "text", CAPS.text, { targetSessionId: "s1" }],
    ["joinRoom", "roomId", CAPS.id, {}],
  ])("caps %s.%s at %i", (type, field, cap, rest) => {
    const msg = (n: number) => ({ type, seq: 1, payload: { ...rest, [field]: x(n) } });

    expect(ok(msg(cap))).toBe(true);
    expect(ok(msg(cap + 1))).toBe(false);
  });

  it("caps the report excerpt and each context line", () => {
    const report = (excerpt: number, line: number) => ({
      type: "report",
      seq: 1,
      payload: { targetKind: "message", reason: "spam", excerpt: x(excerpt), context: [x(line)] },
    });

    expect(ok(report(CAPS.excerpt, CAPS.contextLine))).toBe(true);
    expect(ok(report(CAPS.excerpt + 1, 1))).toBe(false);
    expect(ok(report(1, CAPS.contextLine + 1))).toBe(false);
  });

  it("fits the largest report in one frame", () => {
    const report = {
      type: "report",
      seq: 1,
      payload: {
        targetKind: "message",
        reason: "spam",
        excerpt: x(CAPS.excerpt),
        context: Array<string>(CAPS.contextLines).fill(x(CAPS.contextLine)),
      },
    };

    expect(new TextEncoder().encode(JSON.stringify(report)).length).toBeLessThan(CAPS.frame);
  });
});

describe("away member shape (issue #21)", () => {
  const joined = (members: unknown[]) => ({ type: "roomJoined", seq: 1, payload: { roomId: "lyon", members } });
  const connected = { sessionId: "s1", pseudo: "Lola", hasAccount: false, away: false, gender: "woman", age: 25, city: "Lyon" };
  const away = { sessionId: "s2", pseudo: "Max", hasAccount: false, away: true };

  it("accepts a room list with a connected and an away member", () => {
    expect(serverMessage.safeParse(joined([connected, away])).success).toBe(true);
  });

  it("refuses a connected member without profile", () => {
    expect(serverMessage.safeParse(joined([{ ...away, away: false }])).success).toBe(false);
  });

  it("drops profile fields sent for an away member", () => {
    const parsed = serverMessage.parse(joined([{ ...away, gender: "man", age: 30 }]));

    expect(parsed).toMatchObject({ payload: { members: [away] } });
    expect(parsed.type === "roomJoined" && parsed.payload.members[0]).not.toHaveProperty("age");
  });

  it("accepts an away chatter in search results and private windows", () => {
    const search = { type: "searchResults", seq: 1, payload: { results: [{ ...away, rooms: ["lyon"] }] } };
    const window = { type: "privateWindow", seq: 1, payload: { conversationId: "c1", other: away } };

    expect(serverMessage.safeParse(search).success).toBe(true);
    expect(serverMessage.safeParse(window).success).toBe(true);
  });

  it("accepts the logUnavailable error code", () => {
    const error = { type: "error", seq: 1, payload: { code: "logUnavailable", message: "log" } };

    expect(serverMessage.safeParse(error).success).toBe(true);
  });
});

describe("alertedReports and alertAuthorities (BR-104, `web-ui/08`)", () => {
  const alert = { offenceCategory: "threatToLife", raisedBy: "Marc", raisedAt: "2026-11-13T10:00:00.000Z", status: "pending" };
  const row = {
    id: "r", reason: "harassment", targetKind: "message", targetPseudo: "Max", excerpt: "x", context: ["x"], authorPseudo: "Lola",
    createdAt: "2026-11-13T10:00:00.000Z", closedAt: "2026-11-13T11:00:00.000Z", alert,
  };
  const page = (n: number, extra: object = {}) => ({
    type: "alertedReports",
    seq: 1,
    payload: { reports: Array.from({ length: n }, () => ({ ...row, ...extra })) },
  });

  it("caps the alertes tab at 50 reports and refuses 51", () => {
    expect(serverMessage.safeParse(page(CAPS.alertPage)).success).toBe(true);
    expect(serverMessage.safeParse(page(CAPS.alertPage + 1)).success).toBe(false);
  });

  it("carries a filed alert with channel and reference, capped at 100 characters", () => {
    const filed = (reference: string) => page(1, { alert: { ...alert, status: "filed", channel: "police17", reference, filedAt: alert.raisedAt } });
    expect(serverMessage.safeParse(filed("x".repeat(CAPS.filingReference))).success).toBe(true);
    expect(serverMessage.safeParse(filed("x".repeat(CAPS.filingReference + 1))).success).toBe(false);
  });

  it.each([
    ["an unknown channel", { alert: { ...alert, channel: "17" } }],
    ["an unknown status", { alert: { ...alert, status: "sent" } }],
    ["a row without its closing date", { closedAt: undefined }],
  ])("refuses %s", (_label, extra) => {
    expect(serverMessage.safeParse(page(1, extra)).success).toBe(false);
  });

  it.each([
    ["expel", { reportId: "r", duration: "7d", severe: true, alertAuthorities: "childAbuse" }],
    ["closeReport", { reportId: "r", outcome: "noAction", alertAuthorities: "harassment" }],
    ["confirmSuspension", { accountId: "a", reportId: "r", alertAuthorities: "terrorism" }],
    ["removeRoom", { reportId: "r", alertAuthorities: "hateOrViolence" }],
    ["removeRoom", { reportId: "r" }],
    ["listAlertedReports", {}],
  ])("accepts %s %j", (type, payload) => {
    expect(clientMessage.safeParse({ type, seq: 1, payload }).success).toBe(true);
  });

  it("refuses an offence category outside §6, and removeRoom by room id", () => {
    expect(clientMessage.safeParse({ type: "closeReport", seq: 1, payload: { reportId: "r", outcome: "noAction", alertAuthorities: "sexualMinor" } }).success).toBe(false);
    expect(clientMessage.safeParse({ type: "removeRoom", seq: 1, payload: { roomId: "lyon" } }).success).toBe(false);
  });
});
