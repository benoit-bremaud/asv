/**
 * Member accounts (UC17, UC18, UC19), study `accounts/07-class-domain-api`. Pure decisions: the hub loads
 * the stored records, hashes and encrypts, and writes the stores (`platform/04d`).
 */
import { DISPOSABLE_DOMAINS } from "./disposable-domains";
import type { Random, Session } from "./entry";
import type { HubState } from "./rooms";

/** V1 values of BR-070 to BR-073 and BR-081, tunable here only. Counts are plain numbers, `*Ms` are milliseconds. */
export const ACCOUNT_LIMITS = {
  maxEmailLength: 254,
  codeTtlMs: 10 * 60_000,
  codeTries: 5,
  emailCodesPerHour: 3,
  ipCodesPerHour: 10,
  cooldownMs: 60_000,
  quotaWindowMs: 60 * 60_000,
  claimTtlMs: 60_000,
  deviceTtlMs: 30 * 24 * 60 * 60_000,
  /** BR-072: wrong codes per e-mail over `wrongTryWindowMs` before codes stop (owner choice 2026-10-23). */
  wrongTriesPerDay: 20,
  wrongTryWindowMs: 24 * 60 * 60_000,
  /** BR-081: the vault keeps the account id 1 year and the record 5 years after closing (365-day years). */
  vaultIdentityMs: 365 * 24 * 60 * 60_000,
  vaultRetentionMs: 5 * 365 * 24 * 60 * 60_000,
} as const;

/** A strike as carried in brick 5; brick 8 adds who gave it and why (`accounts/04`). */
export interface Strike {
  readonly expiresAt: Date;
}

/** An account with its e-mail in clear, as the domain sees it (the hub decrypts, ADR-0017). */
export interface Account {
  readonly id: string;
  readonly email: string;
  readonly verifiedAt: Date;
  readonly lastSeenAt: Date;
  readonly strikes: readonly Strike[];
}

/** What remains of a self-deleted account with active strikes (BR-080). */
export interface StrikeCarryOver {
  readonly strikeExpiries: readonly Date[];
}

