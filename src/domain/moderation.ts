/**
 * Reports, expel, warn and suspension without AI (brick 8a), study `moderation/01`, `02a`, `02d`, `04`.
 * Pure decisions: the hub hashes the IP, encrypts, writes the stores and sends the messages.
 */
import type { Strike } from "./accounts";
import type { Random, Session } from "./entry";
import { foldPseudo } from "./pseudo";
import type { HubState } from "./rooms";

/** V1 values of BR-051 to BR-053, BR-061, BR-062 and BR-074 to BR-077, tunable here only. */
export const MODERATION_LIMITS = {
  maxExcerptLength: 500,
  maxContextLines: 20,
  reportsPerWindow: 5,
  reportWindowMs: 10 * 60_000,
  strikeMs: 90 * 24 * 60 * 60_000,
  strikesForSuspension: 3,
  suspensionMs: 7 * 24 * 60 * 60_000,
  closedReportMs: 183 * 24 * 60 * 60_000,
  expiredBanMs: 30 * 24 * 60 * 60_000,
} as const;

/** BR-053. */
export const EXPEL_DURATIONS_MS = {
  "1h": 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
} as const;

export type ExpelDuration = keyof typeof EXPEL_DURATIONS_MS;
/** BR-050. */
export type ReportReason = "harassment" | "seemsMinor" | "spam" | "illegalContent" | "other";
export type ReportTargetKind = "chatter" | "message" | "room";
/** The outcomes brick 8a offers (BR-057, BR-092). */
export type ReportOutcome = "noAction" | "warned" | "expelled" | "suspended";

/** A report as the domain sees it, values in clear (`moderation/04`). */
export interface Report {
  readonly id: string;
  readonly reason: ReportReason;
  readonly targetKind: ReportTargetKind;
  readonly targetPseudo?: string;
  readonly targetRoomId?: string;
  /** Snapshot of the target's live session when filed; a hint only, the session may be gone. */
  readonly targetSessionId?: string;
  readonly targetAccountId?: string;
  /** Raw IP of the target when filed; the hub stores only its keyed hash. */
  readonly targetIp?: string;
  readonly excerpt: string;
  readonly context: readonly string[];
  readonly authorPseudo: string;
  readonly createdAt: Date;
}

/** What a chatter sends with `report` (UC9). */
export interface ReportCommand {
  readonly sessionId: string;
  readonly targetKind: ReportTargetKind;
  readonly targetPseudo?: string;
  readonly targetRoomId?: string;
  readonly reason: ReportReason;
  readonly excerpt: string;
  readonly context: readonly string[];
}

export type ReportRefusal = "rate" | "invalid" | "self";

export type ReportResult =
  | { readonly kind: "filed"; readonly state: HubState; readonly report: Report }
  | { readonly kind: "refused"; readonly state: HubState; readonly reason: ReportRefusal };

/** BR-054. */
export const isModerator = (state: HubState, sessionId: string): boolean => state.sessions.get(sessionId)?.isModerator === true;

/** The live or away session holding `pseudo`, if any. */
export const sessionByPseudo = (state: HubState, pseudo: string): Session | undefined => {
  const id = state.pseudoIndex.get(foldPseudo(pseudo));
  return id === undefined ? undefined : state.sessions.get(id);
};

/** BR-052: keeps this session's reports of the last 10 minutes; `undefined` when the limit is reached. */
const countReport = (state: HubState, sessionId: string, now: Date): HubState | undefined => {
  const since = now.getTime() - MODERATION_LIMITS.reportWindowMs;
  const recent = (state.reportAttempts.get(sessionId) ?? []).filter((at) => at.getTime() > since);
  if (recent.length >= MODERATION_LIMITS.reportsPerWindow) return undefined;
  return { ...state, reportAttempts: new Map(state.reportAttempts).set(sessionId, [...recent, now]) };
};

const hasTarget = (command: ReportCommand): boolean =>
  command.targetKind === "room" ? command.targetRoomId !== undefined : command.targetPseudo !== undefined;

