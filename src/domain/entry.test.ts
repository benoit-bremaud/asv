import { describe, expect, it } from "vitest";
import {
  bufferPrivate,
  emptyEntryState,
  enter,
  ENTRY_LIMITS,
  expireAway,
  leave,
  pruneEntryAttempts,
  resume,
  socketLost,
  type BufferedMessage,
  type EnterCommand,
  type EntryState,
  type Random,
  type ResumeCommand,
} from "./entry";

const T0 = new Date("2026-10-23T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Deterministic stand-in for the hub's random source and token hashing. */
const fakeRandom = (): Random => {
  let n = 0;
  return {
    id: () => `s${++n}`,
    token: () => {
      n += 1;
      return { value: `t${n}`, hash: `h(t${n})` };
    },
  };
};

const form = (overrides: Partial<EnterCommand> = {}): EnterCommand => ({
  pseudo: "nath_lune",
  age: 30,
  adultConfirmed: true,
  termsAccepted: true,
  ip: "203.0.113.1",
  ...overrides,
});

const resumeWith = (resumeTokenHash: string, overrides: Partial<ResumeCommand> = {}): ResumeCommand => ({
  resumeTokenHash,
  ip: "198.51.100.7",
  age: 31,
  accountStillExists: true,
  ...overrides,
});

const entered = (overrides: Partial<EnterCommand> = {}, random = fakeRandom()) => {
  const result = enter(emptyEntryState(), form(overrides), T0, random);
  const effect = result.effects[0];
  if (effect?.type !== "entered") throw new Error("entry refused in fixture");
  return { state: result.state, sessionId: effect.sessionId, token: effect.resumeToken, random };
};

const awaySession = (overrides: Partial<EnterCommand> = {}) => {
  const base = entered(overrides);
  return { ...base, state: socketLost(base.state, base.sessionId, T0).state };
};

/** A random whose next token is distinct from the fixture's `t1`. */
const rotatingRandom: Random = { id: () => "x", token: () => ({ value: "new", hash: "h(new)" }) };

const message = (text: string): BufferedMessage => ({
  conversationId: "c1",
  authorSessionId: "other",
  text,
  sentAt: T0,
});

describe("UC1 enter", () => {
  it("creates a connected session and returns the token once, keeping only its hash", () => {
    const { state, sessionId, token } = entered({ city: "  Lyon  ", accountId: "acc1" });
    const session = state.sessions.get(sessionId);

    expect(token).toBe("t1");
    expect(session).toMatchObject({
      pseudo: "nath_lune",
      status: "connected",
      resumeTokenHash: "h(t1)",
      accountId: "acc1",
      profile: { gender: "unspecified", age: 30, city: "Lyon" },
    });
    expect(state.pseudoIndex.get("nath_lune")).toBe(sessionId);
  });

  it("does not mutate the input state", () => {
    const state = emptyEntryState();
    enter(state, form(), T0, fakeRandom());

    expect(state.sessions.size).toBe(0);
    expect(state.entryAttempts.size).toBe(0);
  });
});

describe("BR-001 / BR-003 pseudo refused", () => {
  it.each(["ab", "Неlene", "Modo_du_soir"])("refuses %s as pseudoInvalid", (pseudo) => {
    const result = enter(emptyEntryState(), form({ pseudo }), T0, fakeRandom());

    expect(result.effects).toEqual([{ type: "entryRefused", reason: "pseudoInvalid" }]);
    expect(result.state.sessions.size).toBe(0);
  });
});

describe("BR-002 pseudo unique", () => {
  it("refuses a pseudo taken by a connected session, ignoring case and accents", () => {
    const { state, random } = entered({ pseudo: "Hélène" });
    const result = enter(state, form({ pseudo: "HELENE", ip: "198.51.100.2" }), T0, random);

    expect(result.effects).toEqual([{ type: "entryRefused", reason: "pseudoTaken" }]);
  });

  it("refuses a pseudo held by an away session", () => {
    const { state } = awaySession();
    const result = enter(state, form({ ip: "198.51.100.2" }), T0, fakeRandom());

    expect(result.effects).toEqual([{ type: "entryRefused", reason: "pseudoTaken" }]);
  });
});

describe("BR-004 adults only", () => {
  it.each([
    { adultConfirmed: false, age: 30 },
    { adultConfirmed: true, age: 17 },
    { adultConfirmed: true, age: 100 },
    { adultConfirmed: true, age: 18.5 },
  ])("refuses %o", (overrides) => {
    const result = enter(emptyEntryState(), form(overrides), T0, fakeRandom());

    expect(result.effects).toEqual([{ type: "entryRefused", reason: "age" }]);
  });

  it.each([18, 99])("accepts age %i", (age) => {
    expect(enter(emptyEntryState(), form({ age }), T0, fakeRandom()).effects[0]?.type).toBe("entered");
  });
});

describe("BR-005 gender", () => {
  it.each(["woman", "man", "unspecified"] as const)("keeps the declared gender %s", (gender) => {
    const { state, sessionId } = entered({ gender });

    expect(state.sessions.get(sessionId)).toMatchObject({ profile: { gender } });
  });
});

describe("UC1 check order", () => {
  it.each([
    { overrides: { activeBan: { until: at(1000) }, pseudo: "ab", age: 12 }, reason: "banned" },
    { overrides: { pseudo: "ab", age: 12, termsAccepted: false }, reason: "pseudoInvalid" },
    { overrides: { age: 12, termsAccepted: false }, reason: "age" },
  ])("reports $reason first", ({ overrides, reason }) => {
    expect(enter(emptyEntryState(), form(overrides), T0, fakeRandom()).effects[0]).toMatchObject({ reason });
  });

  it("stores a decomposed pseudo in NFC so it collides with the composed one", () => {
    const { state, sessionId, random } = entered({ pseudo: "Ce\u0301line" });

    expect(state.sessions.get(sessionId)?.pseudo).toBe("C\u00e9line");
    expect(enter(state, form({ pseudo: "celine", ip: "198.51.100.2" }), T0, random).effects[0]).toMatchObject({
      reason: "pseudoTaken",
    });
  });
});

describe("BR-006 city and terms", () => {
  it("accepts a 40-character city after trimming", () => {
    const city = ` ${"x".repeat(ENTRY_LIMITS.maxCityLength)} `;

    expect(enter(emptyEntryState(), form({ city }), T0, fakeRandom()).effects[0]?.type).toBe("entered");
  });

  it.each([{ city: "x".repeat(41) }, { termsAccepted: false }])("refuses %o as invalid", (overrides) => {
    const result = enter(emptyEntryState(), form(overrides), T0, fakeRandom());

    expect(result.effects).toEqual([{ type: "invalid" }]);
    expect(result.state.sessions.size).toBe(0);
  });
});

describe("BR-007 entry rate", () => {
  const attempts = (count: number, state: EntryState = emptyEntryState()) => {
    let current = state;
    for (let i = 0; i < count; i += 1) {
      current = enter(current, form({ pseudo: "ab" }), at(i * 1000), fakeRandom()).state;
    }
    return current;
  };

  it("refuses the sixth attempt within a minute, even with a valid form", () => {
    const result = enter(attempts(5), form(), at(10_000), fakeRandom());

    expect(result.effects).toEqual([{ type: "entryRefused", reason: "rate" }]);
  });

  it("keeps refusing while attempts continue, and counts per IP", () => {
    const hammered = enter(attempts(5), form(), at(10_000), fakeRandom()).state;

    expect(enter(hammered, form(), at(60_500), fakeRandom()).effects[0]).toMatchObject({ reason: "rate" });
    expect(enter(hammered, form({ ip: "198.51.100.9" }), at(10_000), fakeRandom()).effects[0]?.type).toBe(
      "entered",
    );
  });

  it("accepts a fifth attempt and counts accepted entries", () => {
    const afterFour = attempts(4);
    const fifth = enter(afterFour, form(), at(5_000), fakeRandom());

    expect(fifth.effects[0]?.type).toBe("entered");
    expect(enter(fifth.state, form({ pseudo: "other" }), at(6_000), fakeRandom()).effects[0]).toMatchObject({
      reason: "rate",
    });
  });

  it("drops an attempt exactly 60 seconds old", () => {
    expect(enter(attempts(5), form(), at(60_000), fakeRandom()).effects[0]?.type).toBe("entered");
  });

  it("forgets idle IPs when pruned, and keeps recent ones", () => {
    const state = attempts(1);

    expect(pruneEntryAttempts(state, at(59_999))).toBe(state);
    expect(pruneEntryAttempts(state, at(60_000)).entryAttempts.size).toBe(0);
  });

  it("allows a new attempt once a minute has passed", () => {
    expect(enter(attempts(5), form(), at(64_001), fakeRandom()).effects[0]?.type).toBe("entered");
  });
});

describe("BR-008 active ban", () => {
  it("refuses with the ban end time", () => {
    const until = at(3_600_000);
    const result = enter(emptyEntryState(), form({ activeBan: { until } }), T0, fakeRandom());

    expect(result.effects).toEqual([{ type: "entryRefused", reason: "banned", bannedUntil: until }]);
  });

  it("ignores a ban that has ended", () => {
    const result = enter(emptyEntryState(), form({ activeBan: { until: T0 } }), T0, fakeRandom());

    expect(result.effects[0]?.type).toBe("entered");
  });
});

describe("BR-011 / BR-012 socket lost", () => {
  it("marks the session away for 5 minutes and keeps its pseudo", () => {
    const { state, sessionId } = entered();
    const result = socketLost(state, sessionId, T0);

    expect(result.effects).toEqual([
      { type: "wentAway", sessionId, pseudo: "nath_lune", awayUntil: at(ENTRY_LIMITS.awayMs) },
    ]);
    expect(result.state.sessions.get(sessionId)).toEqual({
      id: sessionId,
      pseudo: "nath_lune",
      accountId: undefined,
      resumeTokenHash: "h(t1)",
      status: "away",
      awayUntil: at(ENTRY_LIMITS.awayMs),
      buffered: [],
    });
    expect(result.state.pseudoIndex.has("nath_lune")).toBe(true);
  });

  it("does nothing for an unknown or already away session", () => {
    const { state, sessionId } = awaySession();

    expect(socketLost(state, sessionId, T0).effects).toEqual([]);
    expect(socketLost(state, "nope", T0).state).toBe(state);
  });
});

describe("BR-013 private buffer", () => {
  it("keeps the newest 50 messages, oldest dropped first", () => {
    const { state, sessionId } = awaySession();
    let current = state;
    for (let i = 1; i <= 52; i += 1) current = bufferPrivate(current, sessionId, message(`m${i}`)).state;
    const session = current.sessions.get(sessionId);
    const buffered = session?.status === "away" ? session.buffered : [];

    expect(buffered).toHaveLength(ENTRY_LIMITS.maxBuffered);
    expect(buffered[0]?.text).toBe("m3");
    expect(buffered.at(-1)?.text).toBe("m52");
  });

  it("buffers nothing for a connected session", () => {
    const { state, sessionId } = entered();

    expect(bufferPrivate(state, sessionId, message("hi")).state).toBe(state);
  });
});

describe("BR-014 resume", () => {
  it("resumes with the current token, rotates it and returns the buffer", () => {
    const away = awaySession({ accountId: "acc1" });
    const state = bufferPrivate(away.state, away.sessionId, message("hello")).state;
    const result = resume(state, resumeWith("h(t1)", { city: "Paris" }), at(60_000), rotatingRandom);
    const session = result.state.sessions.get(away.sessionId);

    expect(result.effects).toEqual([
      { type: "resumed", sessionId: away.sessionId, resumeToken: "new", buffered: [message("hello")], accountUnlinked: false },
    ]);
    expect(session).toMatchObject({ status: "connected", resumeTokenHash: "h(new)", accountId: "acc1" });
    expect(session).toMatchObject({ profile: { gender: "unspecified", age: 31, city: "Paris" } });
    expect(session).toMatchObject({ ip: "198.51.100.7", openedAt: at(60_000) });
    expect(session).not.toHaveProperty("awayUntil");
  });

  it("refuses the previous token after a resume", () => {
    const away = awaySession();
    const random = rotatingRandom;
    const resumed = resume(away.state, resumeWith("h(t1)"), T0, random).state;
    const lostAgain = socketLost(resumed, away.sessionId, T0).state;

    expect(resume(lostAgain, resumeWith("h(t1)"), T0, random).effects).toEqual([{ type: "resumeRefused" }]);
    expect(resume(lostAgain, resumeWith("h(new)"), T0, random).effects[0]?.type).toBe("resumed");
  });

  it("refuses an unknown token or a connected session", () => {
    const { state } = entered();

    expect(resume(state, resumeWith("h(t1)"), T0, fakeRandom()).effects).toEqual([{ type: "resumeRefused" }]);
    expect(resume(state, resumeWith("h(zz)"), T0, fakeRandom()).effects).toEqual([{ type: "resumeRefused" }]);
  });

  it.each([{ age: 12 }, { age: 30, city: "x".repeat(41) }])("refuses a resumed profile %o as invalid", (profile) => {
    const away = awaySession();
    const result = resume(away.state, resumeWith("h(t1)", profile), T0, rotatingRandom);

    expect(result.effects).toEqual([{ type: "invalid" }]);
    expect(result.state).toBe(away.state);
  });

  it("accepts a resume one millisecond before the deadline", () => {
    const away = awaySession();

    expect(resume(away.state, resumeWith("h(t1)"), at(ENTRY_LIMITS.awayMs - 1), rotatingRandom).effects[0]?.type).toBe(
      "resumed",
    );
  });

  it("unlinks an account deleted while away", () => {
    const away = awaySession({ accountId: "acc1" });
    const result = resume(away.state, resumeWith("h(t1)", { accountStillExists: false }), T0, fakeRandom());

    expect(result.effects[0]).toMatchObject({ accountUnlinked: true });
    expect(result.state.sessions.get(away.sessionId)?.accountId).toBeUndefined();
  });
});

describe("BR-015 away expiry", () => {
  it("refuses a resume once the deadline is reached", () => {
    const away = awaySession();

    expect(resume(away.state, resumeWith("h(t1)"), at(ENTRY_LIMITS.awayMs), fakeRandom()).effects).toEqual([
      { type: "resumeRefused" },
    ]);
  });

  it("closes only the away sessions past their deadline", () => {
    const random = fakeRandom();
    let state = enter(emptyEntryState(), form({ pseudo: "early" }), T0, random).state;
    state = enter(state, form({ pseudo: "late" }), T0, random).state;
    state = enter(state, form({ pseudo: "here" }), T0, random).state;
    const id = (pseudo: string) => state.pseudoIndex.get(pseudo) ?? "";
    state = socketLost(state, id("early"), T0).state;
    state = socketLost(state, id("late"), at(1000)).state;
    const result = expireAway(state, at(ENTRY_LIMITS.awayMs));

    expect(result.effects).toEqual([{ type: "closed", sessionId: id("early"), pseudo: "early" }]);
    expect([...result.state.pseudoIndex.keys()].sort()).toEqual(["here", "late"]);
  });

  it("closes expired away sessions and frees their pseudo", () => {
    const away = awaySession();
    const before = expireAway(away.state, at(ENTRY_LIMITS.awayMs - 1));
    const after = expireAway(away.state, at(ENTRY_LIMITS.awayMs));

    expect(before.effects).toEqual([]);
    expect(after.effects).toEqual([{ type: "closed", sessionId: away.sessionId, pseudo: "nath_lune" }]);
    expect(after.state.sessions.size).toBe(0);
    expect(after.state.pseudoIndex.size).toBe(0);
  });
});

describe("UC10 leave", () => {
  it("closes the session and frees the pseudo for a new visitor", () => {
    const { state, sessionId } = entered();
    const result = leave(state, sessionId);

    expect(result.effects).toEqual([{ type: "closed", sessionId, pseudo: "nath_lune" }]);
    expect(enter(result.state, form({ ip: "198.51.100.2" }), T0, fakeRandom()).effects[0]?.type).toBe("entered");
  });

  it("closes an away session too", () => {
    const { state, sessionId } = awaySession();

    expect(leave(state, sessionId).state.sessions.size).toBe(0);
  });

  it("does nothing for an unknown session", () => {
    const state = emptyEntryState();

    expect(leave(state, "nope")).toEqual({ state, effects: [] });
  });
});
