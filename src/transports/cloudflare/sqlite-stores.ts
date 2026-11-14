/**
 * SQLite stores of the Hub Durable Object (ADR-0020 §4, `platform/09`): one table set per port, the Durable
 * Object twin of the Node stores. Personal values (e-mails, pseudos, moderator names, texts, IPs) arrive
 * encrypted or keyed-hashed (ADR-0017, BR-083); ids, dates, counters, categories and outcomes stay clear. The
 * connection log, which gets clear lines from the hub, encrypts its personal fields itself. Gender, age and city never
 * reach a store. Migrations are additive only (`platform/10`).
 */
import {
  ACCOUNT_LIMITS,
  AUTHORITY_LIMITS,
  MODERATION_LIMITS,
  type AccountStore,
  type ConnectionLogStore,
  type LegalVaultStore,
  type ModerationStore,
  type ModeratorStore,
  type PendingDecisionMail,
  type PendingStatement,
  type StoredAccount,
  type StoredAlert,
  type StoredBan,
  type StoredCode,
  type StoredInvitation,
  type StoredModerator,
  type StoredReport,
} from "../../domain";
import type { Crypto } from "../../server/crypto/cipher";
import { MAIL_GIVE_UP_MS } from "../../server/moderation-mail";
import {
  dateOf,
  first,
  int,
  optionalDate,
  rows,
  run,
  text,
  textOf,
  type SqlRow,
  type SqlStorage,
} from "./sql";

/** Connection and contribution lines are kept 1 year (BR-060). */
export const LOG_RETENTION_MS = 365 * 24 * 60 * 60_000;

/**
 * Schema steps, applied in order once each; a step is never edited after a deploy, only appended
 * (additive migrations, `platform/10`).
 */
export const MIGRATIONS: readonly (readonly string[])[] = [
  [
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    "CREATE TABLE connection_lines (connection_id TEXT PRIMARY KEY, sealed TEXT NOT NULL, protocols TEXT NOT NULL, opened_at INTEGER NOT NULL, closed_at INTEGER)",
    "CREATE TABLE contribution_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, connection_id TEXT NOT NULL, protocols TEXT NOT NULL, at INTEGER NOT NULL)",
    "CREATE TABLE accounts (id TEXT PRIMARY KEY, email TEXT NOT NULL, email_keyed_hash TEXT NOT NULL UNIQUE, verified_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, strikes TEXT NOT NULL)",
    "CREATE TABLE codes (session_id TEXT PRIMARY KEY, code_hash TEXT NOT NULL, email TEXT NOT NULL, email_keyed_hash TEXT NOT NULL, remember INTEGER NOT NULL, tries_left INTEGER NOT NULL, expires_at INTEGER NOT NULL)",
    "CREATE TABLE code_events (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, email_keyed_hash TEXT NOT NULL, ip_keyed_hash TEXT, at INTEGER NOT NULL)",
    "CREATE TABLE devices (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL)",
    "CREATE TABLE email_blocks (email_keyed_hash TEXT PRIMARY KEY, until INTEGER NOT NULL)",
    "CREATE TABLE carry_overs (email_keyed_hash TEXT PRIMARY KEY, expiries TEXT NOT NULL)",
    "CREATE TABLE vault (id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, sealed_email TEXT NOT NULL, created_at INTEGER NOT NULL, closed_at INTEGER NOT NULL)",
    "CREATE TABLE reports (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, closed_at INTEGER, data TEXT NOT NULL)",
    "CREATE TABLE alerts (report_id TEXT PRIMARY KEY, raised_at INTEGER NOT NULL, notified_at INTEGER, status TEXT NOT NULL, data TEXT NOT NULL)",
    "CREATE TABLE pending_mails (id TEXT PRIMARY KEY, report_id TEXT NOT NULL, email TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL)",
    "CREATE TABLE pending_statements (id TEXT PRIMARY KEY, email TEXT NOT NULL, text TEXT NOT NULL, give_up_at INTEGER NOT NULL)",
    "CREATE TABLE bans (id TEXT PRIMARY KEY, ip_keyed_hash TEXT, pseudo_keyed_hash TEXT, until INTEGER NOT NULL, decided_by TEXT NOT NULL, decided_at INTEGER NOT NULL)",
    "CREATE TABLE moderators (name_keyed_hash TEXT PRIMARY KEY, credential_keyed_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, credential_id TEXT NOT NULL, public_key TEXT NOT NULL, sign_count INTEGER NOT NULL)",
    "CREATE TABLE invitations (token_hash TEXT PRIMARY KEY, name_keyed_hash TEXT NOT NULL, name TEXT NOT NULL, expires_at INTEGER NOT NULL)",
  ],
];

