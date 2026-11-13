/**
 * Moderation storage seen through the crypto of ADR-0017 (`moderation/04`, `06`): the hub hands clear
 * reports to the domain; only ciphertext and keyed hashes reach the store.
 */
import { foldPseudo, type BanDecision, type ModerationStore, type Report, type ReportOutcome, type StoredReport } from "../domain";
import type { Crypto } from "./crypto/cipher";

export interface ModerationIoDeps {
  readonly store: ModerationStore;
  readonly crypto: Crypto;
}

/** A stored report decrypted, with its closing if any. */
export type LoadedReport = Report & Pick<StoredReport, "closed" | "struckAt">;

const field = (id: string, name: string) => `report:${id}:${name}`;

/** Builds the boundary; store and crypto errors propagate, the hub answers `warning unavailable`. */
export const createModerationIo = ({ store, crypto }: ModerationIoDeps) => {
  const ipHash = (ip: string) => crypto.keyedHash(`ip:${ip}`);
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
    targetSessionId: report.targetSessionId,
    targetAccountId: report.targetAccountId,
    targetIpKeyedHash: report.targetIp === undefined ? undefined : await ipHash(report.targetIp),
    excerpt: await crypto.encrypt(report.excerpt, field(report.id, "excerpt")),
    context: await crypto.encrypt(JSON.stringify(report.context), field(report.id, "context")),
    authorPseudo: await crypto.encrypt(report.authorPseudo, field(report.id, "authorPseudo")),
    createdAt: report.createdAt,
  });

  const toReport = async (stored: StoredReport): Promise<LoadedReport> => {
    const context: unknown = JSON.parse(await crypto.decrypt(stored.context, field(stored.id, "context")));
    return {
      id: stored.id,
      reason: stored.reason,
      targetKind: stored.targetKind,
      targetPseudo: await clear(stored.targetPseudo, stored.id, "targetPseudo"),
      targetRoomId: stored.targetRoomId,
      targetSessionId: stored.targetSessionId,
      targetAccountId: stored.targetAccountId,
      excerpt: await crypto.decrypt(stored.excerpt, field(stored.id, "excerpt")),
      context: Array.isArray(context) ? context.filter((line): line is string => typeof line === "string") : [],
      authorPseudo: await crypto.decrypt(stored.authorPseudo, field(stored.id, "authorPseudo")),
      createdAt: stored.createdAt,
      ...(stored.struckAt ? { struckAt: stored.struckAt } : {}),
      ...(stored.closed ? { closed: stored.closed } : {}),
    };
  };

  /** Rewrites the stored report as it is, so the keyed IP hash and the ciphertexts are kept. */
  const update = async (id: string, change: Partial<StoredReport>): Promise<void> => {
    const stored = await store.findReport(id);
    if (!stored) throw new Error(`report ${id} not found`);
    await store.saveReport({ ...stored, ...change });
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
