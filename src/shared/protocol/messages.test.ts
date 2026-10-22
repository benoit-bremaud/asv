import { describe, expect, it } from "vitest";
import { clientMessage, serverMessage } from "./messages";

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

  it("links an error to the command that caused it", () => {
    const error = { type: "error", seq: 8, payload: { code: "offline", message: "gone", replyTo: 3 } };

    expect(serverMessage.parse(error)).toMatchObject({ type: "error", payload: { replyTo: 3 } });
  });

  it("refuses an error code outside the protocol", () => {
    const error = { type: "error", seq: 8, payload: { code: "teapot", message: "?" } };

    expect(serverMessage.safeParse(error).success).toBe(false);
  });
});