/** Applies the steps not applied yet, each in one transaction; returns the schema version. */
export const migrate = (storage: SqlStorage): number => {
  run(
    storage,
    "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const current = Number(
    text(
      first(storage, "SELECT value FROM meta WHERE key = 'schema'") ?? {},
      "value",
    ) ?? 0,
  );
  MIGRATIONS.slice(current).forEach((step, index) =>
    storage.transactionSync(() => {
      for (const statement of step) run(storage, statement);
      run(
        storage,
        "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema', ?)",
        String(current + index + 1),
      );
    }),
  );
  return MIGRATIONS.length;
};

/** BR-109: at start, before any socket, every connection line left open is closed at `at`. */
export const closeOpenLines = (storage: SqlStorage, at: Date): void =>
  run(
    storage,
    "UPDATE connection_lines SET closed_at = ? WHERE closed_at IS NULL",
    at.getTime(),
  );

/** A value of the `meta` table (the last daily purge, BR-110). */
export const readMeta = (
  storage: SqlStorage,
  key: string,
): string | undefined =>
  text(
    first(storage, "SELECT value FROM meta WHERE key = ?", key) ?? {},
    "value",
  );

export const writeMeta = (
  storage: SqlStorage,
  key: string,
  value: string,
): void =>
  run(
    storage,
    "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
    key,
    value,
  );

/** BR-110: is any authority alert, decision e-mail or statement of reasons still to retry at `now`? */
export const hasPendingMail = (storage: SqlStorage, now: Date): boolean => {
  const time = now.getTime();
  const count = (query: string, ...bindings: number[]) =>
    int(first(storage, query, ...bindings) ?? {}, "n") ?? 0;
  return (
    count(
      "SELECT COUNT(*) AS n FROM pending_statements WHERE give_up_at > ?",
      time,
    ) +
      count(
        "SELECT COUNT(*) AS n FROM pending_mails WHERE created_at > ?",
        time - MAIL_GIVE_UP_MS,
      ) +
      count(
        "SELECT COUNT(*) AS n FROM alerts WHERE notified_at IS NULL AND raised_at > ?",
        time - AUTHORITY_LIMITS.alertRetryMs,
      ) >
    0
  );
};

/** Personal fields of a connection line, encrypted together (ADR-0020 §4: the tunnel exception ends). */
interface SealedLine {
  readonly ip: string;
  readonly port?: number;
  readonly pseudo: string;
  readonly accountId?: string;
}

/**
 * Connection log (BR-060): IP, port, pseudo and account id ciphertext, bound to the connection id; dates and
 * protocols clear. `purge` drops lines older than a year (alarm, BR-110).
 */
export const createSqlLog = (
  storage: SqlStorage,
  crypto: Crypto,
): ConnectionLogStore & { purge(now: Date): Promise<void> } =>
  rejecting({
    async open(line) {
      const sealed: SealedLine = {
        ip: line.ip,
        port: line.port,
        pseudo: line.pseudo,
        accountId: line.accountId,
      };
      const value = await crypto.encrypt(
        JSON.stringify(sealed),
        `connection:${line.connectionId}`,
      );
      run(
        storage,
        "INSERT OR REPLACE INTO connection_lines (connection_id, sealed, protocols, opened_at, closed_at) VALUES (?, ?, ?, ?, NULL)",
        line.connectionId,
        value,
        line.protocols,
        line.openedAt.getTime(),
      );
    },
    close: (connectionId, at) =>
      Promise.resolve(
        run(
          storage,
          "UPDATE connection_lines SET closed_at = ? WHERE connection_id = ? AND closed_at IS NULL",
          at.getTime(),
          connectionId,
        ),
      ),
    appendContribution: (line) =>
      Promise.resolve(
        run(
          storage,
          "INSERT INTO contribution_lines (connection_id, protocols, at) VALUES (?, ?, ?)",
          line.connectionId,
          line.protocols,
          line.at.getTime(),
        ),
      ),
    purge(now) {
      const limit = now.getTime() - LOG_RETENTION_MS;
      storage.transactionSync(() => {
        run(
          storage,
          "DELETE FROM connection_lines WHERE opened_at <= ?",
          limit,
        );
        run(storage, "DELETE FROM contribution_lines WHERE at <= ?", limit);
      });
      return done();
    },
  });

