import {
  ACCOUNT_LIMITS,
  type AccountStore,
  type CodeCounts,
  type DeviceRecord,
  type LegalVaultStore,
  type StoredAccount,
  type StoredCode,
  type VaultEntry,
} from "../../domain";

interface Issued {
  readonly emailKeyedHash: string;
  readonly ipKeyedHash: string;
  readonly at: Date;
}

/**
 * In-memory account store of the Node transport (ADR-0017 scope): values arrive already encrypted or
 * hashed, and die with the process. Brick 9 adds the Durable Object SQLite twin.
 */
export const createMemoryAccountStore = (): AccountStore & {
  /** Test hook: what is stored, to check nothing is in clear. */
  dump(): { accounts: StoredAccount[]; codes: StoredCode[]; devices: DeviceRecord[] };
  /** Moderation writes blocks in brick 8; tests add them here. */
  block(emailKeyedHash: string, until: Date): void;
} => {
  const codes = new Map<string, StoredCode>();
  const accounts = new Map<string, StoredAccount>();
  const devices = new Map<string, DeviceRecord>();
  const blocks = new Map<string, Date>();
  const carryOvers = new Map<string, readonly Date[]>();
  let issued: Issued[] = [];
  let wrongTries: { readonly emailKeyedHash: string; readonly at: Date }[] = [];
  /** The ports are async; a Map answers at once. */
  const done = (): Promise<void> => Promise.resolve();
  const byEmailHash = (hash: string) => [...accounts.values()].find((account) => account.emailKeyedHash === hash);

  return {
    saveCode: (code) => {
      codes.set(code.sessionId, code);
      return done();
    },
    loadCode: (sessionId) => Promise.resolve(codes.get(sessionId)),
    deleteCode: (sessionId) => {
      codes.delete(sessionId);
      return done();
    },
    recordCodeIssued: (emailKeyedHash, ipKeyedHash, at) => {
      issued.push({ emailKeyedHash, ipKeyedHash, at });
      return done();
    },
    recordWrongTry: (emailKeyedHash, at) => {
      wrongTries.push({ emailKeyedHash, at });
      return done();
    },
    codeCounts(emailKeyedHash, ipKeyedHash, now): Promise<CodeCounts> {
      const since = now.getTime() - ACCOUNT_LIMITS.quotaWindowMs;
      const daySince = now.getTime() - ACCOUNT_LIMITS.wrongTryWindowMs;
      const recent = issued.filter((entry) => entry.at.getTime() > since);
      const forEmail = recent.filter((entry) => entry.emailKeyedHash === emailKeyedHash);
      return Promise.resolve({
        email: forEmail.length,
        ip: recent.filter((entry) => entry.ipKeyedHash === ipKeyedHash).length,
        lastEmailCodeAt: forEmail.at(-1)?.at,
        wrongTries: wrongTries.filter((entry) => entry.emailKeyedHash === emailKeyedHash && entry.at.getTime() > daySince).length,
      });
    },
    findAccountByEmailHash: (hash) => Promise.resolve(byEmailHash(hash)),
    findAccountById: (accountId) => Promise.resolve(accounts.get(accountId)),
    saveAccount: (account) => {
      accounts.set(account.id, account);
      return done();
    },
    deleteAccount: (accountId) => {
      accounts.delete(accountId);
      return done();
    },
    saveDevice: (device) => {
      devices.set(device.tokenHash, device);
      return done();
    },
    accountForDevice(tokenHash, now) {
      const device = devices.get(tokenHash);
      return Promise.resolve(device && device.expiresAt.getTime() > now.getTime() ? accounts.get(device.accountId) : undefined);
    },
    deleteDevice: (tokenHash) => {
      devices.delete(tokenHash);
      return done();
    },
    deleteAllDevices(accountId) {
      for (const [hash, device] of devices) if (device.accountId === accountId) devices.delete(hash);
      return done();
    },
    isBlocked: (hash, now) => Promise.resolve((blocks.get(hash)?.getTime() ?? 0) > now.getTime()),
    loadCarryOver: (hash) => Promise.resolve(carryOvers.get(hash)),
    saveCarryOver: (hash, expiries) => {
      carryOvers.set(hash, expiries);
      return done();
    },
    deleteCarryOver: (hash) => {
      carryOvers.delete(hash);
      return done();
    },
    purgeExpired(now) {
      const time = now.getTime();
      for (const [key, code] of codes) if (code.expiresAt.getTime() <= time) codes.delete(key);
      for (const [key, device] of devices) if (device.expiresAt.getTime() <= time) devices.delete(key);
      for (const [key, until] of blocks) if (until.getTime() <= time) blocks.delete(key);
      for (const [key, expiries] of carryOvers) if (expiries.every((at) => at.getTime() <= time)) carryOvers.delete(key);
      issued = issued.filter((entry) => entry.at.getTime() > time - ACCOUNT_LIMITS.quotaWindowMs);
      wrongTries = wrongTries.filter((entry) => entry.at.getTime() > time - ACCOUNT_LIMITS.wrongTryWindowMs);
      return done();
    },
    dump: () => ({ accounts: [...accounts.values()], codes: [...codes.values()], devices: [...devices.values()] }),
    block: (hash, until) => {
      blocks.set(hash, until);
    },
  };
};

/** In-memory legal vault (ADR-0014): write-only for the application, `entries()` exists for tests only. */
export const createMemoryVault = (): LegalVaultStore & { entries(): readonly VaultEntry[] } => {
  let entries: VaultEntry[] = [];
  return {
    record: (entry) => {
      entries.push(entry);
      return Promise.resolve();
    },
    purgeExpired(now) {
      const time = now.getTime();
      entries = entries
        .filter((entry) => entry.closedAt.getTime() + ACCOUNT_LIMITS.vaultRetentionMs > time)
        .map((entry) => (entry.closedAt.getTime() + ACCOUNT_LIMITS.vaultIdentityMs > time ? entry : { ...entry, accountId: "" }));
      return Promise.resolve();
    },
    entries: () => [...entries],
  };
};
