import { describe, expect, it } from "vitest";
import {
  ACCOUNT_LIMITS,
  checkCode,
  closeAccount,
  decideCodeRequest,
  isDisposable,
  linkAccount,
  normaliseEmail,
  pruneDeviceClaims,
  redeemDeviceClaim,
  unlinkSessions,
  type Account,
  type CodeRandom,
  type CodeRequestFacts,
} from "./accounts";
import { enter, socketLost } from "./entry";
import { emptyHubState, type HubState } from "./rooms";

const T0 = new Date("2026-10-23T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Deterministic stand-in for the hub's random source. */
const fakeRandom = (): CodeRandom => {
  let n = 0;
  return {
    id: () => `id${++n}`,
    token: () => {
      n += 1;
      return { value: `t${n}`, hash: `h(t${n})` };
    },
    code: () => "123456",
  };
};

/** A hub with one connected session, `id1`. */
const withSession = (): { state: HubState; sessionId: string } => {
  const result = enter(emptyHubState([]), {
    pseudo: "nath_lune",
    age: 30,
    adultConfirmed: true,
    termsAccepted: true,
    ip: "203.0.113.1",
  }, T0, fakeRandom());
  const effect = result.effects[0];
  if (effect?.type !== "entered") throw new Error("setup: entry refused");
  return { state: result.state, sessionId: effect.sessionId };
};

const account = (overrides: Partial<Account> = {}): Account => ({
  id: "acc1",
  email: "nath@example.org",
  verifiedAt: at(-1000),
  lastSeenAt: at(-1000),
  strikes: [],
  ...overrides,
});

describe("normaliseEmail", () => {
  it("trims and lower-cases a plausible address", () => {
    expect(normaliseEmail("  Nath@Example.ORG ")).toBe("nath@example.org");
  });

  it.each(["", "nath", "nath@", "@example.org", "nath@example", "na th@example.org", "a@b@c.org", "nath@example..org"])(
    "refuses %j",
    (raw) => {
      expect(normaliseEmail(raw)).toBeUndefined();
    },
  );

  it("refuses an address over 254 characters", () => {
    expect(normaliseEmail(`${"a".repeat(250)}@x.org`)).toBeUndefined();
  });
});

describe("isDisposable", () => {
  it("matches a listed domain and its subdomains, not lookalikes", () => {
    expect(isDisposable("x@yopmail.com")).toBe(true);
    expect(isDisposable("x@mail.yopmail.com")).toBe(true);
    expect(isDisposable("x@notyopmail.com")).toBe(false);
    expect(isDisposable("x@example.org")).toBe(false);
  });
});

describe("decideCodeRequest", () => {
  const facts = (overrides: Partial<CodeRequestFacts> = {}): CodeRequestFacts => ({
    email: "nath@example.org",
    blocked: false,
    emailCodesLastHour: 0,
    ipCodesLastHour: 0,
    wrongTriesLastDay: 0,
    ...overrides,
  });

  it("issues a six-digit code valid 10 minutes", () => {
    expect(decideCodeRequest(facts(), T0, fakeRandom())).toEqual({
      kind: "issue",
      code: "123456",
      expiresAt: at(ACCOUNT_LIMITS.codeTtlMs),
    });
  });

  it("refuses an invalid address, then a disposable one, then the IP quota, in that order", () => {
    expect(decideCodeRequest(facts({ email: undefined, ipCodesLastHour: 10 }), T0, fakeRandom())).toEqual({
      kind: "refused",
      reason: "emailInvalid",
    });
    expect(decideCodeRequest(facts({ email: "x@yopmail.com", ipCodesLastHour: 10 }), T0, fakeRandom())).toEqual({
      kind: "refused",
      reason: "disposable",
    });
    expect(decideCodeRequest(facts({ ipCodesLastHour: 10, blocked: true }), T0, fakeRandom())).toEqual({
      kind: "refused",
      reason: "rate",
    });
  });

  it.each([
    ["a blocked e-mail", { blocked: true }],
    ["the e-mail quota", { emailCodesLastHour: 3 }],
    ["the 60-second cooldown", { lastCodeAt: at(-59_999) }],
    ["20 wrong tries in 24 hours", { wrongTriesLastDay: 20 }],
  ])("answers silently for %s", (_, overrides) => {
    expect(decideCodeRequest(facts(overrides), T0, fakeRandom())).toEqual({ kind: "silent" });
  });

  it("still issues a code at 19 wrong tries", () => {
    expect(decideCodeRequest(facts({ wrongTriesLastDay: 19 }), T0, fakeRandom()).kind).toBe("issue");
  });

  it("issues again once the cooldown is over", () => {
    expect(decideCodeRequest(facts({ lastCodeAt: at(-60_000) }), T0, fakeRandom()).kind).toBe("issue");
  });
});

describe("checkCode", () => {
  const pending = { triesLeft: 5, expiresAt: at(1000) };

  it("accepts a matching code in time", () => {
    expect(checkCode(pending, true, T0)).toEqual({ kind: "accepted" });
  });

  it("counts a wrong try down", () => {
    expect(checkCode(pending, false, T0)).toEqual({ kind: "refused", reason: "wrong", triesLeft: 4 });
  });

  it("invalidates the code on the fifth wrong try", () => {
    expect(checkCode({ ...pending, triesLeft: 1 }, false, T0)).toEqual({ kind: "refused", reason: "exhausted", triesLeft: 0 });
  });

  it("refuses an exhausted code even when it matches", () => {
    expect(checkCode({ ...pending, triesLeft: 0 }, true, T0)).toEqual({ kind: "refused", reason: "exhausted", triesLeft: 0 });
  });

  it("refuses an expired code even when it matches", () => {
    expect(checkCode(pending, true, at(1000))).toEqual({ kind: "refused", reason: "expired", triesLeft: 0 });
  });
});

describe("linkAccount", () => {
  it("creates an account on the first valid code and links the session", () => {
    const { state, sessionId } = withSession();
    const result = linkAccount(state, { sessionId, email: "nath@example.org", remember: false, blocked: false }, T0, fakeRandom());

    expect(result).toMatchObject({ kind: "linked", created: true, account: { email: "nath@example.org", verifiedAt: T0, strikes: [] } });
    if (result.kind !== "linked") return;
    expect(result.deviceClaim).toBeUndefined();
    expect(result.state.sessions.get(sessionId)?.accountId).toBe(result.account.id);
  });

  it("links an existing account and refreshes its last use", () => {
    const { state, sessionId } = withSession();
    const result = linkAccount(state, {
      sessionId,
      email: "nath@example.org",
      remember: false,
      blocked: false,
      existing: account(),
    }, T0, fakeRandom());

    expect(result).toMatchObject({ kind: "linked", created: false, account: { id: "acc1", lastSeenAt: T0 } });
  });

  it("restores strikes still running from a carry-over (BR-080)", () => {
    const { state, sessionId } = withSession();
    const result = linkAccount(state, {
      sessionId,
      email: "nath@example.org",
      remember: false,
      blocked: false,
      carryOver: { strikeExpiries: [at(-1), at(5000)] },
    }, T0, fakeRandom());

    expect(result.kind === "linked" && result.account.strikes).toEqual([{ expiresAt: at(5000) }]);
  });

  it("issues a single device claim valid 60 seconds when asked to remember", () => {
    const { state, sessionId } = withSession();
    const result = linkAccount(state, { sessionId, email: "nath@example.org", remember: true, blocked: false }, T0, fakeRandom());

    if (result.kind !== "linked") throw new Error("expected linked");
    expect(result.deviceClaim).toBe("t2");
    expect(result.state.deviceClaims.get("h(t2)")).toEqual({
      accountId: result.account.id,
      sessionId,
      expiresAt: at(ACCOUNT_LIMITS.claimTtlMs),
    });
  });

  it("refuses a blocked e-mail and a session that is gone or away", () => {
    const { state, sessionId } = withSession();
    const command = { sessionId, email: "nath@example.org", remember: false, blocked: false };

    expect(linkAccount(state, { ...command, blocked: true }, T0, fakeRandom())).toEqual({ kind: "refused", reason: "blocked" });
    expect(linkAccount(state, { ...command, sessionId: "nobody" }, T0, fakeRandom())).toEqual({ kind: "refused", reason: "gone" });
    const away = socketLost(state, sessionId, T0).state;
    expect(linkAccount(away, command, T0, fakeRandom())).toEqual({ kind: "refused", reason: "gone" });
  });
});

describe("redeemDeviceClaim", () => {
  const claimed = () => {
    const { state, sessionId } = withSession();
    const result = linkAccount(state, { sessionId, email: "nath@example.org", remember: true, blocked: false }, T0, fakeRandom());
    if (result.kind !== "linked") throw new Error("expected linked");
    return { state: result.state, sessionId, accountId: result.account.id };
  };

  it("redeems once, issues a 30-day token and stores its hash on the session", () => {
    const { state, sessionId, accountId } = claimed();
    const random = fakeRandom();
    const result = redeemDeviceClaim(state, "h(t2)", at(1000), random);

    expect(result).toMatchObject({ kind: "redeemed", accountId, token: { value: "t1" }, expiresAt: at(1000 + ACCOUNT_LIMITS.deviceTtlMs) });
    if (result.kind !== "redeemed") return;
    expect(result.state.sessions.get(sessionId)?.deviceTokenHash).toBe("h(t1)");
    expect(redeemDeviceClaim(result.state, "h(t2)", at(1000), random).kind).toBe("refused");
  });

  it("refuses an expired claim and forgets it", () => {
    const { state } = claimed();
    const result = redeemDeviceClaim(state, "h(t2)", at(ACCOUNT_LIMITS.claimTtlMs), fakeRandom());

    expect(result.kind).toBe("refused");
    expect(result.state.deviceClaims.size).toBe(0);
  });

  it("refuses an unknown claim", () => {
    const { state } = claimed();
    expect(redeemDeviceClaim(state, "h(nope)", T0, fakeRandom())).toEqual({ kind: "refused", state });
  });

  it("still issues the token when the session moved to another account, without touching it", () => {
    const { state, sessionId } = claimed();
    const session = state.sessions.get(sessionId);
    if (!session) throw new Error("setup");
    const moved = { ...state, sessions: new Map(state.sessions).set(sessionId, { ...session, accountId: "other" }) };
    const result = redeemDeviceClaim(moved, "h(t2)", T0, fakeRandom());

    expect(result.kind).toBe("redeemed");
    expect(result.state.sessions.get(sessionId)?.deviceTokenHash).toBeUndefined();
  });
});

describe("unlinkSessions", () => {
  const linked = () => {
    const { state, sessionId } = withSession();
    const session = state.sessions.get(sessionId);
    if (!session) throw new Error("setup");
    const next = { ...state, sessions: new Map(state.sessions).set(sessionId, { ...session, accountId: "acc1", deviceTokenHash: "dev1" }) };
    return { state: next, sessionId };
  };

  it.each([
    ["session", (sessionId: string) => ({ by: "session" as const, sessionId })],
    ["device", () => ({ by: "device" as const, tokenHash: "dev1" })],
    ["account", () => ({ by: "account" as const, accountId: "acc1" })],
  ])("unlinks by %s and clears the device hash", (_, filter) => {
    const { state, sessionId } = linked();
    const result = unlinkSessions(state, filter(sessionId));

    expect(result.unlinked).toEqual([sessionId]);
    expect(result.state.sessions.get(sessionId)).toMatchObject({ accountId: undefined, deviceTokenHash: undefined });
  });

  it("leaves the state unchanged when nothing matches", () => {
    const { state } = linked();
    expect(unlinkSessions(state, { by: "account", accountId: "other" })).toEqual({ state, unlinked: [] });
    const { state: guest, sessionId } = withSession();
    expect(unlinkSessions(guest, { by: "session", sessionId }).unlinked).toEqual([]);
  });

  it("unlinks away sessions too", () => {
    const { state, sessionId } = linked();
    const away = socketLost(state, sessionId, T0).state;
    expect(unlinkSessions(away, { by: "account", accountId: "acc1" }).unlinked).toEqual([sessionId]);
  });
});

describe("closeAccount", () => {
  it("returns the vault record: id, e-mail, verification and closing dates (BR-081)", () => {
    expect(closeAccount(account(), T0)).toEqual({
      vault: { accountId: "acc1", email: "nath@example.org", createdAt: at(-1000), closedAt: T0 },
    });
  });

  it("keeps the active strike expiries as a carry-over (BR-080)", () => {
    expect(closeAccount(account({ strikes: [{ expiresAt: at(-1) }, { expiresAt: at(10) }] }), T0).carryOver).toEqual({
      strikeExpiries: [at(10)],
    });
  });
});

describe("pruneDeviceClaims", () => {
  it("drops expired claims and keeps the state when none expired", () => {
    const { state, sessionId } = withSession();
    const result = linkAccount(state, { sessionId, email: "nath@example.org", remember: true, blocked: false }, T0, fakeRandom());
    if (result.kind !== "linked") throw new Error("setup");

    expect(pruneDeviceClaims(result.state, at(1))).toBe(result.state);
    expect(pruneDeviceClaims(result.state, at(ACCOUNT_LIMITS.claimTtlMs)).deviceClaims.size).toBe(0);
  });
});