const toAccount = (row: SqlRow): StoredAccount => ({
  id: textOf(row, "id"),
  email: textOf(row, "email"),
  emailKeyedHash: textOf(row, "email_keyed_hash"),
  verifiedAt: dateOf(row, "verified_at"),
  lastSeenAt: dateOf(row, "last_seen_at"),
  strikes: (JSON.parse(textOf(row, "strikes")) as number[]).map((at) => ({
    expiresAt: new Date(at),
  })),
});

const toCode = (row: SqlRow): StoredCode => ({
  sessionId: textOf(row, "session_id"),
  codeHash: textOf(row, "code_hash"),
  email: textOf(row, "email"),
  emailKeyedHash: textOf(row, "email_keyed_hash"),
  remember: int(row, "remember") === 1,
  triesLeft: int(row, "tries_left") ?? 0,
  expiresAt: dateOf(row, "expires_at"),
});

const done = (): Promise<void> => Promise.resolve();

/**
 * The ports are asynchronous: a storage error thrown synchronously by a method becomes a rejected promise, so
 * callers' `catch` and `onStoreError` paths see it (the transaction has already rolled back).
 */
const rejecting = <T extends object>(store: T): T =>
  Object.fromEntries(
    Object.entries(store).map(([name, member]: [string, unknown]) => [
      name,
      typeof member === "function"
        ? (...args: unknown[]): unknown => {
            try {
              return Reflect.apply(member, store, args);
            } catch (error) {
              return Promise.reject(
                error instanceof Error ? error : new Error(String(error)),
              );
            }
          }
        : member,
    ]),
  ) as T;