/** A device claim waiting for `POST /account/device`, kept in the hub state (BR-073). */
export interface DeviceClaim {
  readonly accountId: string;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

/** Randomness the accounts need on top of the entry `Random`. */
export interface CodeRandom extends Random {
  /** Six digits from a CSPRNG (BR-070). */
  code(): string;
}

/** Trimmed and lower-cased, or `undefined` when it is not a plausible address. */
export const normaliseEmail = (raw: string): string | undefined => {
  const email = raw.trim().toLowerCase();
  if (email.length > ACCOUNT_LIMITS.maxEmailLength || /\s/.test(email)) return undefined;
  const parts = email.split("@");
  if (parts.length !== 2) return undefined;
  const [local, domain] = parts as [string, string];
  const labels = domain.split(".");
  if (local === "" || labels.length < 2 || labels.some((label) => label === "")) return undefined;
  return email;
};

/** BR-071: the domain or one of its parents is on the disposable list. */
export const isDisposable = (email: string): boolean => {
  const labels = (email.split("@")[1] ?? "").split(".");
  return labels.some((_, index) => DISPOSABLE_DOMAINS.has(labels.slice(index).join(".")));
};

/** What the hub looked up before asking for a code (`accounts/02`). */
export interface CodeRequestFacts {
  /** Already normalised by {@link normaliseEmail}, `undefined` when invalid. */
  readonly email: string | undefined;
  readonly blocked: boolean;
  readonly emailCodesLastHour: number;
  readonly ipCodesLastHour: number;
  readonly lastCodeAt?: Date;
  /** Wrong codes typed for this e-mail over the last 24 hours (BR-072). */
  readonly wrongTriesLastDay: number;
}

/** Refusals that reveal nothing about the address, so they are answered explicitly. */
export type CodeRefusal = "emailInvalid" | "disposable" | "rate";

/** Outcome of a code request: refused with a reason, silently dropped, or a code to mail. */
export type CodeDecision =
  | { readonly kind: "refused"; readonly reason: CodeRefusal }
  /** Same answer as `issue`, but nothing is sent (ADR-0013 amendment). */
  | { readonly kind: "silent" }
  | { readonly kind: "issue"; readonly code: string; readonly expiresAt: Date };

/** UC17 steps 2–3, checks in the order of the study (BR-070 to BR-072). */
export const decideCodeRequest = (facts: CodeRequestFacts, now: Date, random: CodeRandom): CodeDecision => {
  if (facts.email === undefined) return { kind: "refused", reason: "emailInvalid" };
  if (isDisposable(facts.email)) return { kind: "refused", reason: "disposable" };
  if (facts.ipCodesLastHour >= ACCOUNT_LIMITS.ipCodesPerHour) return { kind: "refused", reason: "rate" };
  const coolingDown =
    facts.lastCodeAt !== undefined && now.getTime() - facts.lastCodeAt.getTime() < ACCOUNT_LIMITS.cooldownMs;
  const capped =
    facts.blocked ||
    facts.emailCodesLastHour >= ACCOUNT_LIMITS.emailCodesPerHour ||
    facts.wrongTriesLastDay >= ACCOUNT_LIMITS.wrongTriesPerDay;
  if (capped || coolingDown) {
    return { kind: "silent" };
  }
  return { kind: "issue", code: random.code(), expiresAt: new Date(now.getTime() + ACCOUNT_LIMITS.codeTtlMs) };
};

/** The part of a pending code the check needs. */
export interface PendingCodeState {
  readonly triesLeft: number;
  readonly expiresAt: Date;
}

/** Outcome of one typed code: accepted, or refused with the tries left. */
export type CodeCheck =
  | { readonly kind: "accepted" }
  | { readonly kind: "refused"; readonly reason: "wrong"; readonly triesLeft: number }
  /** The hub deletes the code. */
  | { readonly kind: "refused"; readonly reason: "expired" | "exhausted"; readonly triesLeft: 0 };

/** UC17 step 5, BR-070: the fifth wrong try invalidates the code. */
export const checkCode = (pending: PendingCodeState, codeMatches: boolean, now: Date): CodeCheck => {
  if (pending.expiresAt.getTime() <= now.getTime()) return { kind: "refused", reason: "expired", triesLeft: 0 };
  if (pending.triesLeft <= 0) return { kind: "refused", reason: "exhausted", triesLeft: 0 };
  if (codeMatches) return { kind: "accepted" };
  const triesLeft = pending.triesLeft - 1;
  return triesLeft === 0 ? { kind: "refused", reason: "exhausted", triesLeft: 0 } : { kind: "refused", reason: "wrong", triesLeft };
};

/** UC17 step 5 once the code matched. */
export interface LinkCommand {
  readonly sessionId: string;
  readonly email: string;
  readonly remember: boolean;
  /** Checked again at verify time (BR-077). */
  readonly blocked: boolean;
  readonly existing?: Account;
  readonly carryOver?: StrikeCarryOver;
}

/** Outcome of a matching code: the session linked to a new or existing account, or refused. */
export type LinkResult =
  | {
      readonly kind: "linked";
      readonly state: HubState;
      readonly account: Account;
      readonly created: boolean;
      /** Raw claim for the client, its hash is kept in the state. */
      readonly deviceClaim?: string;
    }
  | { readonly kind: "refused"; readonly reason: "blocked" | "gone" };

const withSession = (state: HubState, session: Session): HubState => ({
  ...state,
  sessions: new Map(state.sessions).set(session.id, session),
});

/** Creates or refreshes the account and links the session; issues a device claim on request. */
export const linkAccount = (state: HubState, command: LinkCommand, now: Date, random: CodeRandom): LinkResult => {
  if (command.blocked) return { kind: "refused", reason: "blocked" };
  const session = state.sessions.get(command.sessionId);
  if (session?.status !== "connected") return { kind: "refused", reason: "gone" };
  const account: Account = command.existing
    ? { ...command.existing, lastSeenAt: now }
    : {
        id: random.id(),
        email: command.email,
        verifiedAt: now,
        lastSeenAt: now,
        // BR-080: strikes still running come back.
        strikes: (command.carryOver?.strikeExpiries ?? [])
          .filter((expiresAt) => expiresAt.getTime() > now.getTime())
          .map((expiresAt) => ({ expiresAt })),
      };
  // A new account drops the device of a previous one on this session.
  const linked = withSession(state, { ...session, accountId: account.id, deviceTokenHash: undefined });
  if (!command.remember) return { kind: "linked", state: linked, account, created: !command.existing };
  const claim = random.token();
  const deviceClaims = new Map(linked.deviceClaims).set(claim.hash, {
    accountId: account.id,
    sessionId: session.id,
    expiresAt: new Date(now.getTime() + ACCOUNT_LIMITS.claimTtlMs),
  });
  return { kind: "linked", state: { ...linked, deviceClaims }, account, created: !command.existing, deviceClaim: claim.value };
};

/** Outcome of a device claim: a 30-day token for the session, or refused (unknown, expired or used). */
export type ClaimResult =
  | {
      readonly kind: "redeemed";
      readonly state: HubState;
      readonly accountId: string;
      readonly token: { readonly value: string; readonly hash: string };
      readonly expiresAt: Date;
    }
  | { readonly kind: "refused"; readonly state: HubState };

/** BR-073: a claim is single use and valid 60 seconds; the session keeps the device token hash. */
export const redeemDeviceClaim = (state: HubState, claimHash: string, now: Date, random: CodeRandom): ClaimResult => {
  const claim = state.deviceClaims.get(claimHash);
  if (!claim) return { kind: "refused", state };
  const deviceClaims = new Map(state.deviceClaims);
  deviceClaims.delete(claimHash);
  const without = { ...state, deviceClaims };
  if (claim.expiresAt.getTime() <= now.getTime()) return { kind: "refused", state: without };
  const token = random.token();
  const session = without.sessions.get(claim.sessionId);
  const next = session?.accountId === claim.accountId ? withSession(without, { ...session, deviceTokenHash: token.hash }) : without;
  return {
    kind: "redeemed",
    state: next,
    accountId: claim.accountId,
    token,
    expiresAt: new Date(now.getTime() + ACCOUNT_LIMITS.deviceTtlMs),
  };
};

/** Which sessions lose their account (UC18, UC19). */
export type SessionFilter =
  | { readonly by: "session"; readonly sessionId: string }
  | { readonly by: "device"; readonly tokenHash: string }
  | { readonly by: "account"; readonly accountId: string };

const matches = (session: Session, filter: SessionFilter): boolean => {
  if (session.accountId === undefined) return false;
  switch (filter.by) {
    case "session":
      return session.id === filter.sessionId;
    case "device":
      return session.deviceTokenHash === filter.tokenHash;
    case "account":
      return session.accountId === filter.accountId;
  }
};

/** Clears the account of every matching session, connected or away; returns the unlinked ids. */
export const unlinkSessions = (state: HubState, filter: SessionFilter): { state: HubState; unlinked: string[] } => {
  const sessions = new Map(state.sessions);
  const unlinked: string[] = [];
  for (const session of state.sessions.values()) {
    if (!matches(session, filter)) continue;
    sessions.set(session.id, { ...session, accountId: undefined, deviceTokenHash: undefined });
    unlinked.push(session.id);
  }
  return { state: unlinked.length === 0 ? state : { ...state, sessions }, unlinked };
};

/** The legal retention record of a closed account (BR-081). */
export interface VaultRecord {
  readonly accountId: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly closedAt: Date;
}

/** UC19: the vault record, and the strike carry-over when strikes are active (BR-080, BR-081). */
export const closeAccount = (account: Account, now: Date): { vault: VaultRecord; carryOver?: StrikeCarryOver } => {
  const active = account.strikes.filter((strike) => strike.expiresAt.getTime() > now.getTime());
  const vault = { accountId: account.id, email: account.email, createdAt: account.verifiedAt, closedAt: now };
  return active.length === 0 ? { vault } : { vault, carryOver: { strikeExpiries: active.map((strike) => strike.expiresAt) } };
};

/** Forgets expired device claims. Called from the hub tick. */
export const pruneDeviceClaims = (state: HubState, now: Date): HubState => {
  const kept = [...state.deviceClaims].filter(([, claim]) => claim.expiresAt.getTime() > now.getTime());
  return kept.length === state.deviceClaims.size ? state : { ...state, deviceClaims: new Map(kept) };
};
