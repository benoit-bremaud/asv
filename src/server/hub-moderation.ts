/**
 * Moderation commands of the hub (`moderation/02a`, `02d`, `02g`, `04`): report and its AI triage (brick 8c,
 * BR-100 to BR-102), the queue, expel, warn by closing a report, and the three-strike suspension. The AI
 * only sorts; a human decides every sanction (ADR-0010).
 */
import {
  activeStrikes,
  addStrike,
  applyFloor,
  emptyTriageQuota,
  canSuspend,
  closeAccount,
  decideExpel,
  decideSevere,
  removeRoom,
  severeBlockUntil,
  sortAlerted,
  fileReport,
  isModerator,
  liveTarget,
  pseudonymise,
  sessionsOfAccount,
  sortForQueue,
  suspensionUntil,
  takeTriageSlot,
  type HubState,
  type AuthorityAlert,
  type Mailer,
  type OffenceCategory,
  type Random,
  type Report,
  type ReportOutcome,
  type ReportTriage,
  type TriageQuota,
} from "../domain";
import { CAPS, type ClientMessage } from "../shared/protocol";
import type { AccountIo } from "./account-io";
import type { LoadedReport, ModerationIo } from "./moderation-io";
import type { Outgoing, OutgoingModule, Payload } from "./outgoing";
import { createModerationMail, severeStatement, suspensionStatement } from "./moderation-mail";
import { noAiTriage } from "./triage/no-ai";

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
  /** The AI triage (ADR-0019); the no-AI adapter when absent. */
  readonly triage?: ReportTriage;
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

/** BR-055: the name recorded on an action, from the passkey grant of the session (BR-095). */
const moderatorOf = (state: HubState, sessionId: string): string => state.sessions.get(sessionId)?.moderatorName ?? "unknown";

export { STATEMENT_RETRY_MS, suspensionStatement } from "./moderation-mail";

