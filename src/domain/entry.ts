/**
 * Entry, away, resume and leave (UC1, UC10, UC13), study `entry/07-class-domain-api`.
 * Every function is pure: `(state, command, now, random) → { state, effects }`.
 */
import { canonicalPseudo, containsReservedWord, foldPseudo, hasValidPseudoFormat } from "./pseudo";

/** V1 values of BR-004, BR-006, BR-007, BR-011 and BR-013, tunable here only. */
export const ENTRY_LIMITS = {
  minAge: 18,
  maxAge: 99,
  maxCityLength: 40,
  attemptsPerWindow: 5,
  attemptWindowMs: 60_000,
  awayMs: 5 * 60_000,
  maxBuffered: 50,
} as const;

/** BR-005. */
export type Gender = "woman" | "man" | "unspecified";

/** Self-declared, kept in memory only (ADR-0011). */
export interface Profile {
  readonly gender: Gender;
  readonly age: number;
  readonly city: string;
}

/** Closed sessions are removed, not a status (`entry/04`). */
export type SessionStatus = "connected" | "away";

/** A private message kept for an away session (BR-013). */
export interface BufferedMessage {
  readonly conversationId: string;
  readonly authorSessionId: string;
  readonly text: string;
  readonly sentAt: Date;
}

/** A chatter's session; `ip` and `openedAt` feed the hub's connection line (BR-060). */
export interface Session {
  readonly id: string;
  readonly pseudo: string;
  readonly status: SessionStatus;
  readonly profile: Profile;
  readonly ip: string;
  readonly openedAt: Date;
  /** Set when linked to an account (ADR-0012). */
  readonly accountId?: string;
  readonly resumeTokenHash: string;
  /** Set only while away (BR-011). */
  readonly awayUntil?: Date;
  readonly buffered: readonly BufferedMessage[];
}

/** The entry part of the hub state (`platform/04b`). `pseudoIndex` is keyed by folded pseudo. */
export interface EntryState {
  readonly sessions: ReadonlyMap<string, Session>;
  readonly pseudoIndex: ReadonlyMap<string, string>;
  readonly entryAttempts: ReadonlyMap<string, readonly Date[]>;
}

/** A resume token drawn by the hub, with its hash; only the hash is kept (BR-014). */
export interface IssuedToken {
  readonly value: string;
  readonly hash: string;
}

/** Randomness and token hashing, supplied by the hub so the domain stays deterministic. */
export interface Random {
  id(): string;
  token(): IssuedToken;
}

/** UC1 form plus what the hub looked up. Raw strings are bounded by the protocol layer (#13). */
export interface EnterCommand {
  readonly pseudo: string;
  readonly gender?: Gender;
  readonly age: number;
  readonly city?: string;
  readonly adultConfirmed: boolean;
  readonly termsAccepted: boolean;
  readonly ip: string;
  /** Looked up by the hub (BR-008). */
  readonly activeBan?: { readonly until: Date };
  /** Account behind a valid device cookie, if any (ADR-0013). */
  readonly accountId?: string;
}

/** UC13: the client resends its profile, never stored (ADR-0011). */
export interface ResumeCommand {
  /** Hash of the token the client sent, computed by the hub like `Random.token`. */
  readonly resumeTokenHash: string;
  readonly gender?: Gender;
  readonly age: number;
  readonly city?: string;
  readonly accountStillExists: boolean;
}

/** Mirrors the protocol `entryRefusal` enum. */
export type EntryRefusal = "rate" | "banned" | "pseudoInvalid" | "pseudoTaken" | "age";

/** What the hub must do next; it maps each effect to protocol messages and storage. */
export type Effect =
  | { readonly type: "entered"; readonly sessionId: string; readonly resumeToken: string; readonly accountId?: string }
  | { readonly type: "entryRefused"; readonly reason: EntryRefusal; readonly bannedUntil?: Date }
  | { readonly type: "invalid" }
  | { readonly type: "wentAway"; readonly sessionId: string; readonly pseudo: string; readonly awayUntil: Date }
  | {
      readonly type: "resumed";
      readonly sessionId: string;
      readonly resumeToken: string;
      readonly buffered: readonly BufferedMessage[];
      readonly accountUnlinked: boolean;
    }
  | { readonly type: "resumeRefused" }
  | { readonly type: "closed"; readonly sessionId: string; readonly pseudo: string };

