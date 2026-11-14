import {
  MODERATION_LIMITS,
  type ModerationStore,
  type PendingDecisionMail,
  type StoredBan,
  type StoredReport,
} from "../../domain";

/** BR-061, BR-105: how long a closed report is kept. */
const keptMs = (report: StoredReport): number => (report.alert ? MODERATION_LIMITS.alertedReportMs : MODERATION_LIMITS.closedReportMs);

/**
 * In-memory moderation store of the Node transport (`moderation/04`): values arrive already encrypted or
 * hashed, and die with the process. Brick 9 adds the Durable Object SQLite twin.
 */
export const createMemoryModerationStore = (): ModerationStore & {
  /** Test hook: what is stored, to check nothing is in clear. */
  dump(): { reports: StoredReport[]; bans: StoredBan[]; mails: PendingDecisionMail[] };
} => {
  const reports = new Map<string, StoredReport>();
  const bans = new Map<string, StoredBan>();
  const mails = new Map<string, PendingDecisionMail>();
  const done = () => Promise.resolve();
  return {
    saveReport: (report) => {
      reports.set(report.id, report);
      return done();
    },
    findReport: (id) => Promise.resolve(reports.get(id)),
    openReports: () => Promise.resolve([...reports.values()].filter((report) => !report.closed)),
    alertedReports: () => Promise.resolve([...reports.values()].filter((report) => report.closed && report.alert)),
    saveTriage: (id, triage) => {
      const report = reports.get(id);
      if (report && !report.closed) reports.set(id, { ...report, triage });
      return done();
    },
    saveAuthorityAlert: (reportId, alert) => {
      const report = reports.get(reportId);
      if (!report || report.alert) return Promise.resolve(false);
      reports.set(reportId, { ...report, alert });
      return Promise.resolve(true);
    },
    markAlertNotified: (reportId, at) => {
      const report = reports.get(reportId);
      if (report?.alert) reports.set(reportId, { ...report, alert: { ...report.alert, notifiedAt: at } });
      return done();
    },
    recordFiling: (reportId, channel, reference, at) => {
      const report = reports.get(reportId);
      if (!report?.alert) return Promise.resolve("noAlert");
      if (report.alert.status === "filed") return Promise.resolve("alreadyFiled");
      reports.set(reportId, { ...report, alert: { ...report.alert, status: "filed", channel, reference, filedAt: at } });
      return Promise.resolve("filed");
    },
    savePendingDecisionMail: (mail) => {
      mails.set(mail.id, mail);
      return done();
    },
    pendingDecisionMails: () => Promise.resolve([...mails.values()]),
    deletePendingDecisionMail: (id) => {
      mails.delete(id);
      return done();
    },
    saveBan: (ban) => {
      bans.set(ban.id, ban);
      return done();
    },
    activeBan(ipKeyedHash, pseudoKeyedHash, now) {
      const matching = [...bans.values()].filter(
        (ban) =>
          ban.until.getTime() > now.getTime() && (ban.ipKeyedHash === ipKeyedHash || ban.pseudoKeyedHash === pseudoKeyedHash),
      );
      return Promise.resolve([...matching].sort((a, b) => b.until.getTime() - a.until.getTime())[0]);
    },
    purgeExpired(now) {
      const time = now.getTime();
      for (const [id, report] of reports) if (report.closed && report.closed.at.getTime() + keptMs(report) <= time) reports.delete(id);
      for (const [id, ban] of bans) if (ban.until.getTime() + MODERATION_LIMITS.expiredBanMs <= time) bans.delete(id);
      return done();
    },
    dump: () => ({ reports: [...reports.values()], bans: [...bans.values()], mails: [...mails.values()] }),
  };
};
