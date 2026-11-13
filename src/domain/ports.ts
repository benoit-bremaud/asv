/**
 * Ports the hub calls; transports implement them (`platform/03`, `platform/04c`).
 * Types only, so the domain stays pure.
 */

/** One line per socket connection, opened on entry or resume (BR-060). */
export interface ConnectionLine {
  readonly connectionId: string;
  readonly ip: string;
  readonly port?: number;
  readonly protocols: string;
  readonly pseudo: string;
  readonly accountId?: string;
  readonly openedAt: Date;
}

/** One line per created content, never the content itself (BR-060). */
export interface ContributionLine {
  readonly connectionId: string;
  readonly protocols: string;
  readonly at: Date;
}

/** Legal connection and contribution log (BR-060, ADR-0014); every write may fail. */
export interface ConnectionLogStore {
  open(line: ConnectionLine): Promise<void>;
  close(connectionId: string, at: Date): Promise<void>;
  appendContribution(line: ContributionLine): Promise<void>;
}

/**
 * An account as stored: the e-mail is ciphertext and is found by its keyed hash (ADR-0017, `accounts/04`).
 * Strikes stay clear: dates only.
 */
export interface StoredAccount {
  readonly id: string;
  readonly email: string;
  readonly emailKeyedHash: string;
  readonly verifiedAt: Date;
  readonly lastSeenAt: Date;
  readonly strikes: readonly { readonly expiresAt: Date }[];
}

/**
 * A report as stored (`moderation/04`): excerpt, context and pseudos are ciphertext, the target IP a keyed
 * hash (ADR-0017). Ids, reason, kinds and dates stay clear.
 */
export interface StoredReport {
  readonly id: string;
  readonly reason: "harassment" | "seemsMinor" | "spam" | "illegalContent" | "other";
  readonly targetKind: "chatter" | "message" | "room";
  readonly targetPseudo?: string;
  readonly targetRoomId?: string;
  readonly targetSessionId?: string;
  readonly targetAccountId?: string;
  readonly targetIpKeyedHash?: string;
  readonly excerpt: string;
  /** Ciphertext of the JSON array of context lines. */
  readonly context: string;
  readonly authorPseudo: string;
  readonly createdAt: Date;
  /** Set once a warning on this report gave its strike, so a repeated `warned` adds none (BR-074). */
  readonly struckAt?: Date;
  readonly closed?: {
    readonly outcome: "noAction" | "warned" | "expelled" | "suspended";
    readonly by: string;
    readonly at: Date;
  };
}

/** A ban as stored: keyed hashes of the IP and of the folded pseudo (BR-053, BR-055, ADR-0017). */
export interface StoredBan {
  readonly id: string;
  readonly ipKeyedHash?: string;
  /** Keyed hash of the folded pseudo, to match at entry. */
  readonly pseudoKeyedHash?: string;
  readonly until: Date;
  readonly decidedBy: string;
  readonly decidedAt: Date;
}

/** Reports and bans (`moderation/04`); every call may fail. */
export interface ModerationStore {
  saveReport(report: StoredReport): Promise<void>;
  findReport(id: string): Promise<StoredReport | undefined>;
  openReports(): Promise<readonly StoredReport[]>;
  saveBan(ban: StoredBan): Promise<void>;
  /** The latest-ending ban matching either key and still running at `now`. */
  activeBan(ipKeyedHash: string, pseudoKeyedHash: string, now: Date): Promise<StoredBan | undefined>;
  /** BR-061: closed reports after 6 months; BR-062: bans 30 days after their end. */
  purgeExpired(now: Date): Promise<void>;
}

/** An enrolled moderator (`moderation/04`, BR-099): name, credential id and key encrypted, looked up by keyed hash. */
export interface StoredModerator {
  /** Keyed hash of the lower-cased name (BR-094). */
  readonly nameKeyedHash: string;
  /** Keyed hash of the credential id, for sign-in. */
  readonly credentialKeyedHash: string;
  readonly name: string;
  readonly credentialId: string;
  readonly publicKey: string;
  readonly signCount: number;
}

/** A pending invitation (BR-056, BR-099): SHA-256 of the token, encrypted name. */
export interface StoredInvitation {
  readonly tokenHash: string;
  readonly nameKeyedHash: string;
  readonly name: string;
  readonly expiresAt: Date;
}