/** Account records (`accounts/04`), the SQLite twin of `createMemoryAccountStore`. */
export const createSqlAccountStore = (storage: SqlStorage): AccountStore => {
  const exec = (query: string, ...bindings: (string | number | null)[]) => {
    run(storage, query, ...bindings);
    return done();
  };
  const account = (query: string, ...bindings: (string | number)[]) => {
    const row = first(storage, query, ...bindings);
    return Promise.resolve(row && toAccount(row));
  };
  return rejecting({
    saveCode: (code) =>
      exec(
        "INSERT OR REPLACE INTO codes (session_id, code_hash, email, email_keyed_hash, remember, tries_left, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        code.sessionId,
        code.codeHash,
        code.email,
        code.emailKeyedHash,
        code.remember ? 1 : 0,
        code.triesLeft,
        code.expiresAt.getTime(),
      ),
    loadCode(sessionId) {
      const row = first(
        storage,
        "SELECT * FROM codes WHERE session_id = ?",
        sessionId,
      );
      return Promise.resolve(row && toCode(row));
    },
    deleteCode: (sessionId) =>
      exec("DELETE FROM codes WHERE session_id = ?", sessionId),
    recordCodeIssued: (emailKeyedHash, ipKeyedHash, at) =>
      exec(
        "INSERT INTO code_events (kind, email_keyed_hash, ip_keyed_hash, at) VALUES ('issued', ?, ?, ?)",
        emailKeyedHash,
        ipKeyedHash,
        at.getTime(),
      ),
    recordWrongTry: (emailKeyedHash, at) =>
      exec(
        "INSERT INTO code_events (kind, email_keyed_hash, ip_keyed_hash, at) VALUES ('wrongTry', ?, NULL, ?)",
        emailKeyedHash,
        at.getTime(),
      ),
    codeCounts(emailKeyedHash, ipKeyedHash, now) {
      const since = now.getTime() - ACCOUNT_LIMITS.quotaWindowMs;
      const daySince = now.getTime() - ACCOUNT_LIMITS.wrongTryWindowMs;
      const email =
        first(
          storage,
          "SELECT COUNT(*) AS n, MAX(at) AS last FROM code_events WHERE kind = 'issued' AND email_keyed_hash = ? AND at > ?",
          emailKeyedHash,
          since,
        ) ?? {};
      const ip =
        first(
          storage,
          "SELECT COUNT(*) AS n FROM code_events WHERE kind = 'issued' AND ip_keyed_hash = ? AND at > ?",
          ipKeyedHash,
          since,
        ) ?? {};
      const wrong =
        first(
          storage,
          "SELECT COUNT(*) AS n FROM code_events WHERE kind = 'wrongTry' AND email_keyed_hash = ? AND at > ?",
          emailKeyedHash,
          daySince,
        ) ?? {};
      return Promise.resolve({
        email: int(email, "n") ?? 0,
        ip: int(ip, "n") ?? 0,
        lastEmailCodeAt: optionalDate(email, "last"),
        wrongTries: int(wrong, "n") ?? 0,
      });
    },
    findAccountByEmailHash: (hash) =>
      account("SELECT * FROM accounts WHERE email_keyed_hash = ?", hash),
    findAccountById: (accountId) =>
      account("SELECT * FROM accounts WHERE id = ?", accountId),
    saveAccount: (stored) =>
      exec(
        "INSERT OR REPLACE INTO accounts (id, email, email_keyed_hash, verified_at, last_seen_at, strikes) VALUES (?, ?, ?, ?, ?, ?)",
        stored.id,
        stored.email,
        stored.emailKeyedHash,
        stored.verifiedAt.getTime(),
        stored.lastSeenAt.getTime(),
        JSON.stringify(
          stored.strikes.map((strike) => strike.expiresAt.getTime()),
        ),
      ),
    deleteAccount: (accountId) =>
      exec("DELETE FROM accounts WHERE id = ?", accountId),
    saveDevice: (device) =>
      exec(
        "INSERT OR REPLACE INTO devices (token_hash, account_id, expires_at) VALUES (?, ?, ?)",
        device.tokenHash,
        device.accountId,
        device.expiresAt.getTime(),
      ),
    accountForDevice: (tokenHash, now) =>
      account(
        "SELECT accounts.* FROM devices JOIN accounts ON accounts.id = devices.account_id WHERE devices.token_hash = ? AND devices.expires_at > ?",
        tokenHash,
        now.getTime(),
      ),
    deleteDevice: (tokenHash) =>
      exec("DELETE FROM devices WHERE token_hash = ?", tokenHash),
    deleteAllDevices: (accountId) =>
      exec("DELETE FROM devices WHERE account_id = ?", accountId),
    blockEmail: (hash, until) =>
      exec(
        "INSERT OR REPLACE INTO email_blocks (email_keyed_hash, until) VALUES (?, ?)",
        hash,
        until.getTime(),
      ),
    isBlocked: (hash, now) =>
      Promise.resolve(
        first(
          storage,
          "SELECT 1 AS hit FROM email_blocks WHERE email_keyed_hash = ? AND until > ?",
          hash,
          now.getTime(),
        ) !== undefined,
      ),
    loadCarryOver(hash) {
      const row = first(
        storage,
        "SELECT expiries FROM carry_overs WHERE email_keyed_hash = ?",
        hash,
      );
      return Promise.resolve(
        row &&
          (JSON.parse(textOf(row, "expiries")) as number[]).map(
            (at) => new Date(at),
          ),
      );
    },
    saveCarryOver: (hash, expiries) =>
      exec(
        "INSERT OR REPLACE INTO carry_overs (email_keyed_hash, expiries) VALUES (?, ?)",
        hash,
        JSON.stringify(expiries.map((at) => at.getTime())),
      ),
    deleteCarryOver: (hash) =>
      exec("DELETE FROM carry_overs WHERE email_keyed_hash = ?", hash),
    purgeExpired(now) {
      const time = now.getTime();
      storage.transactionSync(() => {
        run(storage, "DELETE FROM codes WHERE expires_at <= ?", time);
        run(storage, "DELETE FROM devices WHERE expires_at <= ?", time);
        run(storage, "DELETE FROM email_blocks WHERE until <= ?", time);
        for (const row of rows(
          storage,
          "SELECT email_keyed_hash, expiries FROM carry_overs",
        )) {
          const expiries = JSON.parse(textOf(row, "expiries")) as number[];
          if (expiries.every((at) => at <= time))
            run(
              storage,
              "DELETE FROM carry_overs WHERE email_keyed_hash = ?",
              textOf(row, "email_keyed_hash"),
            );
        }
        run(
          storage,
          "DELETE FROM code_events WHERE kind = 'issued' AND at <= ?",
          time - ACCOUNT_LIMITS.quotaWindowMs,
        );
        run(
          storage,
          "DELETE FROM code_events WHERE kind = 'wrongTry' AND at <= ?",
          time - ACCOUNT_LIMITS.wrongTryWindowMs,
        );
      });
      return done();
    },
  });
};