/** One handler per moderation command, plus `retryMails` for the hub tick. */
export const createModerationHandlers = (ctx: ModerationContext) => {
  const { deps, out } = ctx;
  const mail = createModerationMail(deps);
  let quota: TriageQuota = emptyTriageQuota;
  const triage = deps.triage ?? noAiTriage;

  const forbidden = (caller: ModerationCaller, seq: number): Outgoing[] => [out.error(caller.key, "forbidden", seq)];
  const notAvailable = (caller: ModerationCaller, seq: number): Outgoing[] => [out.error(caller.key, "invalid", seq, "notAvailable")];

  /**
   * `moderation/02g`: both daily caps are checked before the call (BR-101); the triage of a report closed
   * meanwhile is dropped by the store. Never rejects: errors go to `onStoreError`.
   */
  const runTriage = async (report: Report, known: readonly string[], reporter: { ip?: string; accountId?: string }, now: Date) => {
    try {
      const keys = [
        ...(reporter.ip === undefined ? [] : [`ip:${await deps.moderation.ipKeyedHash(reporter.ip)}`]),
        ...(reporter.accountId === undefined ? [] : [`account:${reporter.accountId}`]),
      ];
      const slot = takeTriageSlot(quota, keys, now);
      if (!slot) return;
      quota = slot;
      const { input, labels } = pseudonymise(report, known);
      const answer = await triage.triage(input);
      if (answer === "unavailable") return;
      await deps.moderation.saveTriage(report.id, applyFloor(report.reason, answer), labels);
    } catch (cause) {
      deps.onStoreError(cause);
    }
  };

  /** UC9 (`moderation/02a`): stored before `reportSent`; the triage follows without delaying it (`02g`). */
  const onReport: ModerationHandler<"report"> = async (caller, command, now) => {
    const { payload } = command;
    const state = ctx.state();
    const result = fileReport(state, { sessionId: caller.sessionId, ...payload }, now, deps.random);
    if (result.kind === "refused") return [out.warning(caller.key, result.reason === "rate" ? "reportRate" : "reportInvalid", command.seq)];
    await deps.moderation.saveReport(result.report);
    ctx.setState(result.state);
    const reporter = state.sessions.get(caller.sessionId);
    const known = [...state.sessions.values()].map((session) => session.pseudo);
    void runTriage(result.report, known, { ip: reporter?.status === "connected" ? reporter.ip : undefined, accountId: reporter?.accountId }, now);
    return [out.send([caller.key], "reportSent", { reportId: result.report.id })];
  };

  const strikesOf = async (report: Report, now: Date): Promise<number> => {
    if (report.targetAccountId === undefined) return 0;
    const found = await deps.accounts.accountById(report.targetAccountId);
    return found ? activeStrikes(found.account.strikes, now).length : 0;
  };

  const alertPayload = (alert: AuthorityAlert): Payload<"alertedReports">["reports"][number]["alert"] => ({
    offenceCategory: alert.offenceCategory,
    raisedBy: alert.raisedBy,
    raisedAt: alert.raisedAt.toISOString(),
    status: alert.status,
    ...(alert.channel === undefined ? {} : { channel: alert.channel }),
    ...(alert.reference === undefined ? {} : { reference: alert.reference }),
    ...(alert.filedAt === undefined ? {} : { filedAt: alert.filedAt.toISOString() }),
  });

  const viewOf = (report: LoadedReport) => ({
    id: report.id,
    reason: report.reason,
    targetKind: report.targetKind,
    ...(report.targetPseudo === undefined ? {} : { targetPseudo: report.targetPseudo }),
    ...(report.targetRoomId === undefined ? {} : { targetRoomId: report.targetRoomId }),
    ...(report.targetRoomName === undefined ? {} : { targetRoomName: report.targetRoomName }),
    excerpt: report.excerpt,
    context: [...report.context],
    authorPseudo: report.authorPseudo,
    createdAt: report.createdAt.toISOString(),
  });

  const toPayload = async (report: LoadedReport, now: Date): Promise<Payload<"openReports">["reports"][number]> => ({
    ...viewOf(report),
    hasAccount: report.targetAccountId !== undefined,
    connected: liveTarget(ctx.state(), report)?.status === "connected",
    activeStrikes: await strikesOf(report, now),
    struck: report.struckAt !== undefined,
    ...(report.triage ? { triage: { ...report.triage, labels: [...report.triage.labels] } } : {}),
    ...(report.alert ? { alert: alertPayload(report.alert) } : {}),
  });

  /** UC12 step 2: the first `CAPS.queuePage` (`platform/04-class-protocol`, `web-ui/08`) in BR-102 order, and the open count. */
  const onList: ModerationHandler<"listOpenReports"> = async (caller, command, now) => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, command.seq);
    const open = sortForQueue(await deps.moderation.openReports());
    const reports = await Promise.all(open.slice(0, CAPS.queuePage).map((report) => toPayload(report, now)));
    return [out.send([caller.key], "openReports", { reports, total: open.length })];
  };

  /** BR-104 (UC20 step 1): closed reports with an alert, pending first, at most `CAPS.alertPage`. */
  const onListAlerted: ModerationHandler<"listAlertedReports"> = async (caller, command) => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, command.seq);
    const alerted = (await deps.moderation.alertedReports()).flatMap((report) =>
      report.alert && report.closed ? [{ ...report, alert: report.alert, closed: report.closed }] : []);
    const reports = sortAlerted(alerted).slice(0, CAPS.alertPage).map((report) => ({
      ...viewOf(report),
      closedAt: report.closed.at.toISOString(),
      alert: alertPayload(report.alert),
    }));
    return [out.send([caller.key], "alertedReports", { reports })];
  };

  /** The open report a moderator acts on, or the answer to send instead. */
  const openReport = async (caller: ModerationCaller, reportId: string, seq: number): Promise<LoadedReport | Outgoing[]> => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, seq);
    const report = await deps.moderation.findReport(reportId);
    return report && !report.closed ? report : [out.warning(caller.key, "reportGone", seq)];
  };

  /**
   * BR-104 (`moderation/02h`): one alert per report. Returns what tells the owner, called once the command's
   * last report write is done, so `notifiedAt` is never overwritten by the close.
   */
  const raiseAlert = async (caller: ModerationCaller, report: Report, category: OffenceCategory | undefined, now: Date): Promise<() => void> => {
    if (category === undefined) return () => undefined;
    const saved = await deps.moderation.saveAuthorityAlert(report.id, category, moderatorOf(ctx.state(), caller.sessionId), now);
    // Not awaited: the hub queue must not wait for the provider.
    return saved ? () => void mail.alert(report.id, category, now) : () => undefined;
  };

  /** BR-057 close, then the decision e-mail to a member reporter (BR-107). */
  const close = async (caller: ModerationCaller, report: LoadedReport, outcome: ReportOutcome, now: Date) => {
    await deps.moderation.closeReport(report, outcome, moderatorOf(ctx.state(), caller.sessionId), now);
    await mail.notifyReporter(report, outcome, now);
    return out.send([caller.key], "reportClosed", { reportId: report.id });
  };

  /** One evict after the other: each one changes the hub state the next one reads. */
  const evictAll = (sessionIds: readonly string[], until: Date, now: Date): Promise<Outgoing[]> =>
    sessionIds.reduce<Promise<Outgoing[]>>(
      async (previous, id) => [...(await previous), ...(await ctx.evict(id, until, now))],
      Promise.resolve([]),
    );

  /** After an account deletion no retry comes back: only the report close may fail, and the moderator closes it again. */
  const closeAfterDeletion = async (caller: ModerationCaller, report: LoadedReport, outcome: ReportOutcome, category: OffenceCategory | undefined, now: Date, seq: number, evicted: Outgoing[]) => {
    try {
      const tell = await raiseAlert(caller, report, category, now);
      const closed = await close(caller, report, outcome, now);
      tell();
      return [...evicted, closed];
    } catch (cause) {
      deps.onStoreError(cause);
      return [...evicted, out.warning(caller.key, "unavailable", seq)];
    }
  };

  /** BR-103 (`moderation/02h`): severe expel, the account deleted at once and a 7-day ban. */
  const severe = async (caller: ModerationCaller, report: LoadedReport, category: OffenceCategory | undefined, now: Date, seq: number) => {
    const decision = decideSevere(ctx.state(), report, moderatorOf(ctx.state(), caller.sessionId), now);
    const found = report.targetAccountId === undefined ? undefined : await deps.accounts.accountById(report.targetAccountId);
    // Ban, block and delete first: a failure there leaves the report open to retry on.
    await deps.moderation.saveBan(decision.ban, report.id, deps.random.id(), now);
    if (found) {
      const blockUntil = severeBlockUntil(now);
      const closure = closeAccount(found.account, now);
      await deps.accounts.blockEmail(found.emailKeyedHash, blockUntil);
      await deps.accounts.close(closure.vault, found.emailKeyedHash, closure.carryOver);
      void mail.statement(found.account.email, severeStatement(blockUntil, report.triage !== undefined), now);
    }
    const evicted = await evictAll(decision.sessions.map((session) => session.id), decision.ban.until, now);
    return closeAfterDeletion(caller, report, "severeDeleted", category, now, seq, evicted);
  };

  /** UC11 (`moderation/02a`): the ban is written before the target is closed. */
  const onExpel: ModerationHandler<"expel"> = async (caller, command, now) => {
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    if (report.targetKind === "room") return [out.warning(caller.key, "reportInvalid", command.seq)];
    if (command.payload.severe) return severe(caller, report, command.payload.alertAuthorities, now, command.seq);
    const decision = decideExpel(ctx.state(), report, command.payload.duration, moderatorOf(ctx.state(), caller.sessionId), now);
    await deps.moderation.saveBan(decision.ban, report.id, deps.random.id(), now);
    const tell = await raiseAlert(caller, report, command.payload.alertAuthorities, now);
    // Every store write first: a failure then leaves no evicted session behind (`guarded`).
    const closed = await close(caller, report, "expelled", now);
    tell();
    const evicted = decision.session ? await ctx.evict(decision.session.id, decision.ban.until, now) : [];
    return [...evicted, closed];
  };

  /** BR-106 (`moderation/02i`): an official room or a room already gone answers `reportInvalid`. */
  const onRemoveRoom: ModerationHandler<"removeRoom"> = async (caller, command, now) => {
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    const removal = report.targetKind === "room" && report.targetRoomId !== undefined ? removeRoom(ctx.state(), report.targetRoomId) : undefined;
    if (removal?.kind !== "removed" || report.targetRoomId === undefined) return [out.warning(caller.key, "reportInvalid", command.seq)];
    const tell = await raiseAlert(caller, report, command.payload.alertAuthorities, now);
    const closed = await close(caller, report, "roomRemoved", now);
    tell();
    ctx.setState(removal.state);
    return [
      out.send(out.keysOf(removal.members), "roomClosed", { roomId: report.targetRoomId }),
      ...out.roomOutgoing(removal.effects),
      closed,
    ];
  };

  /** UC12 step 3 for `warned` (`moderation/02d`): a strike when the target has an account (BR-074). */
  const warn = async (caller: ModerationCaller, report: LoadedReport, category: OffenceCategory | undefined, now: Date, seq: number): Promise<Outgoing[]> => {
    if (report.targetKind === "room") return [out.warning(caller.key, "reportInvalid", seq)];
    const tell = await raiseAlert(caller, report, category, now);
    const answer = await warnTarget(caller, report, now);
    tell();
    return answer;
  };

  const warnTarget = async (caller: ModerationCaller, report: LoadedReport, now: Date): Promise<Outgoing[]> => {
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
      // Mark first: a failure in between leaves a mark without strike, never a second strike on retry.
      await deps.moderation.markStruck(report.id, now);
      await deps.accounts.saveAccount({ ...found.account, strikes: strike.strikes }, found.emailKeyedHash, false);
    }
    const guestTarget = target ? [target.id] : [];
    const to = found ? sessionsOfAccount(ctx.state(), found.account.id).map((session) => session.id) : guestTarget;
    const warned = out.send(out.keysOf(to), "warned", { rule: report.reason, text: "", activeStrikes: strike?.active ?? 0 });
    if (strike?.proposeSuspension && found) {
      return [warned, out.send([caller.key], "suspensionProposed", { accountId: found.account.id, reportId: report.id, activeStrikes: strike.active })];
    }
    return [warned, await close(caller, report, "warned", now)];
  };

  /** `expelled`, `suspended`, `severeDeleted` and `roomRemoved` are set by their own commands only. */
  const onCloseReport: ModerationHandler<"closeReport"> = async (caller, command, now) => {
    if (!isModerator(ctx.state(), caller.sessionId)) return forbidden(caller, command.seq);
    const { outcome, alertAuthorities } = command.payload;
    if (outcome !== "noAction" && outcome !== "warned") return notAvailable(caller, command.seq);
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    if (outcome === "warned") return warn(caller, report, alertAuthorities, now, command.seq);
    const tell = await raiseAlert(caller, report, alertAuthorities, now);
    const closed = await close(caller, report, outcome, now);
    tell();
    return [closed];
  };

  /** BR-075 to BR-077, BR-081 (`moderation/02d`). */
  const onConfirm: ModerationHandler<"confirmSuspension"> = async (caller, command, now) => {
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    const found = report.targetAccountId === command.payload.accountId ? await deps.accounts.accountById(command.payload.accountId) : undefined;
    if (!found || !canSuspend(found.account.strikes, now)) return [out.warning(caller.key, "suspensionRefused", command.seq)];
    const until = suspensionUntil(now);
    const decision = decideExpel(ctx.state(), report, "7d", moderatorOf(ctx.state(), caller.sessionId), now);
    const closure = closeAccount(found.account, now);
    // Ban, block and delete the account first: a failure there leaves the report open to retry on.
    await deps.moderation.saveBan({ ...decision.ban, until }, report.id, deps.random.id(), now);
    await deps.accounts.blockEmail(found.emailKeyedHash, until);
    await deps.accounts.close(closure.vault, found.emailKeyedHash, closure.carryOver);
    // Not awaited: the hub queue must not wait for the provider (ADR-0013 amendment).
    void mail.statement(found.account.email, suspensionStatement(until), now);
    const evicted = await evictAll(sessionsOfAccount(ctx.state(), found.account.id).map((session) => session.id), until, now);
    return closeAfterDeletion(caller, report, "suspended", command.payload.alertAuthorities, now, command.seq, evicted);
  };

  /** Declines only a proposed suspension: the report gave its strike and the account still has three (BR-075). */
  const onDecline: ModerationHandler<"declineSuspension"> = async (caller, command, now) => {
    const report = await openReport(caller, command.payload.reportId, command.seq);
    if (Array.isArray(report)) return report;
    const found = report.struckAt !== undefined && report.targetAccountId === command.payload.accountId
      ? await deps.accounts.accountById(command.payload.accountId)
      : undefined;
    if (!found) return [out.warning(caller.key, "suspensionRefused", command.seq)];
    // BR-104: the proposal's alert is kept whichever way the moderator decides.
    const tell = await raiseAlert(caller, report, command.payload.alertAuthorities, now);
    const closed = await close(caller, report, "warned", now);
    tell();
    return [closed];
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
    listAlertedReports: guarded(onListAlerted),
    expel: guarded(onExpel),
    closeReport: guarded(onCloseReport),
    confirmSuspension: guarded(onConfirm),
    declineSuspension: guarded(onDecline),
    removeRoom: guarded(onRemoveRoom),
    /** `warn` without a report stays out of brick 8c (`moderation/01`). */
    later: (caller: ModerationCaller, command: ClientMessage): Promise<Outgoing[]> =>
      Promise.resolve(isModerator(ctx.state(), caller.sessionId) ? notAvailable(caller, command.seq) : forbidden(caller, command.seq)),
    /** Called from the hub tick, never awaited there (BR-076, BR-104, BR-107). */
    retryMails: (now: Date): Promise<void> => mail.retry(now),
  };
};