/** Output of every domain function. */
export interface Result {
  readonly state: EntryState;
  readonly effects: readonly Effect[];
}

/** State of a fresh hub. */
export const emptyEntryState = (): EntryState => ({
  sessions: new Map(),
  pseudoIndex: new Map(),
  entryAttempts: new Map(),
});

/** Wraps a new (or the same) state and its effects. */
const result = (state: EntryState, ...effects: Effect[]): Result => ({ state, effects });

const withSession = (state: EntryState, session: Session): EntryState => ({
  ...state,
  sessions: new Map(state.sessions).set(session.id, session),
});

const withoutSession = (state: EntryState, session: Session): EntryState => {
  const sessions = new Map(state.sessions);
  sessions.delete(session.id);
  const pseudoIndex = new Map(state.pseudoIndex);
  pseudoIndex.delete(foldPseudo(session.pseudo));
  return { ...state, sessions, pseudoIndex };
};

/** BR-007: keeps the last minute of attempts from `ip`, this one included. */
const recordAttempt = (state: EntryState, ip: string, now: Date): { state: EntryState; earlier: number } => {
  const since = now.getTime() - ENTRY_LIMITS.attemptWindowMs;
  const recent = (state.entryAttempts.get(ip) ?? []).filter((at) => at.getTime() > since);
  return {
    // Capped: a refused client only needs to stay at the limit, not grow the list.
    state: {
      ...state,
      entryAttempts: new Map(state.entryAttempts).set(ip, [...recent, now].slice(-ENTRY_LIMITS.attemptsPerWindow)),
    },
    earlier: recent.length,
  };
};

const isAdultAge = (age: number): boolean =>
  Number.isInteger(age) && age >= ENTRY_LIMITS.minAge && age <= ENTRY_LIMITS.maxAge;

/** BR-006, counted in characters (code points), not UTF-16 units. */
const isCityTooLong = (city: string | undefined): boolean =>
  [...(city ?? "").trim()].length > ENTRY_LIMITS.maxCityLength;

/** Terms and BR-006 failures only come from a modified client (`entry/07`). */
const formRefusal = (command: EnterCommand): EntryRefusal | "invalid" | undefined => {
  if (!command.adultConfirmed || !isAdultAge(command.age)) return "age";
  if (!command.termsAccepted || isCityTooLong(command.city)) return "invalid";
  return undefined;
};

/** Profile as stored: gender defaults to unspecified (BR-005), city trimmed (BR-006). */
const toProfile = (input: { gender?: Gender; age: number; city?: string }): Profile => ({
  gender: input.gender ?? "unspecified",
  age: input.age,
  city: (input.city ?? "").trim(),
});

/** UC1: checks run in the order of the study, the first failure wins. */
export const enter = (state: EntryState, command: EnterCommand, now: Date, random: Random): Result => {
  const attempt = recordAttempt(state, command.ip, now);
  const counted = attempt.state;
  if (attempt.earlier >= ENTRY_LIMITS.attemptsPerWindow) {
    return result(counted, { type: "entryRefused", reason: "rate" });
  }
  if (command.activeBan && command.activeBan.until.getTime() > now.getTime()) {
    return result(counted, { type: "entryRefused", reason: "banned", bannedUntil: command.activeBan.until });
  }
  const pseudo = canonicalPseudo(command.pseudo);
  if (!hasValidPseudoFormat(pseudo) || containsReservedWord(pseudo)) {
    return result(counted, { type: "entryRefused", reason: "pseudoInvalid" });
  }
  const key = foldPseudo(pseudo);
  if (counted.pseudoIndex.has(key)) {
    return result(counted, { type: "entryRefused", reason: "pseudoTaken" });
  }
  const refusal = formRefusal(command);
  if (refusal === "invalid") return result(counted, { type: "invalid" });
  if (refusal) return result(counted, { type: "entryRefused", reason: refusal });

  const token = random.token();
  const session: Session = {
    id: random.id(),
    pseudo,
    status: "connected",
    profile: toProfile(command),
    ip: command.ip,
    openedAt: now,
    accountId: command.accountId,
    resumeTokenHash: token.hash,
    buffered: [],
  };
  const next = withSession({ ...counted, pseudoIndex: new Map(counted.pseudoIndex).set(key, session.id) }, session);
  return result(next, {
    type: "entered",
    sessionId: session.id,
    resumeToken: token.value,
    accountId: session.accountId,
  });
};

