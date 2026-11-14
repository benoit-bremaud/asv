/**
 * Moderation e-mails and their retries (`moderation/02d`, `02h`, `02i`): statements of reasons (BR-076),
 * the owner's authority alert (BR-104) and the decision e-mail to a member reporter (BR-107). Each one is
 * retried every 10 minutes for at most 7 days; the hub never waits for the provider (ADR-0013 amendment).
 */
import { alertDue, type Mailer, type OffenceCategory, type Random, type ReportOutcome } from "../domain";
import type { AccountIo } from "./account-io";
import type { LoadedReport, ModerationIo } from "./moderation-io";

/** Time between two retry rounds (BR-076, BR-104, BR-107). */
export const STATEMENT_RETRY_MS = 10 * 60_000;
/** BR-076, BR-107: a mail is given up 7 days after the decision. */
export const MAIL_GIVE_UP_MS = 7 * 24 * 60 * 60_000;

const day = (date: Date) => date.toISOString().slice(0, 10);
const automated = (triaged: boolean) =>
  triaged
    ? "Un tri automatique a classé le signalement avant la décision ; la décision a été prise par un humain."
    : "La décision a été prise par un humain ; aucun outil automatique n'a été utilisé.";
const CONTEST = "Pour la contester, réponds simplement à ce message.";

/** DSA art. 17 statement of reasons, in the chat's language (BR-076). */
export const suspensionStatement = (until: Date): string =>
  [
    "Bonjour,",
    "",
    "Ton compte asv a été supprimé et ton adresse e-mail est bloquée jusqu'au " + day(until) + ".",
    "Motif : trois avertissements actifs d'un modérateur pour non-respect des règles du chat.",
    automated(false),
    CONTEST,
  ].join("\n");

/** DSA art. 17 statement of a severe deletion (BR-076, BR-078, BR-103). */
export const severeStatement = (until: Date, triaged: boolean): string =>
  [
    "Bonjour,",
    "",
    "Ton compte asv a été supprimé et ton adresse e-mail est bloquée jusqu'au " + day(until) + ".",
    "Motif : un cas grave contraire aux règles du chat (prédation, menaces, contenu pédocriminel ou incitation à la violence).",
    automated(triaged),
    CONTEST,
  ].join("\n");

/** BR-107: the decision in general terms, never the target's pseudo or the sanction (DSA art. 16(5)). */
export const decisionText = (outcome: ReportOutcome, triaged: boolean): string =>
  [
    "Bonjour,",
    "",
    "Merci pour ton signalement sur asv. Un modérateur l'a examiné : " +
      (outcome === "noAction" ? "aucune mesure n'a été prise." : "une mesure a été prise."),
    automated(triaged),
    "Pour contester cette décision, réponds simplement à ce message.",
  ].join("\n");

export interface ModerationMailDeps {
  readonly mailer: Mailer;
  readonly moderation: ModerationIo;
  readonly accounts: AccountIo;
  readonly random: Random;
  readonly onStoreError: (error: unknown) => void;
}

/** A statement not yet accepted by the provider, retried until `giveUpAt` (BR-076). */
interface PendingStatement {
  readonly email: string;
  readonly statement: string;
  readonly giveUpAt: Date;
}

/** Sending and retrying; every method resolves, errors go to `onStoreError`. */
export const createModerationMail = (deps: ModerationMailDeps) => {
  let statements: PendingStatement[] = [];
  let lastRetry = 0;
  let retrying = false;

  /** `true` only when the provider accepted the mail. */
  const accepted = async (sending: () => Promise<boolean>): Promise<boolean> => {
    try {
      return await sending();
    } catch (cause) {
      deps.onStoreError(cause);
      return false;
    }
  };

  /** Tries one statement; a refused or failed one is kept for a retry until `giveUpAt` (BR-076). */
  const sendStatement = async (entry: PendingStatement): Promise<void> => {
    if (!(await accepted(() => deps.mailer.sendStatementOfReasons(entry.email, entry.statement)))) statements.push(entry);
  };

  /** BR-104: `notifiedAt` is set once the provider accepted; until then the retry round sends it again. */
  const sendAlert = async (reportId: string, category: OffenceCategory, now: Date): Promise<void> => {
    if (!(await accepted(() => deps.mailer.sendAuthorityAlert(reportId, category)))) return;
    try {
      await deps.moderation.markAlertNotified(reportId, now);
    } catch (cause) {
      deps.onStoreError(cause);
    }
  };

  /** BR-107: deleted once accepted, so the address is not kept longer than needed. */
  const sendDecision = async (mail: { readonly id: string; readonly email: string; readonly text: string }): Promise<void> => {
    if (!(await accepted(() => deps.mailer.sendReportDecision(mail.email, mail.text)))) return;
    try {
      await deps.moderation.deletePendingDecisionMail(mail.id);
    } catch (cause) {
      deps.onStoreError(cause);
    }
  };

  /**
   * BR-107 (`moderation/02i`): after any close, a member reporter whose account still exists gets the
   * decision. The address is read now and kept encrypted until the mail is accepted. Never rejects.
   */
  const notifyReporter = async (report: LoadedReport, outcome: ReportOutcome, now: Date): Promise<void> => {
    try {
      if (report.reporterAccountId === undefined) return;
      const reporter = await deps.accounts.accountById(report.reporterAccountId);
      if (!reporter) return;
      const mail = { id: deps.random.id(), email: reporter.account.email, text: decisionText(outcome, report.triage !== undefined) };
      await deps.moderation.savePendingDecisionMail({ ...mail, reportId: report.id, createdAt: now });
      // Not awaited: the hub queue must not wait for the provider.
      void sendDecision(mail);
    } catch (cause) {
      deps.onStoreError(cause);
    }
  };

  /** Alerts not yet accepted, on open and closed reports, younger than 7 days (BR-104). */
  const dueAlerts = async (now: Date) =>
    [...(await deps.moderation.openReports()), ...(await deps.moderation.alertedReports())].flatMap((report) =>
      report.alert && alertDue(report.alert, now) ? [{ id: report.id, category: report.alert.offenceCategory }] : []);

  const retryStored = async (now: Date): Promise<void> => {
    try {
      const alerts = await dueAlerts(now);
      const mails = await deps.moderation.pendingDecisionMails();
      const expired = mails.filter((mail) => now.getTime() - mail.createdAt.getTime() >= MAIL_GIVE_UP_MS);
      for (const mail of expired) await deps.moderation.deletePendingDecisionMail(mail.id);
      await Promise.all([
        ...alerts.map((alert) => sendAlert(alert.id, alert.category, now)),
        ...mails.filter((mail) => !expired.includes(mail)).map(sendDecision),
      ]);
    } catch (cause) {
      deps.onStoreError(cause);
    }
  };

  return {
    /** BR-076: tried now, kept 7 days for the retries. */
    statement: (email: string, statement: string, now: Date): Promise<void> =>
      sendStatement({ email, statement, giveUpAt: new Date(now.getTime() + MAIL_GIVE_UP_MS) }),
    alert: sendAlert,
    notifyReporter,
    /** Called from the hub tick, never awaited there; one retry round every `STATEMENT_RETRY_MS`. */
    async retry(now: Date): Promise<void> {
      if (retrying || now.getTime() - lastRetry < STATEMENT_RETRY_MS) return;
      retrying = true;
      lastRetry = now.getTime();
      const due = statements.filter((entry) => entry.giveUpAt.getTime() > now.getTime());
      statements = [];
      try {
        await Promise.all([...due.map(sendStatement), retryStored(now)]);
      } finally {
        retrying = false;
      }
    },
  };
};
