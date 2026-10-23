/**
 * Account storage seen through the crypto of ADR-0017 (`accounts/02`, `platform/04d`): the hub hands
 * clear values to the domain, and only ciphertext, keyed hashes and sealed values reach the stores.
 */
import {
  ACCOUNT_LIMITS,
  type Account,
  type AccountStore,
  type CodeRequestFacts,
  type LegalVaultStore,
  type StoredAccount,
  type StoredCode,
  type StrikeCarryOver,
  type VaultRecord,
} from "../domain";
import type { Crypto } from "./crypto/cipher";

/** The ports `AccountIo` wraps: the store and the vault never see a clear e-mail or code. */
export interface AccountIoDeps {
  readonly store: AccountStore;
  readonly vault: LegalVaultStore;
  readonly crypto: Crypto;
}

/** A pending code with its e-mail decrypted. */
export interface PendingCode {
  readonly stored: StoredCode;
  readonly email: string;
}

/** What the hub learns about an e-mail before `linkAccount`. */
export interface LinkFacts {
  readonly emailKeyedHash: string;
  readonly existing?: Account;
  readonly carryOver?: StrikeCarryOver;
  readonly blocked: boolean;
}

const emailContext = (id: string) => `account:${id}:email`;
const codeContext = (sessionId: string) => `code:${sessionId}:email`;

/** Constant-time comparison of two hashes of equal length (BR-070), so timing reveals no matching prefix. */
const sameHash = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= (a.codePointAt(index) ?? 0) ^ (b.codePointAt(index) ?? 0);
  return diff === 0;
};

/**
 * Builds the crypto boundary of `platform/04d`. Every method lets store and crypto errors propagate; the hub
 * answers `warning unavailable` and reports them.
 */
export const createAccountIo = ({ store, vault, crypto }: AccountIoDeps) => {
  const toAccount = async (stored: StoredAccount): Promise<Account> => ({
    id: stored.id,
    email: await crypto.decrypt(stored.email, emailContext(stored.id)),
    verifiedAt: stored.verifiedAt,
    lastSeenAt: stored.lastSeenAt,
    strikes: stored.strikes,
  });
  // The session id is mixed in, so one code typed in two sessions hashes differently.
  const codeHash = (sessionId: string, code: string) => crypto.keyedHash(`code:${sessionId}:${code}`);

  return {
    /** Keyed hashes and quota counts for `decideCodeRequest`. */
    async codeFacts(email: string, ip: string, now: Date) {
      const ipKeyedHash = await crypto.keyedHash(`ip:${ip}`);
      const emailKeyedHash = await crypto.keyedHash(email);
      const counts = await store.codeCounts(emailKeyedHash, ipKeyedHash, now);
      const facts: CodeRequestFacts = {
        email,
        blocked: await store.isBlocked(emailKeyedHash, now),
        emailCodesLastHour: counts.email,
        ipCodesLastHour: counts.ip,
        lastCodeAt: counts.lastEmailCodeAt,
        wrongTriesLastDay: counts.wrongTries,
      };
      return { facts, emailKeyedHash, ipKeyedHash };
    },

    async saveIssued(input: {
      sessionId: string;
      email: string;
      emailKeyedHash: string;
      ipKeyedHash: string;
      code: string;
      remember: boolean;
      expiresAt: Date;
      now: Date;
    }): Promise<void> {
      await store.saveCode({
        sessionId: input.sessionId,
        codeHash: await codeHash(input.sessionId, input.code),
        email: await crypto.encrypt(input.email, codeContext(input.sessionId)),
        emailKeyedHash: input.emailKeyedHash,
        remember: input.remember,
        triesLeft: ACCOUNT_LIMITS.codeTries,
        expiresAt: input.expiresAt,
      });
      await store.recordCodeIssued(input.emailKeyedHash, input.ipKeyedHash, input.now);
    },

    async loadPending(sessionId: string): Promise<PendingCode | undefined> {
      const stored = await store.loadCode(sessionId);
      return stored && { stored, email: await crypto.decrypt(stored.email, codeContext(sessionId)) };
    },

    async codeMatches(pending: PendingCode, code: string): Promise<boolean> {
      return sameHash(await codeHash(pending.stored.sessionId, code), pending.stored.codeHash);
    },

    saveTries: (pending: PendingCode, triesLeft: number) => store.saveCode({ ...pending.stored, triesLeft }),
    /** BR-072: every wrong code counts against the e-mail, whatever session typed it. */
    recordWrongTry: (pending: PendingCode, now: Date) => store.recordWrongTry(pending.stored.emailKeyedHash, now),
    deleteCode: (sessionId: string) => store.deleteCode(sessionId),

    async linkFacts(pending: PendingCode, now: Date): Promise<LinkFacts> {
      const { emailKeyedHash } = pending.stored;
      const existing = await store.findAccountByEmailHash(emailKeyedHash);
      const expiries = existing ? undefined : await store.loadCarryOver(emailKeyedHash);
      return {
        emailKeyedHash,
        existing: existing && (await toAccount(existing)),
        carryOver: expiries && { strikeExpiries: expiries },
        blocked: await store.isBlocked(emailKeyedHash, now),
      };
    },

    async saveAccount(account: Account, emailKeyedHash: string, created: boolean): Promise<void> {
      await store.saveAccount({
        id: account.id,
        email: await crypto.encrypt(account.email, emailContext(account.id)),
        emailKeyedHash,
        verifiedAt: account.verifiedAt,
        lastSeenAt: account.lastSeenAt,
        strikes: account.strikes,
      });
      if (created) await store.deleteCarryOver(emailKeyedHash);
    },

    async accountById(accountId: string): Promise<{ account: Account; emailKeyedHash: string } | undefined> {
      const stored = await store.findAccountById(accountId);
      return stored && { account: await toAccount(stored), emailKeyedHash: stored.emailKeyedHash };
    },

    accountExists: async (accountId: string): Promise<boolean> => (await store.findAccountById(accountId)) !== undefined,
    accountForDevice: (tokenHash: string, now: Date) => store.accountForDevice(tokenHash, now),
    saveDevice: (tokenHash: string, accountId: string, expiresAt: Date) => store.saveDevice({ tokenHash, accountId, expiresAt }),
    deleteDevice: (tokenHash: string) => store.deleteDevice(tokenHash),
    deleteAllDevices: (accountId: string) => store.deleteAllDevices(accountId),

    /**
     * UC19, BR-081: the vault record is written first; if it fails nothing is deleted. Brick 9 runs both in
     * one storage transaction.
     */
    async close(record: VaultRecord, emailKeyedHash: string, carryOver: StrikeCarryOver | undefined): Promise<void> {
      await vault.record({
        accountId: record.accountId,
        sealedEmail: await crypto.seal(record.email),
        createdAt: record.createdAt,
        closedAt: record.closedAt,
      });
      await store.deleteAccount(record.accountId);
      await store.deleteAllDevices(record.accountId);
      if (carryOver) await store.saveCarryOver(emailKeyedHash, carryOver.strikeExpiries);
    },

    async purgeExpired(now: Date): Promise<void> {
      await store.purgeExpired(now);
      await vault.purgeExpired(now);
    },
  };
};

/** The account boundary the hub depends on. */
export type AccountIo = ReturnType<typeof createAccountIo>;
