/**
 * Brick 8a commands of the hub (`moderation/02a`, `02d`, `04`): report, the queue, expel, warn by closing
 * a report, and the three-strike suspension. No AI triage (BR-092); a human decides every sanction
 * (ADR-0010).
 */
import {
  activeStrikes,
  addStrike,
  canSuspend,
  closeAccount,
  decideExpel,
  fileReport,
  isModerator,
  liveTarget,
  sessionsOfAccount,
  sortOpenReports,
  suspensionUntil,
  type HubState,
  type Mailer,
  type Random,
  type Report,
} from "../domain";
import type { ClientMessage } from "../shared/protocol";
import type { AccountIo } from "./account-io";
import type { LoadedReport, ModerationIo } from "./moderation-io";
import type { Outgoing, OutgoingModule, Payload } from "./outgoing";

type Command<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;

/** The socket asking. */
export interface ModerationCaller {
  readonly key: string;
  readonly sessionId: string;
}

/** The hub dependencies the moderation commands use (the subset of `HubDeps`). */
export interface ModerationDeps {
  readonly random: Random;
  readonly moderation: ModerationIo;
  readonly accounts: AccountIo;
  readonly mailer: Mailer;
  readonly onStoreError: (error: unknown) => void;
}

/** What the moderation handlers share with the hub. */
export interface ModerationContext {
  readonly deps: ModerationDeps;
  readonly out: OutgoingModule;
  state(): HubState;
  setState(next: HubState): void;
  /** Sends `expelled(until)` to the session's socket, closes it, and removes the session (UC11). */
  evict(sessionId: string, until: Date, now: Date): Promise<Outgoing[]>;
}

type ModerationHandler<T extends ClientMessage["type"]> = (caller: ModerationCaller, command: Command<T>, now: Date) => Promise<Outgoing[]>;

/** BR-091: the only moderator name before brick 8b. */
export const INTERIM_MODERATOR = "owner";

/** DSA art. 17 statement of reasons, in the chat's language (BR-076). */
export const suspensionStatement = (until: Date): string =>
  [
    "Bonjour,",
    "",
    "Ton compte asv a été supprimé et ton adresse e-mail est bloquée jusqu'au " + until.toISOString().slice(0, 10) + ".",
    "Motif : trois avertissements actifs d'un modérateur pour non-respect des règles du chat.",
    "La décision a été prise par un humain ; aucun outil automatique n'a été utilisé.",
    "Pour la contester, réponds simplement à ce message.",
  ].join("\n");

/** Time between two retry rounds of refused statements (BR-076). */
export const STATEMENT_RETRY_MS = 10 * 60_000;

/** A statement not yet accepted by the provider, retried until `giveUpAt` (BR-076). */
interface PendingStatement {
  readonly email: string;
  readonly statement: string;
  readonly giveUpAt: Date;
}