/** UC9 steps 2–3 (BR-050 to BR-052): captures the target's account and IP while it is still known. */
export const fileReport = (state: HubState, command: ReportCommand, now: Date, random: Random): ReportResult => {
  const author = state.sessions.get(command.sessionId);
  if (!author || !hasTarget(command)) return { kind: "refused", state, reason: "invalid" };
  const target = command.targetPseudo === undefined ? undefined : sessionByPseudo(state, command.targetPseudo);
  if (target?.id === author.id) return { kind: "refused", state, reason: "self" };
  const counted = countReport(state, author.id, now);
  if (!counted) return { kind: "refused", state, reason: "rate" };
  const report: Report = {
    id: random.id(),
    reason: command.reason,
    targetKind: command.targetKind,
    targetPseudo: target?.pseudo ?? command.targetPseudo,
    targetRoomId: command.targetRoomId,
    targetSessionId: target?.id,
    targetAccountId: target?.accountId,
    targetIp: target?.status === "connected" ? target.ip : undefined,
    excerpt: [...command.excerpt].slice(0, MODERATION_LIMITS.maxExcerptLength).join(""),
    context: command.context.slice(-MODERATION_LIMITS.maxContextLines),
    authorPseudo: author.pseudo,
    createdAt: now,
  };
  return { kind: "filed", state: counted, report };
};

/** Forgets report counts older than the window. Called from the hub tick. */
export const pruneReportAttempts = (state: HubState, now: Date): HubState => {
  const since = now.getTime() - MODERATION_LIMITS.reportWindowMs;
  const kept = [...state.reportAttempts]
    .map(([id, times]) => [id, times.filter((at) => at.getTime() > since)] as const)
    .filter(([, times]) => times.length > 0);
  return state.reportAttempts.size === 0 ? state : { ...state, reportAttempts: new Map(kept) };
};

/** A ban on the target's IP and pseudo (BR-053, BR-055); the hub hashes the IP. */
export interface BanDecision {
  readonly ip?: string;
  readonly pseudo?: string;
  readonly until: Date;
  readonly decidedBy: string;
}

/**
 * The session a sanction reaches: the one filed on the report if it still holds the pseudo, else the one
 * now holding the pseudo with the same account (the target may have resumed or re-entered).
 */
export const liveTarget = (state: HubState, report: Report): Session | undefined => {
  const filed = report.targetSessionId === undefined ? undefined : state.sessions.get(report.targetSessionId);
  if (filed) return filed;
  if (report.targetAccountId === undefined || report.targetPseudo === undefined) return undefined;
  const now = sessionByPseudo(state, report.targetPseudo);
  return now?.accountId === report.targetAccountId ? now : undefined;
};

/** UC11: a timed ban on the IP (the live one when newer) and the pseudo of the report's target. */
export const decideExpel = (
  state: HubState,
  report: Report,
  duration: ExpelDuration,
  moderator: string,
  now: Date,
): { ban: BanDecision; session?: Session } => {
  const session = liveTarget(state, report);
  const ip = session?.status === "connected" ? session.ip : report.targetIp;
  return {
    ban: { ip, pseudo: report.targetPseudo, until: new Date(now.getTime() + EXPEL_DURATIONS_MS[duration]), decidedBy: moderator },
    session,
  };
};

/** Strikes still running at `now` (BR-074). */
export const activeStrikes = (strikes: readonly Strike[], now: Date): Strike[] =>
  strikes.filter((strike) => strike.expiresAt.getTime() > now.getTime());

/** BR-074: one more strike of 90 days, expired ones dropped; BR-075: whether a suspension is due. */
export const addStrike = (strikes: readonly Strike[], now: Date): { strikes: Strike[]; active: number; proposeSuspension: boolean } => {
  const next = [...activeStrikes(strikes, now), { expiresAt: new Date(now.getTime() + MODERATION_LIMITS.strikeMs) }];
  return { strikes: next, active: next.length, proposeSuspension: next.length >= MODERATION_LIMITS.strikesForSuspension };
};

/** BR-075: a suspension may be confirmed only while 3 or more strikes are active. */
export const canSuspend = (strikes: readonly Strike[], now: Date): boolean =>
  activeStrikes(strikes, now).length >= MODERATION_LIMITS.strikesForSuspension;

/** BR-077: the e-mail block and the ban both last 7 days. */
export const suspensionUntil = (now: Date): Date => new Date(now.getTime() + MODERATION_LIMITS.suspensionMs);

/** Sessions of an account, connected or away, that a suspension closes (BR-077). */
export const sessionsOfAccount = (state: HubState, accountId: string): Session[] =>
  [...state.sessions.values()].filter((session) => session.accountId === accountId);

/** Open reports oldest first (BR-092). */
export const sortOpenReports = <R extends { readonly createdAt: Date }>(reports: readonly R[]): R[] =>
  [...reports].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
