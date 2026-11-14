/**
 * Moderation storage seen through the crypto of ADR-0017 (`moderation/04`, `06`): the hub hands clear
 * reports to the domain; only ciphertext and keyed hashes reach the store.
 */
import {
  alertDue,
  foldPseudo,
  isOffenceCategory,
  type AlertChannel,
  type AuthorityAlert,
  type BanDecision,
  type FilingResult,
  type OffenceCategory,
  type ModerationStore,
  type ReportPatch,
  type Report,
  type ReportOutcome,
  type StoredAlert,
  type StoredReport,
  type Triage,
  type TriageLabel,
} from "../domain";
import type { Crypto } from "./crypto/cipher";
import { quotaKey } from "../domain/ip-key";

export interface ModerationIoDeps {
  readonly store: ModerationStore;
  readonly crypto: Crypto;
}

/** A triage decrypted with its label map (BR-100). */
export interface LoadedTriage extends Triage {
  readonly labels: readonly TriageLabel[];
}

/** A stored report decrypted, with its closing, triage and alert if any. */
export type LoadedReport = Report &
  Pick<StoredReport, "closed" | "struckAt"> & { readonly triage?: LoadedTriage; readonly alert?: AuthorityAlert };

/** A decision e-mail decrypted for sending (BR-107). */
export interface LoadedDecisionMail {
  readonly id: string;
  readonly email: string;
  readonly text: string;
  readonly createdAt: Date;
}

const isLabel = (value: unknown): value is TriageLabel =>
  typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).label === "string" &&
  typeof (value as Record<string, unknown>).pseudo === "string";

const field = (id: string, name: string) => `report:${id}:${name}`;