/** Moderators and invitations (`moderation/04`); every call may fail. */
export interface ModeratorStore {
  saveInvitation(invitation: StoredInvitation): Promise<void>;
  /** The invitation if still valid at `now`, without consuming it. */
  findInvitation(tokenHash: string, now: Date): Promise<StoredInvitation | undefined>;
  /** Deletes it and returns it if still valid at `now`. */
  consumeInvitation(tokenHash: string, now: Date): Promise<StoredInvitation | undefined>;
  /** Saves it, replacing any moderator with the same name hash (BR-094). */
  saveModerator(moderator: StoredModerator): Promise<void>;
  findByCredential(credentialKeyedHash: string): Promise<StoredModerator | undefined>;
  updateSignCount(credentialKeyedHash: string, count: number): Promise<void>;
  /** Deletes the moderator and its pending invitations; false when nothing matched (BR-094). */
  deleteModerator(nameKeyedHash: string): Promise<boolean>;
  purgeExpiredInvitations(now: Date): Promise<void>;
}

/** A sign-in code waiting for its session (BR-070); e-mail encrypted, code keyed-hashed. */
export interface StoredCode {
  readonly sessionId: string;
  readonly codeHash: string;
  readonly email: string;
  readonly emailKeyedHash: string;
  readonly remember: boolean;
  readonly triesLeft: number;
  readonly expiresAt: Date;
}

/** A remembered device: only the token hash is kept (BR-073). */
export interface DeviceRecord {
  readonly tokenHash: string;
  readonly accountId: string;
  readonly expiresAt: Date;
}

/** Codes issued in the quota window (BR-072). */
export interface CodeCounts {
  readonly email: number;
  readonly ip: number;
  readonly lastEmailCodeAt?: Date;
  /** Wrong codes for the e-mail over `ACCOUNT_LIMITS.wrongTryWindowMs` (BR-072). */
  readonly wrongTries: number;
}

/** Account records (`accounts/04`); values arrive already encrypted or hashed. Every call may fail. */
export interface AccountStore {
  saveCode(code: StoredCode): Promise<void>;
  loadCode(sessionId: string): Promise<StoredCode | undefined>;
  deleteCode(sessionId: string): Promise<void>;
  recordCodeIssued(emailKeyedHash: string, ipKeyedHash: string, at: Date): Promise<void>;
  recordWrongTry(emailKeyedHash: string, at: Date): Promise<void>;
  /** Codes over `quotaWindowMs` and wrong tries over `wrongTryWindowMs`, both ending at `now`. */
  codeCounts(emailKeyedHash: string, ipKeyedHash: string, now: Date): Promise<CodeCounts>;
  findAccountByEmailHash(emailKeyedHash: string): Promise<StoredAccount | undefined>;
  findAccountById(accountId: string): Promise<StoredAccount | undefined>;
  saveAccount(account: StoredAccount): Promise<void>;
  deleteAccount(accountId: string): Promise<void>;
  saveDevice(device: DeviceRecord): Promise<void>;
  accountForDevice(tokenHash: string, now: Date): Promise<StoredAccount | undefined>;
  deleteDevice(tokenHash: string): Promise<void>;
  deleteAllDevices(accountId: string): Promise<void>;
  /** Written by a suspension (BR-077); sign-in reads it. */
  blockEmail(emailKeyedHash: string, until: Date): Promise<void>;
  isBlocked(emailKeyedHash: string, now: Date): Promise<boolean>;
  loadCarryOver(emailKeyedHash: string): Promise<readonly Date[] | undefined>;
  saveCarryOver(emailKeyedHash: string, strikeExpiries: readonly Date[]): Promise<void>;
  deleteCarryOver(emailKeyedHash: string): Promise<void>;
  purgeExpired(now: Date): Promise<void>;
}

/** A legal retention record; the e-mail is sealed to the owner key (BR-081, ADR-0017). */
export interface VaultEntry {
  readonly accountId: string;
  readonly sealedEmail: string;
  readonly createdAt: Date;
  readonly closedAt: Date;
}

/** What the vault learns when an account is created: everything but the closing date (BR-084). */
export type VaultOpening = Omit<VaultEntry, "closedAt">;

/** Write-only legal vault (ADR-0014): no read operation exists for the application. */
export interface LegalVaultStore {
  record(entry: VaultEntry): Promise<void>;
  /** Only stores that outlive the account store implement it (file vault of ADR-0018). */
  opened?(entry: VaultOpening): Promise<void>;
  purgeExpired(now: Date): Promise<void>;
}

/** Transactional mail (ADR-0013 amendment): the brasse-bouillon `MailerService` port. */
export interface Mailer {
  /** Never rejects: a failure is logged by the adapter. */
  sendCode(email: string, code: string): Promise<void>;
  /** Resolves `true` only when the provider accepted the mail (BR-076). */
  sendStatementOfReasons(email: string, statement: string): Promise<boolean>;
}