/** Legal vault (BR-081, ADR-0014): write-only for the application; the account id goes after 1 year, the row after 5. */
export const createSqlVault = (storage: SqlStorage): LegalVaultStore =>
  rejecting({
    record: (entry) =>
      Promise.resolve(
        run(
          storage,
          "INSERT INTO vault (account_id, sealed_email, created_at, closed_at) VALUES (?, ?, ?, ?)",
          entry.accountId,
          entry.sealedEmail,
          entry.createdAt.getTime(),
          entry.closedAt.getTime(),
        ),
      ),
    purgeExpired(now) {
      const time = now.getTime();
      storage.transactionSync(() => {
        run(
          storage,
          "DELETE FROM vault WHERE closed_at + ? <= ?",
          ACCOUNT_LIMITS.vaultRetentionMs,
          time,
        );
        run(
          storage,
          "UPDATE vault SET account_id = '' WHERE closed_at + ? <= ?",
          ACCOUNT_LIMITS.vaultIdentityMs,
          time,
        );
      });
      return done();
    },
  });

/** A report row's JSON: every field but the alert, dates as epoch milliseconds. */
type ReportData = Omit<
  StoredReport,
  "alert" | "createdAt" | "struckAt" | "closed"
> & {
  readonly createdAt: number;
  readonly struckAt?: number;
  readonly closed?: Omit<NonNullable<StoredReport["closed"]>, "at"> & {
    readonly at: number;
  };
};

type AlertData = Omit<
  StoredAlert,
  "raisedAt" | "notifiedAt" | "filedAt" | "status"
> & { readonly filedAt?: number };

const reportData = (report: StoredReport): ReportData => {
  const { createdAt, struckAt, closed, ...others } = report;
  const rest: Omit<
    StoredReport,
    "alert" | "createdAt" | "struckAt" | "closed"
  > = others;
  // The alert lives in its own table.
  Reflect.deleteProperty(rest, "alert");
  return {
    ...rest,
    createdAt: createdAt.getTime(),
    ...(struckAt ? { struckAt: struckAt.getTime() } : {}),
    ...(closed ? { closed: { ...closed, at: closed.at.getTime() } } : {}),
  };
};

const fromReportData = (
  data: ReportData,
  alert: StoredAlert | undefined,
): StoredReport => {
  const { createdAt, struckAt, closed, ...rest } = data;
  return {
    ...rest,
    createdAt: new Date(createdAt),
    ...(struckAt === undefined ? {} : { struckAt: new Date(struckAt) }),
    ...(closed ? { closed: { ...closed, at: new Date(closed.at) } } : {}),
    ...(alert ? { alert } : {}),
  };
};

const alertData = (alert: StoredAlert): AlertData => {
  const { offenceCategory, raisedBy, reference, channel, filedAt } = alert;
  return {
    offenceCategory,
    raisedBy,
    ...(reference === undefined ? {} : { reference }),
    ...(channel === undefined ? {} : { channel }),
    ...(filedAt ? { filedAt: filedAt.getTime() } : {}),
  };
};

const toAlert = (row: SqlRow): StoredAlert => {
  const { filedAt, ...rest } = JSON.parse(textOf(row, "data")) as AlertData;
  const notifiedAt = optionalDate(row, "notified_at");
  return {
    ...rest,
    raisedAt: dateOf(row, "raised_at"),
    status: textOf(row, "status") as StoredAlert["status"],
    ...(notifiedAt ? { notifiedAt } : {}),
    ...(filedAt === undefined ? {} : { filedAt: new Date(filedAt) }),
  };
};

