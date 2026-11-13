import { MODERATION_LIMITS, type ModerationStore, type StoredBan, type StoredReport } from "../../domain";

/**
 * In-memory moderation store of the Node transport (`moderation/04`): values arrive already encrypted or
 * hashed, and die with the process. Brick 9 adds the Durable Object SQLite twin.
 */
export const createMemoryModerationStore = (): ModerationStore & {
  /** Test hook: what is stored, to check nothing is in clear. */
  dump(): { reports: StoredReport[]; bans: StoredBan[] };
} => {
  const reports = new Map<string, StoredReport>();
  const bans = new Map<string, StoredBan>();
  const done = () => Promise.resolve();
  return {
    saveReport: (report) => {
      reports.set(report.id, report);
      return done();
    },
    findReport: (id) => Promise.resolve(reports.get(id)),
    openReports: () => Promise.resolve([...reports.values()].filter((report) => !report.closed)),
    saveBan: (ban) => {
      bans.set(ban.id, ban);
      return done();
    },
    activeBan(ipKeyedHash, pseudoKeyedHash, now) {
      const matching = [...bans.values()].filter(
        (ban) =>
          ban.until.getTime() > now.getTime() && (ban.ipKeyedHash === ipKeyedHash || ban.pseudoKeyedHash === pseudoKeyedHash),
      );
      return Promise.resolve(matching.sort((a, b) => b.until.getTime() - a.until.getTime())[0]);
    },
    purgeExpired(now) {
      const time = now.getTime();
      for (const [id, report] of reports)
        if (report.closed && report.closed.at.getTime() + MODERATION_LIMITS.closedReportMs <= time) reports.delete(id);
      for (const [id, ban] of bans) if (ban.until.getTime() + MODERATION_LIMITS.expiredBanMs <= time) bans.delete(id);
      return done();
    },
    dump: () => ({ reports: [...reports.values()], bans: [...bans.values()] }),
  };
};