/** Builds the boundary; store and crypto errors propagate, the hub answers `warning unavailable`. */
export const createModerationIo = ({ store, crypto }: ModerationIoDeps) => {
  /** BR-112: every IP-keyed ban, report and triage hash uses the quota key (/64 for IPv6). */
  const ipHash = (ip: string) => crypto.keyedHash(`ip:${quotaKey(ip)}`);
  const pseudoHash = (pseudo: string) => crypto.keyedHash(`pseudo:${foldPseudo(pseudo)}`);
  const optional = async (value: string | undefined, id: string, name: string) =>
    value === undefined ? undefined : crypto.encrypt(value, field(id, name));
  const clear = async (value: string | undefined, id: string, name: string) =>
    value === undefined ? undefined : crypto.decrypt(value, field(id, name));

  const toStored = async (report: Report): Promise<StoredReport> => ({
    id: report.id,
    reason: report.reason,
    targetKind: report.targetKind,
    targetPseudo: await optional(report.targetPseudo, report.id, "targetPseudo"),
    targetRoomId: report.targetRoomId,
    targetRoomName: await optional(report.targetRoomName, report.id, "targetRoomName"),
    targetSessionId: report.targetSessionId,
    targetAccountId: report.targetAccountId,
    targetIpKeyedHash: report.targetIp === undefined ? undefined : await ipHash(report.targetIp),
    excerpt: await crypto.encrypt(report.excerpt, field(report.id, "excerpt")),
    context: await crypto.encrypt(JSON.stringify(report.context), field(report.id, "context")),
    authorPseudo: await crypto.encrypt(report.authorPseudo, field(report.id, "authorPseudo")),
    reporterAccountId: report.reporterAccountId,
    createdAt: report.createdAt,
  });

  /** @throws when the stored category is not one of §6: the ciphertext was not ours. */
  const toCategory = async (id: string, stored: string): Promise<OffenceCategory> => {
    const category = await crypto.decrypt(stored, field(id, "alertCategory"));
    if (!isOffenceCategory(category)) throw new Error("stored alert category is unknown");
    return category;
  };

  const toAlert = async (id: string, stored: StoredAlert): Promise<AuthorityAlert> => {
    const { offenceCategory, raisedBy, reference, ...clearFields } = stored;
    return {
      ...clearFields,
      offenceCategory: await toCategory(id, offenceCategory),
      raisedBy: await crypto.decrypt(raisedBy, field(id, "alertRaisedBy")),
      ...(reference === undefined ? {} : { reference: await crypto.decrypt(reference, field(id, "alertReference")) }),
    };
  };

  const toTriage = async (stored: StoredReport): Promise<LoadedTriage | undefined> => {
    if (!stored.triage) return undefined;
    const { category, urgency, summary, labels } = stored.triage;
    const map: unknown = JSON.parse(await crypto.decrypt(labels, field(stored.id, "triageLabels")));
    return {
      category,
      urgency,
      summary: await crypto.decrypt(summary, field(stored.id, "triageSummary")),
      labels: Array.isArray(map) ? map.filter(isLabel) : [],
    };
  };

  const toReport = async (stored: StoredReport): Promise<LoadedReport> => {
    const context: unknown = JSON.parse(await crypto.decrypt(stored.context, field(stored.id, "context")));
    const triage = await toTriage(stored);
    return {
      id: stored.id,
      reason: stored.reason,
      targetKind: stored.targetKind,
      targetPseudo: await clear(stored.targetPseudo, stored.id, "targetPseudo"),
      targetRoomId: stored.targetRoomId,
      ...(stored.targetRoomName === undefined ? {} : { targetRoomName: await crypto.decrypt(stored.targetRoomName, field(stored.id, "targetRoomName")) }),
      targetSessionId: stored.targetSessionId,
      targetAccountId: stored.targetAccountId,
      excerpt: await crypto.decrypt(stored.excerpt, field(stored.id, "excerpt")),
      context: Array.isArray(context) ? context.filter((line): line is string => typeof line === "string") : [],
      authorPseudo: await crypto.decrypt(stored.authorPseudo, field(stored.id, "authorPseudo")),
      ...(stored.reporterAccountId === undefined ? {} : { reporterAccountId: stored.reporterAccountId }),
      createdAt: stored.createdAt,
      ...(stored.alert ? { alert: await toAlert(stored.id, stored.alert) } : {}),
      ...(stored.struckAt ? { struckAt: stored.struckAt } : {}),
      ...(stored.closed ? { closed: stored.closed } : {}),
      ...(triage ? { triage } : {}),
    };
  };

  /**
   * Sets only the given fields in the store, so a write made meanwhile outside the hub queue (the owner's
   * filing, `notifiedAt`) is never overwritten.
   */
  const update = async (id: string, change: ReportPatch): Promise<void> => {
    if (!(await store.patchReport(id, change))) throw new Error(`report ${id} not found`);
  };

  /** The stored IP hash survives the decryption, so a ban can use it once the target left. */
  const ipHashOf = async (id: string): Promise<string | undefined> => (await store.findReport(id))?.targetIpKeyedHash;

  return {
    saveReport: async (report: Report) => store.saveReport(await toStored(report)),
    async findReport(id: string): Promise<LoadedReport | undefined> {
      const stored = await store.findReport(id);
      return stored && toReport(stored);
    },
    async openReports(): Promise<LoadedReport[]> {
      return Promise.all((await store.openReports()).map(toReport));
    },
    /** BR-104: closed reports with an alert, decrypted; the hub orders and caps them. */
    async alertedReports(): Promise<LoadedReport[]> {
      return Promise.all((await store.alertedReports()).map(toReport));
    },
    /** BR-104: one alert per report, `pending`; `false` when the report already has one. */
    async saveAuthorityAlert(reportId: string, category: OffenceCategory, by: string, at: Date): Promise<boolean> {
      return store.saveAuthorityAlert(reportId, {
        offenceCategory: await crypto.encrypt(category, field(reportId, "alertCategory")),
        raisedBy: await crypto.encrypt(by, field(reportId, "alertRaisedBy")),
        raisedAt: at,
        status: "pending",
      });
    },
    markAlertNotified: (reportId: string, at: Date) => store.markAlertNotified(reportId, at),
    /**
     * BR-104: the alerts due at `now`, only their category decrypted. One that cannot be read is in
     * `failures`, so it never stops the others.
     */
    async pendingAlerts(now: Date): Promise<{ alerts: { reportId: string; category: OffenceCategory }[]; failures: unknown[] }> {
      const due = (await store.pendingAlerts()).filter((alert) => alertDue(alert, now));
      const read = await Promise.allSettled(due.map(async (alert) => ({ reportId: alert.reportId, category: await toCategory(alert.reportId, alert.offenceCategory) })));
      return {
        alerts: read.flatMap((one) => (one.status === "fulfilled" ? [one.value] : [])),
        failures: read.flatMap((one) => (one.status === "rejected" ? [one.reason as unknown] : [])),
      };
    },
    /** UC20: the reference is encrypted like the report (BR-105). */
    async recordFiling(reportId: string, channel: AlertChannel, reference: string, at: Date): Promise<FilingResult> {
      return store.recordFiling(reportId, channel, await crypto.encrypt(reference, field(reportId, "alertReference")), at);
    },
    /** BR-107: the address and the text are kept encrypted until the provider accepts the mail. */
    async savePendingDecisionMail(mail: LoadedDecisionMail & { readonly reportId: string }): Promise<void> {
      await store.savePendingDecisionMail({
        id: mail.id,
        reportId: mail.reportId,
        email: await crypto.encrypt(mail.email, `decisionMail:${mail.id}:email`),
        text: await crypto.encrypt(mail.text, `decisionMail:${mail.id}:text`),
        createdAt: mail.createdAt,
      });
    },
    async pendingDecisionMails(): Promise<LoadedDecisionMail[]> {
      return Promise.all((await store.pendingDecisionMails()).map(async (mail) => ({
        id: mail.id,
        email: await crypto.decrypt(mail.email, `decisionMail:${mail.id}:email`),
        text: await crypto.decrypt(mail.text, `decisionMail:${mail.id}:text`),
        createdAt: mail.createdAt,
      })));
    },
    deletePendingDecisionMail: (id: string) => store.deletePendingDecisionMail(id),
    /** BR-100, BR-101: summary and label map encrypted; the store ignores a closed report. */
    async saveTriage(id: string, triage: Triage, labels: readonly TriageLabel[]): Promise<void> {
      await store.saveTriage(id, {
        category: triage.category,
        urgency: triage.urgency,
        summary: await crypto.encrypt(triage.summary, field(id, "triageSummary")),
        labels: await crypto.encrypt(JSON.stringify(labels), field(id, "triageLabels")),
      });
    },
    /** BR-101: the reporter's IP is counted by its keyed hash only. */
    ipKeyedHash: (ip: string) => ipHash(ip),
    /** BR-055, BR-057: one outcome, the moderator and the time. */
    async closeReport(report: Report, outcome: ReportOutcome, by: string, at: Date): Promise<void> {
      await update(report.id, { closed: { outcome, by, at } });
    },
    /** BR-074: the strike of this report is given, once. */
    async markStruck(id: string, at: Date): Promise<void> {
      await update(id, { struckAt: at });
    },
    /** The live IP when the domain has one, else the hash captured on the report. */
    async saveBan(ban: BanDecision, reportId: string, id: string, now: Date): Promise<void> {
      await store.saveBan({
        id,
        ipKeyedHash: ban.ip === undefined ? await ipHashOf(reportId) : await ipHash(ban.ip),
        pseudoKeyedHash: ban.pseudo === undefined ? undefined : await pseudoHash(ban.pseudo),
        until: ban.until,
        decidedBy: ban.decidedBy,
        decidedAt: now,
      });
    },
    /** BR-008 at entry. */
    async activeBan(ip: string, pseudo: string, now: Date): Promise<{ until: Date } | undefined> {
      const ban = await store.activeBan(await ipHash(ip), await pseudoHash(pseudo), now);
      return ban && { until: ban.until };
    },
    purgeExpired: (now: Date) => store.purgeExpired(now),
  };
};

/** The moderation boundary the hub depends on. */
export type ModerationIo = ReturnType<typeof createModerationIo>;
