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
export type SessionStatus = Session["status"];

/** A private message kept for an away session (BR-013). */
export interface BufferedMessage {
  readonly conversationId: string;
  readonly authorSessionId: string;
  readonly text: string;
  readonly sentAt: Date;
}

/** Fields a session keeps in both states. */
interface SessionBase {
  readonly id: string;
  readonly pseudo: string;
  /** Set when linked to an account (ADR-0012). */
  readonly accountId?: string;
  /** Hash of the device cookie that linked or remembered this session (ADR-0013). */
  readonly deviceTokenHash?: string;
  readonly resumeTokenHash: string;
  /** Ids of the rooms joined (BR-012, `rooms/07`). */
  readonly rooms: readonly string[];
}

/** A live session; `ip` and `openedAt` feed the hub's connection line (BR-060). */
export interface ConnectedSession extends SessionBase {
  readonly status: "connected";
  readonly profile: Profile;
  readonly ip: string;
  readonly openedAt: Date;
}

/** Exactly the away record of ADR-0011: no profile, IP or connection data, so it rebuilds from storage. */
export interface AwaySession extends SessionBase {
  readonly status: "away";
  readonly awayUntil: Date;
  readonly buffered: readonly BufferedMessage[];
}

export type Session = ConnectedSession | AwaySession;

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
  /** Hash of that device cookie, so UC18 can sign this device out. */
  readonly deviceTokenHash?: string;
}

/** UC13: the client resends its profile, never stored (ADR-0011). */
export interface ResumeCommand {
  /** Hash of the token the client sent, computed by the hub like `Random.token`. */
  readonly resumeTokenHash: string;
  /** IP of the new socket (BR-060). */
  readonly ip: string;
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

/** Output of every domain function; `S` is the hub state the caller passed in. */
export interface Result<S extends EntryState = EntryState> {
  readonly state: S;
  readonly effects: readonly Effect[];
}

/** State of a fresh hub. */
export const emptyEntryState = (): EntryState => ({
  sessions: new Map(),
  pseudoIndex: new Map(),
  entryAttempts: new Map(),
});

/** Wraps a new (or the same) state and its effects. */
const result = <S extends EntryState>(state: S, ...effects: Effect[]): Result<S> => ({ state, effects });

const withSession = <S extends EntryState>(state: S, session: Session): S => ({
  ...state,
  sessions: new Map(state.sessions).set(session.id, session),
});

const withoutSession = <S extends EntryState>(state: S, session: Session): S => {
  const sessions = new Map(state.sessions);
  sessions.delete(session.id);
  const pseudoIndex = new Map(state.pseudoIndex);
  pseudoIndex.delete(foldPseudo(session.pseudo));
  return { ...state, sessions, pseudoIndex };
};

/** BR-007: keeps the last minute of attempts from `ip`, this one included. */
const recordAttempt = <S extends EntryState>(state: S, ip: string, now: Date): { state: S; earlier: number } => {
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
export const enter = <S extends EntryState>(state: S, command: EnterCommand, now: Date, random: Random): Result<S> => {
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
  const session: ConnectedSession = {
    id: random.id(),
    pseudo,
    status: "connected",
    profile: toProfile(command),
    ip: command.ip,
    openedAt: now,
    accountId: command.accountId,
    deviceTokenHash: command.accountId === undefined ? undefined : command.deviceTokenHash,
    resumeTokenHash: token.hash,
    rooms: [],
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
export const socketLost = <S extends EntryState>(state: S, sessionId: string, now: Date): Result<S> => {
  const session = state.sessions.get(sessionId);
  if (session?.status !== "connected") return result(state);
  const awayUntil = new Date(now.getTime() + ENTRY_LIMITS.awayMs);
  const away: AwaySession = {
    id: session.id,
    pseudo: session.pseudo,
    accountId: session.accountId,
    deviceTokenHash: session.deviceTokenHash,
    resumeTokenHash: session.resumeTokenHash,
    rooms: session.rooms,
    status: "away",
    awayUntil,
    buffered: [],
  };
  return result(withSession(state, away), {
    type: "wentAway",
    sessionId,
    pseudo: session.pseudo,
    awayUntil,
  });
};

/** BR-014: the current token resumes an away session once, then a new one is issued. */
export const resume = <S extends EntryState>(state: S, command: ResumeCommand, now: Date, random: Random): Result<S> => {
  const session = [...state.sessions.values()].find(
    (candidate): candidate is AwaySession =>
      candidate.status === "away" && candidate.resumeTokenHash === command.resumeTokenHash,
  );
  if (!session || session.awayUntil.getTime() <= now.getTime()) {
    return result(state, { type: "resumeRefused" });
  }
  if (!isAdultAge(command.age) || isCityTooLong(command.city)) return result(state, { type: "invalid" });
  const token = random.token();
  const accountUnlinked = session.accountId !== undefined && !command.accountStillExists;
  const resumed: ConnectedSession = {
    id: session.id,
    pseudo: session.pseudo,
    status: "connected",
    profile: toProfile(command),
    ip: command.ip,
    openedAt: now,
    accountId: accountUnlinked ? undefined : session.accountId,
    deviceTokenHash: accountUnlinked ? undefined : session.deviceTokenHash,
    resumeTokenHash: token.hash,
    rooms: session.rooms,
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
export const leave = <S extends EntryState>(state: S, sessionId: string): Result<S> => {
  const session = state.sessions.get(sessionId);
  if (!session) return result(state);
  return result(withoutSession(state, session), { type: "closed", sessionId, pseudo: session.pseudo });
};

/** BR-015: closes every away session whose deadline has passed. Called from the hub alarm. */
export const expireAway = <S extends EntryState>(state: S, now: Date): Result<S> => {
  const expired = [...state.sessions.values()].filter(
    (session): session is AwaySession => session.status === "away" && session.awayUntil.getTime() <= now.getTime(),
  );
  return expired.reduce<Result<S>>(
    (acc, session) => ({
      state: withoutSession(acc.state, session),
      effects: [...acc.effects, { type: "closed", sessionId: session.id, pseudo: session.pseudo }],
    }),
    result(state),
  );
};

/** BR-013: keeps the newest 50 private messages of an away session. */
export const bufferPrivate = <S extends EntryState>(state: S, sessionId: string, message: BufferedMessage): Result<S> => {
  const session = state.sessions.get(sessionId);
  if (session?.status !== "away") return result(state);
  const buffered = [...session.buffered, message].slice(-ENTRY_LIMITS.maxBuffered);
  return result(withSession(state, { ...session, buffered }));
};

/** BR-007: forgets IPs with no attempt in the last minute. Called from the hub alarm. */
export const pruneEntryAttempts = <S extends EntryState>(state: S, now: Date): S => {
  const since = now.getTime() - ENTRY_LIMITS.attemptWindowMs;
  const kept = [...state.entryAttempts].filter(([, attempts]) => attempts.some((at) => at.getTime() > since));
  return kept.length === state.entryAttempts.size ? state : { ...state, entryAttempts: new Map(kept) };
};