/** BR-011, BR-012: a connected session becomes away and keeps its pseudo. */
export const socketLost = (state: EntryState, sessionId: string, now: Date): Result => {
  const session = state.sessions.get(sessionId);
  if (session?.status !== "connected") return result(state);
  const awayUntil = new Date(now.getTime() + ENTRY_LIMITS.awayMs);
  return result(withSession(state, { ...session, status: "away", awayUntil }), {
    type: "wentAway",
    sessionId,
    pseudo: session.pseudo,
    awayUntil,
  });
};

/** BR-014: the current token resumes an away session once, then a new one is issued. */
export const resume = (state: EntryState, command: ResumeCommand, now: Date, random: Random): Result => {
  const session = [...state.sessions.values()].find(
    (candidate) => candidate.status === "away" && candidate.resumeTokenHash === command.resumeTokenHash,
  );
  if (!session?.awayUntil || session.awayUntil.getTime() <= now.getTime()) {
    return result(state, { type: "resumeRefused" });
  }
  if (!isAdultAge(command.age) || isCityTooLong(command.city)) return result(state, { type: "invalid" });
  const token = random.token();
  const accountUnlinked = session.accountId !== undefined && !command.accountStillExists;
  const resumed: Session = {
    ...session,
    status: "connected",
    profile: toProfile(command),
    accountId: accountUnlinked ? undefined : session.accountId,
    resumeTokenHash: token.hash,
    awayUntil: undefined,
    buffered: [],
  };
  return result(withSession(state, resumed), {
    type: "resumed",
    sessionId: session.id,
    resumeToken: token.value,
    buffered: session.buffered,
    accountUnlinked,
  });
};

/** UC10: removes a connected or away session and frees its pseudo. */
export const leave = (state: EntryState, sessionId: string): Result => {
  const session = state.sessions.get(sessionId);
  if (!session) return result(state);
  return result(withoutSession(state, session), { type: "closed", sessionId, pseudo: session.pseudo });
};

/** BR-015: closes every away session whose deadline has passed. Called from the hub alarm. */
export const expireAway = (state: EntryState, now: Date): Result => {
  const expired = [...state.sessions.values()].filter(
    (session) => session.status === "away" && session.awayUntil && session.awayUntil.getTime() <= now.getTime(),
  );
  return expired.reduce<Result>(
    (acc, session) => ({
      state: withoutSession(acc.state, session),
      effects: [...acc.effects, { type: "closed", sessionId: session.id, pseudo: session.pseudo }],
    }),
    result(state),
  );
};

/** BR-013: keeps the newest 50 private messages of an away session. */
export const bufferPrivate = (state: EntryState, sessionId: string, message: BufferedMessage): Result => {
  const session = state.sessions.get(sessionId);
  if (session?.status !== "away") return result(state);
  const buffered = [...session.buffered, message].slice(-ENTRY_LIMITS.maxBuffered);
  return result(withSession(state, { ...session, buffered }));
};

/** BR-007: forgets IPs with no attempt in the last minute. Called from the hub alarm. */
export const pruneEntryAttempts = (state: EntryState, now: Date): EntryState => {
  const since = now.getTime() - ENTRY_LIMITS.attemptWindowMs;
  const kept = [...state.entryAttempts].filter(([, attempts]) => attempts.some((at) => at.getTime() > since));
  return kept.length === state.entryAttempts.size ? state : { ...state, entryAttempts: new Map(kept) };
};