/** One handler per brick 8a command, plus `retryStatements` for the hub tick. */
export const createModerationHandlers = (ctx: ModerationContext) => {
  const { deps, out } = ctx;
  let pending: PendingStatement[] = [];

  const forbidden = (caller: ModerationCaller, seq: number): Outgoing[] => [out.error(caller.key, "forbidden", seq)];
  const notAvailable = (caller: ModerationCaller, seq: number): Outgoing[] => [out.error(caller.key, "invalid", seq, "notAvailable")];

  /** UC9 (`moderation/02a`): stored before `reportSent`. */
  const onReport: ModerationHandler<"report"> = async (caller, command, now) => {
    const { payload } = command;
    const result = fileReport(ctx.state(), { sessionId: caller.sessionId, ...payload }, now, deps.random);
    if (result.kind === "refused") return [out.warning(caller.key, result.reason === "rate" ? "reportRate" : "reportInvalid", command.seq)];
    await deps.moderation.saveReport(result.report);
    ctx.setState(result.state);
    return [out.send([caller.key], "reportSent", { reportId: result.report.id })];
  };

  const strikesOf = async (report: Report, now: Date): Promise<number> => {
    if (report.targetAccountId === undefined) return 0;
    const found = await deps.accounts.accountById(report.targetAccountId);
    return found ? activeStrikes(found.account.strikes, now).length : 0;
  };

  const toPayload = async (report: LoadedReport, now: Date): Promise<Payload<"openReports">["reports"][number]> => ({
    id: report.id,
    reason: report.reason,
    targetKind: report.targetKind,
    ...(report.targetPseudo === undefined ? {} : { targetPseudo: report.targetPseudo }),
    ...(report.targetRoomId === undefined ? {} : { targetRoomId: report.targetRoomId }),
    excerpt: report.excerpt,
    context: [...report.context],
    authorPseudo: report.authorPseudo,
    createdAt: report.createdAt.toISOString(),
    hasAccount: report.targetAccountId !== undefined,
    connected: liveTarget(ctx.state(), report)?.status === "connected",
    activeStrikes: await strikesOf(report, now),
    struck: report.struckAt !== undefined,
  });

  /** UC12 step 2, oldest first (BR-092). */
  const onList: ModerationHandler<"listOpenReports"> = async (caller, command, now) => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, command.seq);
    const reports = sortOpenReports(await deps.moderation.openReports());
    return [out.send([caller.key], "openReports", { reports: await Promise.all(reports.map((report) => toPayload(report, now))) })];
  };

  /** The open report a moderator acts on, or the answer to send instead. */
  const openReport = async (caller: ModerationCaller, reportId: string, seq: number): Promise<LoadedReport | Outgoing[]> => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, seq);
    const report = await deps.moderation.findReport(reportId);
    return report && !report.closed ? report : [out.warning(caller.key, "reportGone", seq)];
  };

  const close = async (caller: ModerationCaller, report: Report, outcome: "noAction" | "warned" | "expelled" | "suspended", now: Date) => {
    await deps.moderation.closeReport(report, outcome, INTERIM_MODERATOR, now);
    return out.send([caller.key], "reportClosed", { reportId: report.id });
  };

  /** UC11 (`moderation/02a`): the ban is written before the target is closed. */
  const onExpel: ModerationHandler<"expel"> = async (caller, command, now) => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, command.seq);
    if (command.payload.severe) return notAvailable(caller, command.seq);
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    if (report.targetKind === "room") return [out.warning(caller.key, "reportInvalid", command.seq)];
    const decision = decideExpel(ctx.state(), report, command.payload.duration, INTERIM_MODERATOR, now);
    await deps.moderation.saveBan(decision.ban, report.id, deps.random.id(), now);
    // Every store write first: a failure then leaves no evicted session behind (`guarded`).
    const closed = await close(caller, report, "expelled", now);
    const evicted = decision.session ? await ctx.evict(decision.session.id, decision.ban.until, now) : [];
    return [...evicted, closed];
  };

  /** UC12 step 3 for `warned` (`moderation/02d`): a strike when the target has an account (BR-074). */
  const warn = async (caller: ModerationCaller, report: LoadedReport, now: Date, seq: number): Promise<Outgoing[]> => {
    if (report.targetKind === "room") return [out.warning(caller.key, "reportInvalid", seq)];
    const target = liveTarget(ctx.state(), report);
    const found = report.targetAccountId === undefined ? undefined : await deps.accounts.accountById(report.targetAccountId);
    // BR-074: one strike per report; a repeated `warned` only asks the suspension question again (`02d`).
    if (found && report.struckAt !== undefined) {
      const active = activeStrikes(found.account.strikes, now).length;
      if (canSuspend(found.account.strikes, now)) {
        return [out.send([caller.key], "suspensionProposed", { accountId: found.account.id, reportId: report.id, activeStrikes: active })];
      }
      return [await close(caller, report, "warned", now)];
    }
    const strike = found ? addStrike(found.account.strikes, now) : undefined;
    if (found && strike) {
      await deps.accounts.saveAccount({ ...found.account, strikes: strike.strikes }, found.emailKeyedHash, false);
      await deps.moderation.markStruck(report.id, now);
    }
    const to = found ? sessionsOfAccount(ctx.state(), found.account.id).map((session) => session.id) : target ? [target.id] : [];
    const warned = out.send(out.keysOf(to), "warned", { rule: report.reason, text: "", activeStrikes: strike?.active ?? 0 });
    if (strike?.proposeSuspension && found) {
      return [warned, out.send([caller.key], "suspensionProposed", { accountId: found.account.id, reportId: report.id, activeStrikes: strike.active })];
    }
    return [warned, await close(caller, report, "warned", now)];
  };

  const onCloseReport: ModerationHandler<"closeReport"> = async (caller, command, now) => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, command.seq);
    const { outcome } = command.payload;
    if (outcome !== "noAction" && outcome !== "warned" && outcome !== "expelled") return notAvailable(caller, command.seq);
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    if (outcome === "warned") return warn(caller, report, now, command.seq);
    if (outcome === "expelled") return notAvailable(caller, command.seq);
    return [await close(caller, report, outcome, now)];
  };

  /** Tries one statement; a refused or failed one is kept for a retry until `giveUpAt` (BR-076). */
  const trySend = async (entry: PendingStatement): Promise<void> => {
    let sent = false;
    try {
      sent = await deps.mailer.sendStatementOfReasons(entry.email, entry.statement);
    } catch (cause) {
      deps.onStoreError(cause);
    }
    if (!sent) pending.push(entry);
  };
  let lastRetry = 0;
  let retrying = false;

  /** BR-075 to BR-077, BR-081 (`moderation/02d`). */
  const onConfirm: ModerationHandler<"confirmSuspension"> = async (caller, command, now) => {
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    const found = report.targetAccountId === command.payload.accountId ? await deps.accounts.accountById(command.payload.accountId) : undefined;
    if (!found || !canSuspend(found.account.strikes, now)) return [out.warning(caller.key, "suspensionRefused", command.seq)];
    const until = suspensionUntil(now);
    const decision = decideExpel(ctx.state(), report, "7d", INTERIM_MODERATOR, now);
    const closure = closeAccount(found.account, now);
    // Ban, block and report first, the account deletion last: a failure in between leaves the account to retry on.
    await deps.moderation.saveBan({ ...decision.ban, until }, report.id, deps.random.id(), now);
    await deps.accounts.blockEmail(found.emailKeyedHash, until);
    const closed = await close(caller, report, "suspended", now);
    await deps.accounts.close(closure.vault, found.emailKeyedHash, closure.carryOver);
    // Not awaited: the hub queue must not wait for the provider (ADR-0013 amendment).
    void trySend({ email: found.account.email, statement: suspensionStatement(until), giveUpAt: suspensionUntil(now) });
    const evicted: Outgoing[] = [];
    for (const session of sessionsOfAccount(ctx.state(), found.account.id)) evicted.push(...(await ctx.evict(session.id, until, now)));
    return [...evicted, closed];
  };

  /** Declines only a proposed suspension: the report gave its strike and the account still has three (BR-075). */
  const onDecline: ModerationHandler<"declineSuspension"> = async (caller, command, now) => {
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    const found = report.struckAt !== undefined && report.targetAccountId === command.payload.accountId
      ? await deps.accounts.accountById(command.payload.accountId)
      : undefined;
    if (!found) return [out.warning(caller.key, "suspensionRefused", command.seq)];
    return [await close(caller, report, "warned", now)];
  };

  /** Keeps a failed store call from leaving a command half applied in memory. */
  const guarded = <T extends ClientMessage["type"]>(run: ModerationHandler<T>): ModerationHandler<T> =>
    async (caller, command, now) => {
      try {
        return await run(caller, command, now);
      } catch (cause) {
        deps.onStoreError(cause);
        return [out.warning(caller.key, "unavailable", command.seq)];
      }
    };

  return {
    report: guarded(onReport),
    listOpenReports: guarded(onList),
    expel: guarded(onExpel),
    closeReport: guarded(onCloseReport),
    confirmSuspension: guarded(onConfirm),
    declineSuspension: guarded(onDecline),
    /** `warn` and `removeRoom` wait for brick 8c (BR-092). */
    later: (caller: ModerationCaller, command: ClientMessage): Promise<Outgoing[]> =>
      Promise.resolve(isModerator(ctx.state(), caller.sessionId) ? notAvailable(caller, command.seq) : forbidden(caller, command.seq)),
    /** Called from the hub tick, never awaited there; one retry round every `STATEMENT_RETRY_MS` (BR-076). */
    async retryStatements(now: Date): Promise<void> {
      if (retrying || now.getTime() - lastRetry < STATEMENT_RETRY_MS) return;
      retrying = true;
      lastRetry = now.getTime();
      const due = pending.filter((entry) => entry.giveUpAt.getTime() > now.getTime());
      pending = [];
      try {
        for (const entry of due) await trySend(entry);
      } finally {
        retrying = false;
      }
    },
  };
};
