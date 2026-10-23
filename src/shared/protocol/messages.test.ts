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
      payload: { resumeToken: "t", rooms: [], windows: [], buffered },
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
  const connected = { sessionId: "s1", pseudo: "Lola", away: false, gender: "woman", age: 25, city: "Lyon" };
  const away = { sessionId: "s2", pseudo: "Max", away: true };

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