const toBan = (row: SqlRow): StoredBan => {
  const ip = text(row, "ip_keyed_hash");
  const pseudo = text(row, "pseudo_keyed_hash");
  return {
    id: textOf(row, "id"),
    ...(ip === undefined ? {} : { ipKeyedHash: ip }),
    ...(pseudo === undefined ? {} : { pseudoKeyedHash: pseudo }),
    until: dateOf(row, "until"),
    decidedBy: textOf(row, "decided_by"),
    decidedAt: dateOf(row, "decided_at"),
  };
};

/**
 * Reports, alerts, bans and pending mails (`moderation/04`), the SQLite twin of `createMemoryModerationStore`.
 * `onPending` runs after every write that leaves a mail to retry, so the transport can arm its alarm (BR-110).
 */
export const createSqlModerationStore = (
  storage: SqlStorage,
  onPending: () => void = () => undefined,
): ModerationStore => {
  const alertOf = (reportId: string) => {
    const row = first(
      storage,
      "SELECT * FROM alerts WHERE report_id = ?",
      reportId,
    );
    return row && toAlert(row);
  };
  const toReport = (row: SqlRow) =>
    fromReportData(
      JSON.parse(textOf(row, "data")) as ReportData,
      alertOf(textOf(row, "id")),
    );
  const reportOf = (id: string) => {
    const row = first(storage, "SELECT * FROM reports WHERE id = ?", id);
    return row && toReport(row);
  };
  const writeReport = (report: StoredReport) =>
    run(
      storage,
      "INSERT OR REPLACE INTO reports (id, created_at, closed_at, data) VALUES (?, ?, ?, ?)",
      report.id,
      report.createdAt.getTime(),
      report.closed?.at.getTime() ?? null,
      JSON.stringify(reportData(report)),
    );
  const writeAlert = (reportId: string, alert: StoredAlert) =>
    run(
      storage,
      "INSERT OR REPLACE INTO alerts (report_id, raised_at, notified_at, status, data) VALUES (?, ?, ?, ?, ?)",
      reportId,
      alert.raisedAt.getTime(),
      alert.notifiedAt?.getTime() ?? null,
      alert.status,
      JSON.stringify(alertData(alert)),
    );

  return rejecting({
    saveReport: (report) => {
      storage.transactionSync(() => {
        writeReport(report);
        if (report.alert) writeAlert(report.id, report.alert);
      });
      return done();
    },
    patchReport: (id, patch) =>
      Promise.resolve(
        storage.transactionSync(() => {
          const report = reportOf(id);
          if (report) writeReport({ ...report, ...patch });
          return report !== undefined;
        }),
      ),
    findReport: (id) => Promise.resolve(reportOf(id)),
    openReports: () =>
      Promise.resolve(
        rows(
          storage,
          "SELECT * FROM reports WHERE closed_at IS NULL ORDER BY created_at",
        ).map(toReport),
      ),
    alertedReports: () =>
      Promise.resolve(
        rows(
          storage,
          "SELECT reports.* FROM reports JOIN alerts ON alerts.report_id = reports.id WHERE reports.closed_at IS NOT NULL ORDER BY reports.created_at",
        ).map(toReport),
      ),
    saveTriage: (id, triage) => {
      storage.transactionSync(() => {
        const report = reportOf(id);
        if (report && !report.closed) writeReport({ ...report, triage });
      });
      return done();
    },
    saveAuthorityAlert(reportId, alert) {
      const saved = storage.transactionSync(() => {
        if (
          !first(
            storage,
            "SELECT 1 AS hit FROM reports WHERE id = ?",
            reportId,
          ) ||
          alertOf(reportId)
        )
          return false;
        writeAlert(reportId, alert);
        return true;
      });
      if (saved) onPending();
      return Promise.resolve(saved);
    },
    markAlertNotified: (reportId, at) => {
      run(
        storage,
        "UPDATE alerts SET notified_at = ? WHERE report_id = ?",
        at.getTime(),
        reportId,
      );
      return done();
    },
    pendingAlerts: () =>
      Promise.resolve(
        rows(
          storage,
          "SELECT * FROM alerts WHERE notified_at IS NULL ORDER BY raised_at",
        ).map((row) => {
          const alert = toAlert(row);
          return {
            reportId: textOf(row, "report_id"),
            offenceCategory: alert.offenceCategory,
            raisedAt: alert.raisedAt,
          };
        }),
      ),
    recordFiling: (reportId, channel, reference, at) =>
      Promise.resolve(
        storage.transactionSync(() => {
          const alert = alertOf(reportId);
          if (!alert) return "noAlert" as const;
          if (alert.status === "filed") return "alreadyFiled" as const;
          writeAlert(reportId, {
            ...alert,
            status: "filed",
            channel,
            reference,
            filedAt: at,
          });
          return "filed" as const;
        }),
      ),
    savePendingDecisionMail(mail) {
      run(
        storage,
        "INSERT OR REPLACE INTO pending_mails (id, report_id, email, text, created_at) VALUES (?, ?, ?, ?, ?)",
        mail.id,
        mail.reportId,
        mail.email,
        mail.text,
        mail.createdAt.getTime(),
      );
      onPending();
      return done();
    },
    pendingDecisionMails: () =>
      Promise.resolve(
        rows(storage, "SELECT * FROM pending_mails ORDER BY created_at").map(
          (row): PendingDecisionMail => ({
            id: textOf(row, "id"),
            reportId: textOf(row, "report_id"),
            email: textOf(row, "email"),
            text: textOf(row, "text"),
            createdAt: dateOf(row, "created_at"),
          }),
        ),
      ),
    deletePendingDecisionMail: (id) => {
      run(storage, "DELETE FROM pending_mails WHERE id = ?", id);
      return done();
    },
    savePendingStatement(statement) {
      run(
        storage,
        "INSERT OR REPLACE INTO pending_statements (id, email, text, give_up_at) VALUES (?, ?, ?, ?)",
        statement.id,
        statement.email,
        statement.text,
        statement.giveUpAt.getTime(),
      );
      onPending();
      return done();
    },
    pendingStatements: () =>
      Promise.resolve(
        rows(
          storage,
          "SELECT * FROM pending_statements ORDER BY give_up_at",
        ).map((row): PendingStatement => ({
          id: textOf(row, "id"),
          email: textOf(row, "email"),
          text: textOf(row, "text"),
          giveUpAt: dateOf(row, "give_up_at"),
        })),
      ),
    deletePendingStatement: (id) => {
      run(storage, "DELETE FROM pending_statements WHERE id = ?", id);
      return done();
    },
    saveBan: (ban) => {
      run(
        storage,
        "INSERT OR REPLACE INTO bans (id, ip_keyed_hash, pseudo_keyed_hash, until, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?)",
        ban.id,
        ban.ipKeyedHash ?? null,
        ban.pseudoKeyedHash ?? null,
        ban.until.getTime(),
        ban.decidedBy,
        ban.decidedAt.getTime(),
      );
      return done();
    },
    activeBan(ipKeyedHash, pseudoKeyedHash, now) {
      const row = first(
        storage,
        "SELECT * FROM bans WHERE until > ? AND (ip_keyed_hash = ? OR pseudo_keyed_hash = ?) ORDER BY until DESC LIMIT 1",
        now.getTime(),
        ipKeyedHash,
        pseudoKeyedHash,
      );
      return Promise.resolve(row && toBan(row));
    },
    purgeExpired(now) {
      const time = now.getTime();
      storage.transactionSync(() => {
        const expired = rows(
          storage,
          "SELECT reports.id FROM reports LEFT JOIN alerts ON alerts.report_id = reports.id WHERE reports.closed_at IS NOT NULL AND reports.closed_at + (CASE WHEN alerts.report_id IS NULL THEN ? ELSE ? END) <= ?",
          MODERATION_LIMITS.closedReportMs,
          MODERATION_LIMITS.alertedReportMs,
          time,
        );
        for (const row of expired) {
          const id = textOf(row, "id");
          run(storage, "DELETE FROM alerts WHERE report_id = ?", id);
          run(storage, "DELETE FROM reports WHERE id = ?", id);
        }
        run(
          storage,
          "DELETE FROM bans WHERE until + ? <= ?",
          MODERATION_LIMITS.expiredBanMs,
          time,
        );
        // BR-076, BR-107: a mail past its give-up time goes even when a retry round cannot read it.
        run(
          storage,
          "DELETE FROM pending_statements WHERE give_up_at <= ?",
          time,
        );
        run(
          storage,
          "DELETE FROM pending_mails WHERE created_at <= ?",
          time - MAIL_GIVE_UP_MS,
        );
      });
      return done();
    },
  });
};

