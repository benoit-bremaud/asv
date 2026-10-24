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
  /** Blocks are written by moderation (brick 8); sign-in only reads them (BR-077). */
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