const toModerator = (row: SqlRow): StoredModerator => ({
  nameKeyedHash: textOf(row, "name_keyed_hash"),
  credentialKeyedHash: textOf(row, "credential_keyed_hash"),
  name: textOf(row, "name"),
  credentialId: textOf(row, "credential_id"),
  publicKey: textOf(row, "public_key"),
  signCount: int(row, "sign_count") ?? 0,
});

const toInvitation = (row: SqlRow): StoredInvitation => ({
  tokenHash: textOf(row, "token_hash"),
  nameKeyedHash: textOf(row, "name_keyed_hash"),
  name: textOf(row, "name"),
  expiresAt: dateOf(row, "expires_at"),
});

/** Moderators and invitations (BR-099, `moderation/04`), the SQLite twin of the Node moderator stores. */
export const createSqlModeratorStore = (
  storage: SqlStorage,
): ModeratorStore => {
  const valid = (tokenHash: string, now: Date) => {
    const row = first(
      storage,
      "SELECT * FROM invitations WHERE token_hash = ? AND expires_at > ?",
      tokenHash,
      now.getTime(),
    );
    return row && toInvitation(row);
  };
  return rejecting({
    saveInvitation: (invitation) => {
      run(
        storage,
        "INSERT OR REPLACE INTO invitations (token_hash, name_keyed_hash, name, expires_at) VALUES (?, ?, ?, ?)",
        invitation.tokenHash,
        invitation.nameKeyedHash,
        invitation.name,
        invitation.expiresAt.getTime(),
      );
      return done();
    },
    findInvitation: (tokenHash, now) => Promise.resolve(valid(tokenHash, now)),
    enrollModerator: (tokenHash, moderator, now) =>
      Promise.resolve(
        storage.transactionSync(() => {
          if (!valid(tokenHash, now)) return false;
          run(
            storage,
            "DELETE FROM invitations WHERE token_hash = ?",
            tokenHash,
          );
          // BR-094: replaces any moderator with the same name, and any row holding this credential.
          run(
            storage,
            "DELETE FROM moderators WHERE name_keyed_hash = ? OR credential_keyed_hash = ?",
            moderator.nameKeyedHash,
            moderator.credentialKeyedHash,
          );
          run(
            storage,
            "INSERT INTO moderators (name_keyed_hash, credential_keyed_hash, name, credential_id, public_key, sign_count) VALUES (?, ?, ?, ?, ?, ?)",
            moderator.nameKeyedHash,
            moderator.credentialKeyedHash,
            moderator.name,
            moderator.credentialId,
            moderator.publicKey,
            moderator.signCount,
          );
          return true;
        }),
      ),
    findByCredential(hash) {
      const row = first(
        storage,
        "SELECT * FROM moderators WHERE credential_keyed_hash = ?",
        hash,
      );
      return Promise.resolve(row && toModerator(row));
    },
    updateSignCount: (hash, count) => {
      run(
        storage,
        "UPDATE moderators SET sign_count = ? WHERE credential_keyed_hash = ?",
        count,
        hash,
      );
      return done();
    },
    deleteModerator: (nameKeyedHash) =>
      Promise.resolve(
        storage.transactionSync(() => {
          const found =
            rows(
              storage,
              "SELECT 1 AS hit FROM moderators WHERE name_keyed_hash = ? UNION ALL SELECT 1 AS hit FROM invitations WHERE name_keyed_hash = ?",
              nameKeyedHash,
              nameKeyedHash,
            ).length > 0;
          run(
            storage,
            "DELETE FROM moderators WHERE name_keyed_hash = ?",
            nameKeyedHash,
          );
          run(
            storage,
            "DELETE FROM invitations WHERE name_keyed_hash = ?",
            nameKeyedHash,
          );
          return found;
        }),
      ),
    purgeExpiredInvitations: (now) => {
      run(
        storage,
        "DELETE FROM invitations WHERE expires_at <= ?",
        now.getTime(),
      );
      return done();
    },
  });
};
